-- Checkout seguro do Mercado RefugiART.
-- Valores são obtidos de atelie_posts no servidor; o navegador envia apenas IDs.
begin;
create table if not exists public.refugiart_checkout_groups (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references auth.users(id),
 idempotency_key uuid not null, status text not null default 'reserved'
 check(status in('reserved','awaiting_payment','paid','expired','cancelled','payment_review','refunded')),
 items_subtotal_cents bigint not null check(items_subtotal_cents>=100), expires_at timestamptz not null,
 payment_intent_id uuid references public.refugiart_payment_intents(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(buyer_id,idempotency_key)
);
create table if not exists public.refugiart_checkout_reservations (
 id bigint generated always as identity primary key, checkout_group_id uuid not null references public.refugiart_checkout_groups(id),
 post_id bigint not null references public.atelie_posts(id), buyer_id uuid not null references auth.users(id),
 seller_id uuid not null references auth.users(id), title_snapshot text not null, image_snapshot text,
 unit_price_cents bigint not null check(unit_price_cents>=100),
 status text not null default 'reserved' check(status in('reserved','consumed','released','expired')),
 expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists refugiart_checkout_one_live_reservation_per_post
 on public.refugiart_checkout_reservations(post_id) where status in('reserved','consumed');
create index if not exists refugiart_checkout_reservations_group_idx
 on public.refugiart_checkout_reservations(checkout_group_id,status);
create table if not exists public.refugiart_orders (
 id bigint generated always as identity primary key, checkout_group_id uuid not null references public.refugiart_checkout_groups(id),
 buyer_id uuid not null references auth.users(id), seller_id uuid not null references auth.users(id),
 status text not null default 'awaiting_shipment' check(status in('awaiting_shipment','shipped','delivered','refund_pending','refunded','disputed','cancelled')),
 subtotal_cents bigint not null check(subtotal_cents>0), platform_commission_cents bigint not null check(platform_commission_cents>=0),
 seller_net_cents bigint not null check(seller_net_cents>=0), commission_rate numeric(5,4) not null check(commission_rate in(0.20,0.30)),
 payment_provider text not null default 'infinitepay', provider_order_nsu text not null, paid_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(checkout_group_id,seller_id), check(buyer_id<>seller_id), check(subtotal_cents=platform_commission_cents+seller_net_cents)
);
create index if not exists refugiart_orders_buyer_history_idx on public.refugiart_orders(buyer_id,paid_at desc);
create index if not exists refugiart_orders_seller_history_idx on public.refugiart_orders(seller_id,paid_at desc);
create table if not exists public.refugiart_order_items (
 id bigint generated always as identity primary key, order_id bigint not null references public.refugiart_orders(id),
 post_id bigint not null references public.atelie_posts(id), title_snapshot text not null, image_snapshot text,
 unit_price_cents bigint not null check(unit_price_cents>0), commission_cents bigint not null check(commission_cents>=0),
 seller_net_cents bigint not null check(seller_net_cents>=0), created_at timestamptz not null default now(),
 unique(order_id,post_id), check(unit_price_cents=commission_cents+seller_net_cents)
);
alter table public.refugiart_payment_intents add column if not exists checkout_group_id uuid references public.refugiart_checkout_groups(id);
alter table public.refugiart_checkout_groups enable row level security;
alter table public.refugiart_checkout_reservations enable row level security;
alter table public.refugiart_orders enable row level security;
alter table public.refugiart_order_items enable row level security;
revoke all on public.refugiart_checkout_groups,public.refugiart_checkout_reservations,public.refugiart_orders,public.refugiart_order_items from public,anon,authenticated;
grant select on public.refugiart_checkout_groups,public.refugiart_checkout_reservations,public.refugiart_orders,public.refugiart_order_items to authenticated;
drop policy if exists checkout_group_buyer_read on public.refugiart_checkout_groups;
create policy checkout_group_buyer_read on public.refugiart_checkout_groups for select to authenticated using(buyer_id=auth.uid());
drop policy if exists checkout_reservation_parties_read on public.refugiart_checkout_reservations;
create policy checkout_reservation_parties_read on public.refugiart_checkout_reservations for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid());
drop policy if exists orders_parties_read on public.refugiart_orders;
create policy orders_parties_read on public.refugiart_orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid());
drop policy if exists order_items_parties_read on public.refugiart_order_items;
create policy order_items_parties_read on public.refugiart_order_items for select to authenticated using(exists(select 1 from public.refugiart_orders o where o.id=order_id and (o.buyer_id=auth.uid() or o.seller_id=auth.uid())));
grant all on public.refugiart_checkout_groups,public.refugiart_checkout_reservations,public.refugiart_orders,public.refugiart_order_items to service_role;

create or replace function public.refugiart_reserve_market_items(p_post_ids bigint[],p_idempotency_key uuid,p_buyer_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_buyer uuid:=p_buyer_id; v_post public.atelie_posts%rowtype; v_group public.refugiart_checkout_groups%rowtype;
v_ids bigint[]; v_count integer:=0; v_total bigint:=0; v_exp timestamptz:=now()+interval '15 minutes';
begin
 if v_buyer is null then raise exception 'Faça login para comprar.'; end if;
 if p_idempotency_key is null or p_post_ids is null or cardinality(p_post_ids)<1 or cardinality(p_post_ids)>20 then raise exception 'Sacola inválida.'; end if;
 select array_agg(distinct x order by x) into v_ids from unnest(p_post_ids) x;
 if cardinality(v_ids)<>cardinality(p_post_ids) then raise exception 'A sacola contém obras repetidas.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_buyer::text||':'||p_idempotency_key::text,0));
 select * into v_group from public.refugiart_checkout_groups where buyer_id=v_buyer and idempotency_key=p_idempotency_key for update;
 if found then
  if v_group.status not in('reserved','awaiting_payment') or v_group.expires_at<=now() then raise exception 'Esta tentativa expirou. Atualize a sacola.'; end if;
  return jsonb_build_object('checkout_group_id',v_group.id,'amount_cents',v_group.items_subtotal_cents,'expires_at',v_group.expires_at);
 end if;
 update public.refugiart_checkout_reservations set status='expired',updated_at=now() where status='reserved' and expires_at<=now();
 update public.refugiart_checkout_groups set status='expired',updated_at=now() where status in('reserved','awaiting_payment') and expires_at<=now();
 for v_post in select * from public.atelie_posts where id=any(v_ids) order by id for update loop
  v_count:=v_count+1;
  if v_post.user_id=v_buyer then raise exception 'Você não pode comprar sua própria obra.'; end if;
  if v_post.publicar_mercado is not true or v_post.listing_mode<>'market' or coalesce(v_post.moderation_status,'published')<>'published' or v_post.preco is null or v_post.preco<1 then raise exception 'Uma obra não está disponível.'; end if;
  if exists(select 1 from public.refugiart_checkout_reservations r where r.post_id=v_post.id and r.status in('reserved','consumed')) then raise exception 'Uma obra já está reservada ou vendida.'; end if;
  if round(v_post.preco*100)<>v_post.preco*100 then raise exception 'Preço inválido.'; end if;
  v_total:=v_total+round(v_post.preco*100)::bigint;
 end loop;
 if v_count<>cardinality(v_ids) or v_total<100 then raise exception 'Não foi possível validar todas as obras.'; end if;
 insert into public.refugiart_checkout_groups(buyer_id,idempotency_key,items_subtotal_cents,expires_at) values(v_buyer,p_idempotency_key,v_total,v_exp) returning * into v_group;
 insert into public.refugiart_checkout_reservations(checkout_group_id,post_id,buyer_id,seller_id,title_snapshot,image_snapshot,unit_price_cents,expires_at)
 select v_group.id,p.id,v_buyer,p.user_id,coalesce(nullif(btrim(p.caption),''),'Obra RefugiART #'||p.id),p.image_url,round(p.preco*100)::bigint,v_exp from public.atelie_posts p where p.id=any(v_ids) order by p.id;
 return jsonb_build_object('checkout_group_id',v_group.id,'amount_cents',v_total,'expires_at',v_exp);
end; $$;
revoke all on function public.refugiart_reserve_market_items(bigint[],uuid,uuid) from public,anon,authenticated;
grant execute on function public.refugiart_reserve_market_items(bigint[],uuid,uuid) to service_role;

create or replace function public.refugiart_confirm_market_checkout(p_order_nsu text,p_invoice_slug text,p_transaction_nsu text,p_amount_cents bigint,p_paid_amount_cents bigint,p_payment_method text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_intent public.refugiart_payment_intents%rowtype; v_group public.refugiart_checkout_groups%rowtype;
v_seller record; v_order_id bigint; v_count integer:=0; v_total bigint:=0; v_rate numeric(5,4); v_commission bigint; v_net bigint;
begin
 select * into v_intent from public.refugiart_payment_intents where order_nsu=p_order_nsu for update;
 if not found then raise exception 'Intenção de pagamento não encontrada.'; end if;
 select * into v_group from public.refugiart_checkout_groups where id=v_intent.checkout_group_id for update;
 if not found then raise exception 'Grupo de compra não encontrado.'; end if;
 if v_intent.status='paid' then
  if v_intent.invoice_slug=p_invoice_slug and v_intent.transaction_nsu=p_transaction_nsu then return jsonb_build_object('confirmed',true,'replayed',true); end if;
  raise exception 'Conflito de confirmação.';
 end if;
 if v_intent.status<>'pending' or v_group.status<>'awaiting_payment' then raise exception 'Compra não aguarda pagamento.'; end if;
 if p_amount_cents<>v_intent.amount_cents or p_amount_cents<>v_group.items_subtotal_cents then raise exception 'Valor confirmado divergente.'; end if;
 if p_invoice_slug is null or p_transaction_nsu is null then raise exception 'Referências ausentes.'; end if;
 for v_seller in select seller_id,sum(unit_price_cents)::bigint subtotal from public.refugiart_checkout_reservations where checkout_group_id=v_group.id and status='reserved' group by seller_id order by seller_id loop
  v_rate:=0.20; v_commission:=round(v_seller.subtotal*v_rate)::bigint; v_net:=v_seller.subtotal-v_commission;
  insert into public.refugiart_orders(checkout_group_id,buyer_id,seller_id,subtotal_cents,platform_commission_cents,seller_net_cents,commission_rate,provider_order_nsu)
  values(v_group.id,v_group.buyer_id,v_seller.seller_id,v_seller.subtotal,v_commission,v_net,v_rate,p_order_nsu) returning id into v_order_id;
  insert into public.refugiart_order_items(order_id,post_id,title_snapshot,image_snapshot,unit_price_cents,commission_cents,seller_net_cents)
  select v_order_id,r.post_id,r.title_snapshot,r.image_snapshot,r.unit_price_cents,round(r.unit_price_cents*v_rate)::bigint,r.unit_price_cents-round(r.unit_price_cents*v_rate)::bigint
  from public.refugiart_checkout_reservations r where r.checkout_group_id=v_group.id and r.seller_id=v_seller.seller_id and r.status='reserved';
  v_count:=v_count+1; v_total:=v_total+v_seller.subtotal;
 end loop;
 if v_count=0 or v_total<>v_group.items_subtotal_cents then raise exception 'Reservas incompletas.'; end if;
 update public.refugiart_checkout_reservations set status='consumed',updated_at=now() where checkout_group_id=v_group.id and status='reserved';
 update public.atelie_posts p set publicar_mercado=false from public.refugiart_checkout_reservations r where r.checkout_group_id=v_group.id and r.post_id=p.id;
 update public.refugiart_checkout_groups set status='paid',updated_at=now() where id=v_group.id;
 update public.refugiart_payment_intents set status='paid',invoice_slug=p_invoice_slug,transaction_nsu=p_transaction_nsu,paid_amount_cents=p_paid_amount_cents,payment_method=p_payment_method,confirmed_at=now(),updated_at=now() where id=v_intent.id;
 return jsonb_build_object('confirmed',true,'orders_created',v_count,'amount_cents',v_total);
end; $$;
revoke all on function public.refugiart_confirm_market_checkout(text,text,text,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.refugiart_confirm_market_checkout(text,text,text,bigint,bigint,text) to service_role;
commit;