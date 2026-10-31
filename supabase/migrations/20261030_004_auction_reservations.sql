-- Operacoes atomicas de reserva, lance e liquidacao de leiloes.
-- Esta migration NAO libera lances na interface. Validar em ambiente de teste antes.
begin;

-- Pedido unico para cada leilao liquidado internamente pela carteira.
alter table public.refugiart_orders
  add column if not exists auction_id bigint
  references public.refugiart_auctions(id) on delete restrict;
create unique index if not exists refugiart_orders_auction_unique
  on public.refugiart_orders(auction_id) where auction_id is not null;

-- available_balance representa saldo livre para novas operacoes.
-- Ao reservar, o valor sai do disponivel e passa para reserved_balance.
alter table public.refugiart_wallets
  add column if not exists reserved_balance numeric(12,2) not null default 0
  check (reserved_balance >= 0);

-- Leitura de carteira somente pelo titular.
drop policy if exists "wallet_owner_read" on public.refugiart_wallets;
create policy "wallet_owner_read" on public.refugiart_wallets
  for select to authenticated using (auth.uid() = user_id);

-- Cada reserva ativa guarda apenas o maior lance vigente do participante.
create unique index if not exists refugiart_one_active_reservation_per_auction_user
  on public.refugiart_auction_reservations(auction_id,user_id)
  where status='active';

create or replace function public.refugiart_place_auction_bid(
  p_auction_id bigint,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_auction public.refugiart_auctions%rowtype;
  v_post public.atelie_posts%rowtype;
  v_top public.refugiart_auction_bids%rowtype;
  v_old_reservation public.refugiart_auction_reservations%rowtype;
  v_wallet public.refugiart_wallets%rowtype;
  v_required numeric(12,2);
  v_delta numeric(12,2);
  v_bid_id bigint;
  v_reservation_id bigint;
begin
  if v_user is null then raise exception 'Entre na sua conta para ofertar um lance.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) then
    raise exception 'Informe um lance valido com ate duas casas decimais.';
  end if;

  select * into v_auction from public.refugiart_auctions
    where id=p_auction_id for update;
  if not found then raise exception 'Leilao nao encontrado.'; end if;
  if v_auction.status <> 'active' or v_auction.starts_at > clock_timestamp()
     or v_auction.ends_at <= clock_timestamp() then
    raise exception 'Este leilao nao esta recebendo lances.';
  end if;
  if v_auction.artist_id=v_user then raise exception 'O artista nao pode ofertar na propria obra.'; end if;

  select * into v_post from public.atelie_posts
    where id=v_auction.post_id for update;
  if not found or v_post.moderation_status <> 'published' then
    raise exception 'Esta obra nao esta disponivel para leilao.';
  end if;

  select * into v_top from public.refugiart_auction_bids
    where auction_id=p_auction_id
    order by amount desc, created_at asc, id asc
    limit 1;

  v_required := greatest(v_auction.initial_price,coalesce(v_top.amount,0)+0.01);
  if p_amount < v_required then
    raise exception 'O lance minimo atual e R$ %.', to_char(v_required,'FM999999990D00');
  end if;

  -- Serializa a carteira do participante para impedir gasto duplo.
  select * into v_wallet from public.refugiart_wallets
    where user_id=v_user for update;
  if not found then raise exception 'Carteira nao encontrada.'; end if;

  select * into v_old_reservation from public.refugiart_auction_reservations
    where auction_id=p_auction_id and user_id=v_user
    for update;

  if found and v_old_reservation.status='active' then
    v_delta := p_amount-v_old_reservation.amount;
  else
    v_delta := p_amount;
  end if;
  if v_delta > v_wallet.available_balance then
    raise exception 'Saldo disponivel insuficiente para cobrir o lance.';
  end if;

  update public.refugiart_wallets
    set available_balance=available_balance-v_delta,
        reserved_balance=reserved_balance+v_delta,
        updated_at=now()
    where user_id=v_user;

  insert into public.refugiart_auction_bids(auction_id,user_id,amount)
    values(p_auction_id,v_user,p_amount) returning id into v_bid_id;

  if v_old_reservation.id is not null then
    update public.refugiart_auction_reservations
      set amount=p_amount,bid_id=v_bid_id,status='active',updated_at=now()
      where id=v_old_reservation.id returning id into v_reservation_id;
  else
    insert into public.refugiart_auction_reservations(auction_id,user_id,bid_id,amount,status)
      values(p_auction_id,v_user,v_bid_id,p_amount,'active')
      returning id into v_reservation_id;
  end if;

  insert into public.refugiart_wallet_transactions(
    user_id,transaction_type,direction,amount,status,idempotency_key,
    related_auction_id,related_post_id,description,confirmed_at
  ) values (
    v_user,'auction_reserve','debit',v_delta,'confirmed',
    'auction-reserve:'||p_auction_id||':'||v_user||':'||v_bid_id,
    p_auction_id,v_auction.post_id,'Reserva adicional para lance em leilao',now()
  );

  -- Se o lider anterior for outra pessoa, libera sua reserva integralmente.
  if v_top.id is not null and v_top.user_id<>v_user then
    select * into v_old_reservation from public.refugiart_auction_reservations
      where auction_id=p_auction_id and user_id=v_top.user_id and status='active'
      for update;
    if found then
      update public.refugiart_wallets
        set available_balance=available_balance+v_old_reservation.amount,
            reserved_balance=reserved_balance-v_old_reservation.amount,
            updated_at=now()
        where user_id=v_top.user_id;
      update public.refugiart_auction_reservations
        set status='released',updated_at=now()
        where id=v_old_reservation.id;
      insert into public.refugiart_wallet_transactions(
        user_id,transaction_type,direction,amount,status,idempotency_key,
        related_auction_id,related_post_id,description,confirmed_at
      ) values (
        v_top.user_id,'auction_release','credit',v_old_reservation.amount,'confirmed',
        'auction-release:'||p_auction_id||':'||v_top.user_id||':'||v_bid_id,
        p_auction_id,v_auction.post_id,'Reserva liberada apos lance superado',now()
      );
    end if;
  end if;

  return jsonb_build_object('success',true,'bid_id',v_bid_id,'amount',p_amount,
    'reserved_amount',p_amount,'ends_at',v_auction.ends_at);
end;
$$;

-- Encerramento seguro: captura reserva do vencedor e libera todas as demais.
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
  v_count integer:=0;
begin
  for a in
    select * from public.refugiart_auctions
    where status='active' and ends_at<=clock_timestamp()
    order by ends_at
    for update skip locked
  loop
    select * into v_winner from public.refugiart_auction_bids
      where auction_id=a.id order by amount desc,created_at asc,id asc limit 1;

    if v_winner.id is not null then
      select * into v_res from public.refugiart_auction_reservations
        where auction_id=a.id and user_id=v_winner.user_id and status='active'
        for update;
      if not found or v_res.amount < v_winner.amount then
        -- Inconsistencia financeira: nao finaliza nem inventa vencedor.
        raise exception 'Reserva financeira inconsistente no leilao %.',a.id;
      end if;

      update public.refugiart_wallets
        set reserved_balance=reserved_balance-v_winner.amount,
            pending_balance=pending_balance+v_winner.amount,
            updated_at=now()
        where user_id=a.artist_id;
      update public.refugiart_wallets
        set reserved_balance=reserved_balance-v_winner.amount,
            updated_at=now()
        where user_id=v_winner.user_id;

      update public.refugiart_auction_reservations
        set status='captured',updated_at=now() where id=v_res.id;

      insert into public.refugiart_wallet_transactions(
        user_id,transaction_type,direction,amount,status,idempotency_key,
        related_user_id,related_post_id,related_auction_id,description,confirmed_at
      ) values
      (v_winner.user_id,'purchase','debit',v_winner.amount,'confirmed',
       'auction-capture-buyer:'||a.id,a.artist_id,a.post_id,a.id,
       'Valor capturado do vencedor do leilao',now()),
      (a.artist_id,'sale','credit',v_winner.amount,'pending',
       'auction-capture-seller:'||a.id,v_winner.user_id,a.post_id,a.id,
       'Venda em leilao aguardando regras de entrega e liberacao',null);

      -- Registra pedido e prazo de postagem na mesma transacao da captura.
      select * into v_post from public.atelie_posts where id=a.post_id for update;
      if not found then raise exception 'Obra do leilao nao encontrada.'; end if;
      insert into public.refugiart_orders(
        buyer_id,seller_id,status,subtotal,shipping_amount,total_amount,
        paid_at,shipment_due_at,auction_id
      ) values (
        v_winner.user_id,a.artist_id,'awaiting_shipment',
        v_winner.amount,0,v_winner.amount,clock_timestamp(),
        public.refugiart_add_business_days(clock_timestamp(),3),a.id
      ) returning id into v_order_id;

      insert into public.refugiart_order_items(
        order_id,post_id,title_snapshot,unit_price,quantity
      ) values (
        v_order_id,a.post_id,
        coalesce(nullif(btrim(v_post.caption),''),'Obra RefugiART #'||a.post_id),
        v_winner.amount,1
      );

      insert into public.refugiart_shipments(order_id,status)
        values(v_order_id,'awaiting_post');

      update public.refugiart_wallets w
        set available_balance=available_balance+r.amount,
            reserved_balance=reserved_balance-r.amount,
            updated_at=now()
        from public.refugiart_auction_reservations r
        where r.auction_id=a.id and r.user_id=w.user_id
          and r.status='active' and r.user_id<>v_winner.user_id;
      update public.refugiart_auction_reservations
        set status='released',updated_at=now()
        where auction_id=a.id and status='active' and user_id<>v_winner.user_id;
      insert into public.refugiart_wallet_transactions(
        user_id,transaction_type,direction,amount,status,idempotency_key,
        related_post_id,related_auction_id,description,confirmed_at
      )
      select r.user_id,'auction_release','credit',r.amount,'confirmed',
        'auction-release-close:'||a.id||':'||r.user_id,
        a.post_id,a.id,'Reserva liberada no encerramento do leilao',now()
      from public.refugiart_auction_reservations r
      where r.auction_id=a.id and r.status='released' and r.user_id<>v_winner.user_id;

      update public.refugiart_auctions set status='finished',closed_at=now(),
        winning_user_id=v_winner.user_id,winning_bid=v_winner.amount where id=a.id;
      update public.atelie_posts set auction_status='finished' where id=a.post_id;
    else
      update public.refugiart_auctions set status='finished',closed_at=now(),
        winning_user_id=null,winning_bid=null where id=a.id;
      update public.atelie_posts set auction_status='finished' where id=a.post_id;
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.refugiart_place_auction_bid(bigint,numeric) from public,anon,authenticated;
revoke all on function public.refugiart_close_expired_auctions() from public,anon,authenticated;
grant execute on function public.refugiart_place_auction_bid(bigint,numeric) to authenticated;
grant execute on function public.refugiart_close_expired_auctions() to service_role;

commit;
