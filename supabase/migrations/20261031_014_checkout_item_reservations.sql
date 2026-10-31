-- RefugiART: reserva transacional de obras para iniciar checkout.
-- Requer 003 (pedidos) e auction_balloon_system (campos de anúncio).
-- Esta migration ainda NÃO foi executada no Supabase.
-- O fluxo termina em "reserved_for_quote": não cria cobrança nem marca pedido como pago.

begin;

create table if not exists public.refugiart_checkout_groups (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'reserved_for_quote'
    check (status in (
      'reserved_for_quote','awaiting_payment','paid','expired',
      'cancelled','payment_review','refunded','disputed'
    )),
  currency text not null default 'BRL' check (currency='BRL'),
  items_subtotal numeric(12,2) not null check (items_subtotal > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (buyer_id,idempotency_key)
);

create index if not exists refugiart_checkout_groups_expiry_idx
  on public.refugiart_checkout_groups(status,expires_at);

create table if not exists public.refugiart_checkout_reservations (
  id bigint generated always as identity primary key,
  checkout_group_id uuid not null references public.refugiart_checkout_groups(id) on delete restrict,
  post_id bigint not null references public.atelie_posts(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  title_snapshot text not null,
  unit_price numeric(12,2) not null check (unit_price > 0),
  status text not null default 'reserved'
    check (status in ('reserved','consumed','released','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- Uma obra só pode estar reservada por um checkout, ou consumida por uma venda.
create unique index if not exists refugiart_checkout_one_live_reservation_per_post
  on public.refugiart_checkout_reservations(post_id)
  where status in ('reserved','consumed');

create index if not exists refugiart_checkout_reservations_group_idx
  on public.refugiart_checkout_reservations(checkout_group_id,status);

alter table public.refugiart_checkout_groups enable row level security;
alter table public.refugiart_checkout_reservations enable row level security;

revoke all on public.refugiart_checkout_groups from public,anon,authenticated;
revoke all on public.refugiart_checkout_reservations from public,anon,authenticated;
grant select on public.refugiart_checkout_groups to authenticated;
grant select on public.refugiart_checkout_reservations to authenticated;

drop policy if exists "checkout_group_buyer_read" on public.refugiart_checkout_groups;
create policy "checkout_group_buyer_read"
  on public.refugiart_checkout_groups for select to authenticated
  using (buyer_id=auth.uid());

drop policy if exists "checkout_reservation_parties_read" on public.refugiart_checkout_reservations;
create policy "checkout_reservation_parties_read"
  on public.refugiart_checkout_reservations for select to authenticated
  using (
    buyer_id=auth.uid()
    or seller_id=auth.uid()
  );

grant all on public.refugiart_checkout_groups to service_role;
grant all on public.refugiart_checkout_reservations to service_role;

create or replace function public.refugiart_reserve_market_items(
  p_post_ids bigint[],
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_buyer uuid := auth.uid();
  v_group public.refugiart_checkout_groups%rowtype;
  v_post public.atelie_posts%rowtype;
  v_ids bigint[];
  v_count integer;
  v_subtotal numeric(12,2) := 0;
  v_expires timestamptz := clock_timestamp()+interval '15 minutes';
  v_existing uuid;
begin
  if v_buyer is null then
    raise exception 'Faça login para iniciar a compra.';
  end if;
  if p_idempotency_key is null then
    raise exception 'Chave de segurança da tentativa ausente.';
  end if;
  if p_post_ids is null or cardinality(p_post_ids)=0 or cardinality(p_post_ids)>20 then
    raise exception 'Selecione entre 1 e 20 obras.';
  end if;
  if exists(select 1 from unnest(p_post_ids) x where x is null) then
    raise exception 'Identificador de obra inválido.';
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_post_ids) x;
  if cardinality(v_ids)<>cardinality(p_post_ids) then
    raise exception 'A sacola contém obras repetidas.';
  end if;

  -- Serializa tentativas com a mesma chave para evitar grupos duplicados em corrida.
  perform pg_advisory_xact_lock(
    hashtextextended(v_buyer::text || ':' || p_idempotency_key::text,0)
  );

  -- Repetição da mesma requisição devolve o mesmo grupo, sem duplicar reservas.
  select * into v_group
  from public.refugiart_checkout_groups
  where buyer_id=v_buyer and idempotency_key=p_idempotency_key
  for update;
  if found then
    return jsonb_build_object(
      'checkout_group_id',v_group.id,
      'status',v_group.status,
      'items_subtotal',v_group.items_subtotal,
      'expires_at',v_group.expires_at,
      'idempotent_replay',true
    );
  end if;

  -- Expira reservas vencidas antes de tentar adquirir novas.
  update public.refugiart_checkout_reservations
  set status='expired',updated_at=clock_timestamp()
  where status='reserved' and expires_at<=clock_timestamp();

  update public.refugiart_checkout_groups g
  set status='expired',updated_at=clock_timestamp()
  where g.status in ('reserved_for_quote','awaiting_payment')
    and g.expires_at<=clock_timestamp();

  -- Bloqueia todas as obras em ordem estável para serializar compras concorrentes.
  for v_post in
    select * from public.atelie_posts
    where id=any(v_ids)
    order by id
    for update
  loop
    v_count:=coalesce(v_count,0)+1;
    if v_post.user_id=v_buyer then
      raise exception 'Não é possível comprar a própria obra (ID %).',v_post.id;
    end if;
    if v_post.publicar_mercado is not true
       or v_post.listing_mode<>'market'
       or coalesce(v_post.moderation_status,'published')<>'published'
       or v_post.preco is null or v_post.preco<=0 then
      raise exception 'A obra % não está disponível para venda direta.',v_post.id;
    end if;
    if exists(
      select 1 from public.refugiart_checkout_reservations r
      where r.post_id=v_post.id and r.status in ('reserved','consumed')
    ) then
      raise exception 'A obra % já está reservada ou vendida.',v_post.id;
    end if;
    v_subtotal:=v_subtotal+v_post.preco;
  end loop;

  if coalesce(v_count,0)<>cardinality(v_ids) then
    raise exception 'Uma ou mais obras não foram encontradas.';
  end if;
  if v_subtotal<=0 then
    raise exception 'O total do checkout precisa ser maior que zero.';
  end if;

  insert into public.refugiart_checkout_groups(
    buyer_id,idempotency_key,status,items_subtotal,expires_at
  ) values (
    v_buyer,p_idempotency_key,'reserved_for_quote',v_subtotal,v_expires
  ) returning * into v_group;

  -- Snapshots são copiados do banco, nunca do localStorage.
  insert into public.refugiart_checkout_reservations(
    checkout_group_id,post_id,buyer_id,seller_id,title_snapshot,
    unit_price,status,expires_at
  )
  select v_group.id,p.id,v_buyer,p.user_id,
         coalesce(nullif(btrim(p.caption),''),'Obra RefugiART #'||p.id),
         p.preco,'reserved',v_expires
  from public.atelie_posts p
  where p.id=any(v_ids)
  order by p.id;

  return jsonb_build_object(
    'checkout_group_id',v_group.id,
    'status',v_group.status,
    'items_subtotal',v_group.items_subtotal,
    'expires_at',v_group.expires_at,
    'idempotent_replay',false
  );
exception
  when unique_violation then
    raise exception 'Uma das obras acabou de ser reservada por outra compra. Atualize a sacola.';
end;
$$;

revoke all on function public.refugiart_reserve_market_items(bigint[],uuid)
  from public,anon,authenticated;
grant execute on function public.refugiart_reserve_market_items(bigint[],uuid)
  to authenticated;

commit;
