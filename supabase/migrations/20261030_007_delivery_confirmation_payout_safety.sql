-- RefugiART: confirmacao de entrega multicanal e liberacao segura do saldo do artista.
-- Requer migrations 001, 003, 004, 005 e 006.
-- Nao habilita gateway, saque bancario ou checkout; protege a liquidacao interna.
begin;

-- O estado disputed precisa existir no dominio de status do pedido.
alter table public.refugiart_orders drop constraint if exists refugiart_orders_status_check;
alter table public.refugiart_orders add constraint refugiart_orders_status_check
  check (status in ('pending_payment','paid','awaiting_shipment','shipped','delivered','cancelled','refund_pending','refunded','disputed'));

alter table public.refugiart_orders
  add column if not exists delivery_method text not null default 'carrier'
    check (delivery_method in ('carrier','in_person','pickup')),
  add column if not exists delivery_status text not null default 'awaiting_delivery'
    check (delivery_status in ('awaiting_delivery','proof_submitted','confirmed','disputed','review_required')),
  add column if not exists delivery_confirmed_at timestamptz,
  add column if not exists payout_released_at timestamptz,
  add column if not exists payout_release_method text
    check (payout_release_method in ('buyer_confirmation','handover_code','admin_review'));

create table if not exists public.refugiart_delivery_codes (
  order_id bigint primary key references public.refugiart_orders(id) on delete restrict,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 10),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.refugiart_delivery_events (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.refugiart_orders(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'code_issued','handover_code_accepted','buyer_confirmed',
    'tracking_submitted','dispute_opened','admin_confirmed','payout_released'
  )),
  delivery_method text not null check (delivery_method in ('carrier','in_person','pickup')),
  evidence_url text,
  notes text,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists refugiart_delivery_events_order_idx
  on public.refugiart_delivery_events(order_id,created_at desc);

alter table public.refugiart_delivery_codes enable row level security;
alter table public.refugiart_delivery_events enable row level security;
revoke all on public.refugiart_delivery_codes from public,anon,authenticated;
revoke all on public.refugiart_delivery_events from public,anon,authenticated;
grant select on public.refugiart_delivery_events to authenticated;
drop policy if exists "delivery_events_parties_read" on public.refugiart_delivery_events;
create policy "delivery_events_parties_read" on public.refugiart_delivery_events
  for select to authenticated using (
    exists(select 1 from public.refugiart_orders o
      where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid()))
  );
grant all on public.refugiart_delivery_codes to service_role;
grant all on public.refugiart_delivery_events to service_role;

-- Leiloes sempre usam comissao de 30% do valor final arrematado.
-- O valor bruto permanece pendente; a liberacao posterior separa a comissao.
create or replace function public.refugiart_snapshot_auction_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auction_id is not null then
    new.platform_commission_rate := 0.30;
    new.platform_commission_amount := round(new.subtotal * 0.30,2);
    if new.checkout_group_subtotal = 0 then
      new.checkout_group_subtotal := new.subtotal;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refugiart_snapshot_auction_commission on public.refugiart_orders;
create trigger trg_refugiart_snapshot_auction_commission
before insert on public.refugiart_orders
for each row execute function public.refugiart_snapshot_auction_commission();

-- Emite codigo de uso unico para o comprador em entrega pessoal/retirada.
-- O codigo em texto puro retorna somente ao comprador; no banco fica apenas MD5.
create or replace function public.refugiart_issue_delivery_code(p_order_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.refugiart_orders%rowtype;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Faca login.'; end if;
  select * into v_order from public.refugiart_orders
    where id=p_order_id and buyer_id=auth.uid() for update;
  if not found then raise exception 'Pedido nao encontrado para este comprador.'; end if;
  if v_order.delivery_method not in ('in_person','pickup') then
    raise exception 'Codigo presencial indisponivel para este tipo de envio.';
  end if;
  if v_order.status not in ('paid','awaiting_shipment','shipped') then
    raise exception 'Este pedido nao esta apto para confirmacao de entrega.';
  end if;
  if v_order.delivery_status in ('confirmed','disputed') then
    raise exception 'Este pedido ja foi confirmado ou esta em disputa.';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.refugiart_delivery_codes(order_id,code_hash,expires_at,consumed_at,failed_attempts)
    values(p_order_id,md5(v_code),clock_timestamp()+interval '48 hours',null,0)
  on conflict(order_id) do update set
    code_hash=excluded.code_hash,
    expires_at=excluded.expires_at,
    consumed_at=null,
    failed_attempts=0,
    created_at=clock_timestamp();

  insert into public.refugiart_delivery_events(order_id,actor_id,event_type,delivery_method)
    values(p_order_id,auth.uid(),'code_issued',v_order.delivery_method);
  return v_code;
end;
$$;

create or replace function public.refugiart_release_seller_payout(
  p_order_id bigint,
  p_method text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.refugiart_orders%rowtype;
  v_wallet public.refugiart_wallets%rowtype;
  v_sale_tx public.refugiart_wallet_transactions%rowtype;
  v_fee numeric(12,2);
  v_net numeric(12,2);
begin
  if p_method not in ('buyer_confirmation','handover_code','admin_review') then
    raise exception 'Metodo de liberacao invalido.';
  end if;
  select * into v_order from public.refugiart_orders
    where id=p_order_id for update;
  if not found then raise exception 'Pedido nao encontrado.'; end if;
  if v_order.delivery_status<>'confirmed' or v_order.delivery_confirmed_at is null then
    raise exception 'A entrega ainda nao foi confirmada.';
  end if;
  if v_order.payout_released_at is not null then
    return jsonb_build_object('success',true,'already_released',true);
  end if;
  if exists(select 1 from public.refugiart_order_disputes
    where order_id=p_order_id and status in ('open','under_review')) then
    raise exception 'Existe disputa aberta; o saldo permanece bloqueado.';
  end if;
  if v_order.platform_commission_amount<0 or v_order.platform_commission_amount>v_order.subtotal then
    raise exception 'Comissao do pedido inconsistente.';
  end if;

  select * into v_sale_tx from public.refugiart_wallet_transactions
    where related_order_id=p_order_id and user_id=v_order.seller_id
      and transaction_type='sale' and direction='credit' and status='pending'
    order by id desc limit 1 for update;
  if not found or v_sale_tx.amount<>v_order.subtotal then
    raise exception 'Credito pendente do pedido ausente ou divergente; solicitar revisao administrativa.';
  end if;

  select * into v_wallet from public.refugiart_wallets
    where user_id=v_order.seller_id for update;
  if not found or v_wallet.pending_balance<v_sale_tx.amount then
    raise exception 'Saldo pendente insuficiente para liberar este pedido.';
  end if;

  v_fee := round(v_order.platform_commission_amount,2);
  v_net := round(v_sale_tx.amount-v_fee,2);
  if v_net<0 then raise exception 'Valor liquido negativo.'; end if;

  update public.refugiart_wallets
    set pending_balance=pending_balance-v_sale_tx.amount,
        available_balance=available_balance+v_net,
        updated_at=clock_timestamp()
    where user_id=v_order.seller_id;

  -- Preserva trilha: credito pendente original e marcado como revertido;
  -- novos lancamentos representam liquido pago e comissao retida pela plataforma.
  update public.refugiart_wallet_transactions
    set status='reversed',description=coalesce(description,'')||' | Substituido pela liquidacao liquida do pedido '||p_order_id
    where id=v_sale_tx.id and status='pending';

  insert into public.refugiart_wallet_transactions(
    user_id,transaction_type,direction,amount,status,idempotency_key,
    related_user_id,related_post_id,related_auction_id,related_order_id,
    description,confirmed_at
  ) values (
    v_order.seller_id,'sale','credit',v_net,'confirmed',
    'seller-payout-net:'||p_order_id,
    v_order.buyer_id,
    (select post_id from public.refugiart_order_items where order_id=p_order_id order by id limit 1),
    v_order.auction_id,p_order_id,
    'Valor liquido liberado apos confirmacao de entrega',clock_timestamp()
  );

  if v_fee > 0 then
    insert into public.refugiart_wallet_transactions(
      user_id,transaction_type,direction,amount,status,idempotency_key,
      related_user_id,related_post_id,related_auction_id,related_order_id,
      description,confirmed_at
    ) values (
      v_order.seller_id,'fee','debit',v_fee,'confirmed',
      'seller-platform-commission:'||p_order_id,
      null,
      (select post_id from public.refugiart_order_items where order_id=p_order_id order by id limit 1),
      v_order.auction_id,p_order_id,
      'Comissao RefugiART registrada no pedido',clock_timestamp()
    );
  end if;

  update public.refugiart_orders set payout_released_at=clock_timestamp(),
    payout_release_method=p_method where id=p_order_id;
  insert into public.refugiart_delivery_events(order_id,actor_id,event_type,delivery_method,notes)
    values(p_order_id,null,'payout_released',v_order.delivery_method,
      'Liquidacao interna: liquido R$ '||v_net||'; comissao R$ '||v_fee);

  return jsonb_build_object('success',true,'gross',v_sale_tx.amount,
    'commission',v_fee,'seller_net',v_net,'released_at',clock_timestamp());
end;
$$;


-- Registra o codigo apresentado pelo comprador ao artista. A confirmacao so
-- libera saldo se nao houver disputa e se o credito pendente deste pedido existir.
create or replace function public.refugiart_seller_confirm_handover(
  p_order_id bigint,
  p_code text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.refugiart_orders%rowtype;
  v_code public.refugiart_delivery_codes%rowtype;
begin
  if auth.uid() is null then raise exception 'Faca login.'; end if;
  select * into v_order from public.refugiart_orders
    where id=p_order_id and seller_id=auth.uid() for update;
  if not found then raise exception 'Pedido nao encontrado para este artista.'; end if;
  if v_order.delivery_method not in ('in_person','pickup') then
    raise exception 'Este pedido nao usa confirmacao presencial.';
  end if;
  select * into v_code from public.refugiart_delivery_codes
    where order_id=p_order_id for update;
  if not found or v_code.consumed_at is not null or v_code.expires_at<=clock_timestamp()
     or v_code.failed_attempts>=10 then
    raise exception 'Codigo inexistente, expirado ou bloqueado. Solicite novo codigo ao comprador.';
  end if;
  if p_code is null or length(trim(p_code))<>12 or md5(upper(trim(p_code)))<>v_code.code_hash then
    update public.refugiart_delivery_codes set failed_attempts=failed_attempts+1
      where order_id=p_order_id;
    raise exception 'Codigo de confirmacao invalido.';
  end if;

  update public.refugiart_delivery_codes set consumed_at=clock_timestamp()
    where order_id=p_order_id;
  update public.refugiart_orders set delivery_status='confirmed',
    delivery_confirmed_at=clock_timestamp(),status='delivered'
    where id=p_order_id;
  insert into public.refugiart_delivery_events(order_id,actor_id,event_type,delivery_method)
    values(p_order_id,auth.uid(),'handover_code_accepted',v_order.delivery_method);

  return public.refugiart_release_seller_payout(p_order_id,'handover_code');
end;
$$;

-- Confirmacao direta do comprador para entregas por transportadora ou retirada.
create or replace function public.refugiart_buyer_confirm_delivery(p_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.refugiart_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Faca login.'; end if;
  select * into v_order from public.refugiart_orders
    where id=p_order_id and buyer_id=auth.uid() for update;
  if not found then raise exception 'Pedido nao encontrado para este comprador.'; end if;
  if v_order.status not in ('paid','awaiting_shipment','shipped','delivered') then
    raise exception 'Estado do pedido nao permite confirmacao.';
  end if;
  if v_order.delivery_status='disputed' then
    raise exception 'Pedido em disputa: a liberacao esta suspensa.';
  end if;
  if v_order.delivery_status='confirmed' then
    return jsonb_build_object('success',true,'already_confirmed',true);
  end if;

  update public.refugiart_orders set delivery_status='confirmed',
    delivery_confirmed_at=clock_timestamp(),status='delivered'
    where id=p_order_id;
  insert into public.refugiart_delivery_events(order_id,actor_id,event_type,delivery_method)
    values(p_order_id,auth.uid(),'buyer_confirmed',v_order.delivery_method);

  return public.refugiart_release_seller_payout(p_order_id,'buyer_confirmation');
end;
$$;

-- Abertura de disputa pelo comprador bloqueia a liberacao automatica.
create or replace function public.refugiart_open_delivery_dispute(
  p_order_id bigint,
  p_reason text,
  p_description text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.refugiart_orders%rowtype;
  v_dispute_id bigint;
begin
  if auth.uid() is null then raise exception 'Faca login.'; end if;
  select * into v_order from public.refugiart_orders
    where id=p_order_id and buyer_id=auth.uid() for update;
  if not found then raise exception 'Pedido nao encontrado para este comprador.'; end if;
  if v_order.payout_released_at is not null then
    raise exception 'O pagamento ao artista ja foi liberado; encaminhe o caso ao suporte.';
  end if;
  if p_reason not in ('not_received','empty_package','damaged','different_item','other')
     or p_description is null or length(trim(p_description))<10 then
    raise exception 'Informe um motivo valido e descreva o problema.';
  end if;
  insert into public.refugiart_order_disputes(order_id,opened_by,reason,description)
    values(p_order_id,auth.uid(),p_reason,trim(p_description))
    returning id into v_dispute_id;
  update public.refugiart_orders set delivery_status='disputed',status='disputed'
    where id=p_order_id;
  insert into public.refugiart_delivery_events(order_id,actor_id,event_type,delivery_method,notes)
    values(p_order_id,auth.uid(),'dispute_opened',v_order.delivery_method,trim(p_description));
  return v_dispute_id;
end;
$$;

-- Funcao interna: move o bruto pendente para liquido disponivel, destacando
-- a comissao como debito separado. Exige credito pendente ligado ao pedido.

-- Apenas RPCs autenticadas apropriadas ficam expostas. A liquidacao interna e
-- reservada ao service_role e chamada pelas RPCs seguras acima.
revoke all on function public.refugiart_issue_delivery_code(bigint) from public,anon;
revoke all on function public.refugiart_seller_confirm_handover(bigint,text) from public,anon;
revoke all on function public.refugiart_buyer_confirm_delivery(bigint) from public,anon;
revoke all on function public.refugiart_open_delivery_dispute(bigint,text,text) from public,anon;
revoke all on function public.refugiart_release_seller_payout(bigint,text) from public,anon,authenticated;
grant execute on function public.refugiart_issue_delivery_code(bigint) to authenticated;
grant execute on function public.refugiart_seller_confirm_handover(bigint,text) to authenticated;
grant execute on function public.refugiart_buyer_confirm_delivery(bigint) to authenticated;
grant execute on function public.refugiart_open_delivery_dispute(bigint,text,text) to authenticated;
grant execute on function public.refugiart_release_seller_payout(bigint,text) to service_role;

commit;
