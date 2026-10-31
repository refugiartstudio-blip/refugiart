-- RefugiART: base segura para pedidos, postagem e contestacoes.
-- Esta migration cria apenas a estrutura. Nao ativa checkout nem confirma pagamentos.
begin;

create table if not exists public.refugiart_orders (
  id bigint generated always as identity primary key,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','paid','awaiting_shipment','shipped','delivered','cancelled','refund_pending','refunded','disputed')),
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0),
  total_amount numeric(12,2) not null check (total_amount > 0),
  payment_provider text,
  provider_payment_id text unique,
  paid_at timestamptz,
  shipment_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  check (total_amount = subtotal + shipping_amount)
);

create index if not exists refugiart_orders_buyer_idx
  on public.refugiart_orders(buyer_id,created_at desc);
create index if not exists refugiart_orders_seller_idx
  on public.refugiart_orders(seller_id,status,created_at desc);
create index if not exists refugiart_orders_due_idx
  on public.refugiart_orders(status,shipment_due_at);

create table if not exists public.refugiart_order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.refugiart_orders(id) on delete restrict,
  post_id bigint references public.atelie_posts(id) on delete set null,
  title_snapshot text not null,
  unit_price numeric(12,2) not null check (unit_price > 0),
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);
create index if not exists refugiart_order_items_order_idx
  on public.refugiart_order_items(order_id);

create table if not exists public.refugiart_shipments (
  id bigint generated always as identity primary key,
  order_id bigint not null unique references public.refugiart_orders(id) on delete restrict,
  carrier text,
  tracking_code text,
  proof_url text,
  posted_at timestamptz,
  verified_at timestamptz,
  verification_source text,
  status text not null default 'awaiting_post'
    check (status in ('awaiting_post','proof_submitted','verified','overdue','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.refugiart_order_disputes (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.refugiart_orders(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (reason in ('not_received','empty_package','damaged','different_item','other')),
  description text not null,
  status text not null default 'open'
    check (status in ('open','under_review','resolved_buyer','resolved_seller','closed')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists refugiart_order_disputes_order_idx
  on public.refugiart_order_disputes(order_id,status);

-- Calendario editavel de feriados nacionais/locais para calculo de dias uteis.
create table if not exists public.refugiart_business_holidays (
  holiday_date date primary key,
  description text not null
);

-- Soma dias uteis (segunda a sexta), desconsiderando feriados cadastrados.
create or replace function public.refugiart_add_business_days(p_start timestamptz,p_days integer)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_date date := p_start::date;
  v_added integer := 0;
begin
  if p_start is null or p_days < 0 then
    raise exception 'Data inicial ou quantidade de dias uteis invalida.';
  end if;
  while v_added < p_days loop
    v_date := v_date + 1;
    if extract(isodow from v_date) < 6
       and not exists(select 1 from public.refugiart_business_holidays h where h.holiday_date=v_date) then
      v_added := v_added + 1;
    end if;
  end loop;
  return (v_date::timestamp + (p_start::time)) at time zone 'UTC';
end;
$$;

alter table public.refugiart_orders enable row level security;
alter table public.refugiart_order_items enable row level security;
alter table public.refugiart_shipments enable row level security;
alter table public.refugiart_order_disputes enable row level security;
alter table public.refugiart_business_holidays enable row level security;

-- Leitura apenas para comprador e vendedor envolvidos. Escritas somente service_role.
revoke all on public.refugiart_orders from public,anon,authenticated;
revoke all on public.refugiart_order_items from public,anon,authenticated;
revoke all on public.refugiart_shipments from public,anon,authenticated;
revoke all on public.refugiart_order_disputes from public,anon,authenticated;
revoke all on public.refugiart_business_holidays from public,anon,authenticated;

grant select on public.refugiart_orders to authenticated;
grant select on public.refugiart_order_items to authenticated;
grant select on public.refugiart_shipments to authenticated;
grant select on public.refugiart_order_disputes to authenticated;
grant select on public.refugiart_business_holidays to authenticated;

drop policy if exists "orders_parties_read" on public.refugiart_orders;
create policy "orders_parties_read" on public.refugiart_orders
  for select to authenticated using (auth.uid()=buyer_id or auth.uid()=seller_id);

drop policy if exists "order_items_parties_read" on public.refugiart_order_items;
create policy "order_items_parties_read" on public.refugiart_order_items
  for select to authenticated using (
    exists(select 1 from public.refugiart_orders o
      where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid()))
  );

drop policy if exists "shipments_parties_read" on public.refugiart_shipments;
create policy "shipments_parties_read" on public.refugiart_shipments
  for select to authenticated using (
    exists(select 1 from public.refugiart_orders o
      where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid()))
  );

drop policy if exists "disputes_parties_read" on public.refugiart_order_disputes;
create policy "disputes_parties_read" on public.refugiart_order_disputes
  for select to authenticated using (
    opened_by=auth.uid() or exists(select 1 from public.refugiart_orders o
      where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid()))
  );

drop policy if exists "business_holidays_authenticated_read" on public.refugiart_business_holidays;
create policy "business_holidays_authenticated_read" on public.refugiart_business_holidays
  for select to authenticated using (true);

grant all on public.refugiart_orders to service_role;
grant all on public.refugiart_order_items to service_role;
grant all on public.refugiart_shipments to service_role;
grant all on public.refugiart_order_disputes to service_role;
grant all on public.refugiart_business_holidays to service_role;
grant execute on function public.refugiart_add_business_days(timestamptz,integer) to service_role;

commit;
