-- RefugiART: correcao da liquidacao, vinculo financeiro-pedido e liberacao idempotente.
-- Requer migrations 001, 003 e 004 aplicadas previamente.
begin;

-- O lance vencedor nao inclui frete automaticamente. Mantem o frete explicitamente
-- pendente de cotacao, em vez de apresentar o valor zero como frete gratis.
alter table public.refugiart_orders
  add column if not exists shipping_status text not null default 'pending_quote'
  check (shipping_status in ('pending_quote','quoted','paid','waived'));

-- Permite rastrear cada movimento financeiro ate o pedido correspondente.
alter table public.refugiart_wallet_transactions
  add column if not exists related_order_id bigint
  references public.refugiart_orders(id) on delete set null;

create index if not exists refugiart_wallet_transactions_order_idx
  on public.refugiart_wallet_transactions(related_order_id)
  where related_order_id is not null;

-- Calcula dias uteis no calendario civil brasileiro, preservando o horario local.
create or replace function public.refugiart_add_business_days(
  p_start timestamptz,
  p_days integer
) returns timestamptz
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_local timestamp;
  v_date date;
  v_added integer := 0;
begin
  if p_start is null or p_days is null or p_days < 0 then
    raise exception 'Data inicial ou quantidade de dias uteis invalida.';
  end if;

  v_local := p_start at time zone 'America/Sao_Paulo';
  v_date := v_local::date;

  while v_added < p_days loop
    v_date := v_date + 1;
    if extract(isodow from v_date) < 6
       and not exists (
         select 1 from public.refugiart_business_holidays h
         where h.holiday_date = v_date
       ) then
      v_added := v_added + 1;
    end if;
  end loop;

  return (v_date + v_local::time) at time zone 'America/Sao_Paulo';
end;
$$;

revoke all on function public.refugiart_add_business_days(timestamptz,integer)
  from public, anon, authenticated;
grant execute on function public.refugiart_add_business_days(timestamptz,integer)
  to service_role;

-- Substitui integralmente a liquidacao anterior.
create or replace function public.refugiart_close_expired_auctions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_winner public.refugiart_auction_bids%rowtype;
  v_res public.refugiart_auction_reservations%rowtype;
  v_post public.atelie_posts%rowtype;
  v_order_id bigint;
  v_rows integer;
  v_count integer := 0;
begin
  for a in
    select *
    from public.refugiart_auctions
    where status = 'active'
      and ends_at <= clock_timestamp()
    order by ends_at, id
    for update skip locked
  loop
    select * into v_winner
    from public.refugiart_auction_bids
    where auction_id = a.id
    order by amount desc, created_at asc, id asc
    limit 1;

    if v_winner.id is not null then
      select * into v_res
      from public.refugiart_auction_reservations
      where auction_id = a.id
        and user_id = v_winner.user_id
        and status = 'active'
      for update;

      if not found or v_res.amount < v_winner.amount then
        raise exception 'Reserva financeira inconsistente no leilao %.', a.id;
      end if;

      select * into v_post
      from public.atelie_posts
      where id = a.post_id
      for update;

      if not found or v_post.moderation_status <> 'published' then
        raise exception 'A obra do leilao % nao esta publicada.', a.id;
      end if;

      -- Bloqueia as duas carteiras em ordem deterministica para reduzir deadlocks.
      perform 1
      from public.refugiart_wallets
      where user_id in (a.artist_id, v_winner.user_id)
      order by user_id
      for update;

      get diagnostics v_rows = row_count;
      if v_rows <> 2 then
        raise exception 'Carteira do comprador ou artista nao encontrada no leilao %.', a.id;
      end if;

      -- Captura somente a reserva do comprador. O artista recebe em pendencia.
      update public.refugiart_wallets
      set reserved_balance = reserved_balance - v_winner.amount,
          updated_at = clock_timestamp()
      where user_id = v_winner.user_id
        and reserved_balance >= v_winner.amount;

      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'Saldo reservado insuficiente para liquidar o leilao %.', a.id;
      end if;

      update public.refugiart_wallets
      set pending_balance = pending_balance + v_winner.amount,
          updated_at = clock_timestamp()
      where user_id = a.artist_id;

      update public.refugiart_auction_reservations
      set status = 'captured', updated_at = clock_timestamp()
      where id = v_res.id and status = 'active';

      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'Nao foi possivel capturar a reserva do vencedor no leilao %.', a.id;
      end if;

      -- Pedido, item e remessa nascem na mesma transacao da captura.
      insert into public.refugiart_orders(
        buyer_id, seller_id, status, subtotal, shipping_amount, total_amount,
        paid_at, shipment_due_at, auction_id
      ) values (
        v_winner.user_id, a.artist_id, 'awaiting_shipment',
        v_winner.amount, 0, v_winner.amount,
        clock_timestamp(),
        public.refugiart_add_business_days(clock_timestamp(), 3),
        a.id
      ) returning id into v_order_id;

      insert into public.refugiart_order_items(
        order_id, post_id, title_snapshot, unit_price, quantity
      ) values (
        v_order_id, a.post_id,
        coalesce(nullif(btrim(v_post.caption), ''), 'Obra RefugiART #' || a.post_id),
        v_winner.amount, 1
      );

      insert into public.refugiart_shipments(order_id, status)
      values (v_order_id, 'awaiting_post');

      insert into public.refugiart_wallet_transactions(
        user_id, transaction_type, direction, amount, status, idempotency_key,
        related_user_id, related_post_id, related_auction_id, related_order_id,
        description, confirmed_at
      ) values
      (
        v_winner.user_id, 'purchase', 'debit', v_winner.amount, 'confirmed',
        'auction-capture-buyer:' || a.id,
        a.artist_id, a.post_id, a.id, v_order_id,
        'Valor capturado do vencedor do leilao', clock_timestamp()
      ),
      (
        a.artist_id, 'sale', 'credit', v_winner.amount, 'pending',
        'auction-capture-seller:' || a.id,
        v_winner.user_id, a.post_id, a.id, v_order_id,
        'Venda em leilao aguardando comprovacao de postagem', null
      );

      -- Libera exclusivamente reservas que ainda estao ativas.
      -- Cada reserva gera seu ledger dentro do mesmo loop/transacao.
      for v_res in
        select *
        from public.refugiart_auction_reservations
        where auction_id = a.id
          and status = 'active'
          and user_id <> v_winner.user_id
        order by user_id
        for update
      loop
        update public.refugiart_wallets
        set available_balance = available_balance + v_res.amount,
            reserved_balance = reserved_balance - v_res.amount,
            updated_at = clock_timestamp()
        where user_id = v_res.user_id
          and reserved_balance >= v_res.amount;

        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          raise exception 'Reserva inconsistente para participante % no leilao %.',
            v_res.user_id, a.id;
        end if;

        update public.refugiart_auction_reservations
        set status = 'released', updated_at = clock_timestamp()
        where id = v_res.id and status = 'active';

        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          raise exception 'Falha ao liberar reserva %.', v_res.id;
        end if;

        insert into public.refugiart_wallet_transactions(
          user_id, transaction_type, direction, amount, status, idempotency_key,
          related_post_id, related_auction_id, related_order_id,
          description, confirmed_at
        ) values (
          v_res.user_id, 'auction_release', 'credit', v_res.amount, 'confirmed',
          'auction-release-close:' || a.id || ':' || v_res.user_id,
          a.post_id, a.id, v_order_id,
          'Reserva liberada no encerramento do leilao', clock_timestamp()
        );
      end loop;

      update public.refugiart_auctions
      set status = 'finished',
          closed_at = clock_timestamp(),
          winning_user_id = v_winner.user_id,
          winning_bid = v_winner.amount
      where id = a.id;

      update public.atelie_posts
      set auction_status = 'finished'
      where id = a.post_id;

    else
      update public.refugiart_auctions
      set status = 'finished',
          closed_at = clock_timestamp(),
          winning_user_id = null,
          winning_bid = null
      where id = a.id;

      update public.atelie_posts
      set auction_status = 'finished'
      where id = a.post_id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.refugiart_close_expired_auctions()
  from public, anon, authenticated;
grant execute on function public.refugiart_close_expired_auctions()
  to service_role;

commit;
