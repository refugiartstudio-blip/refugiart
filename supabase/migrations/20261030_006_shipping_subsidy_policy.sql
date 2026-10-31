-- RefugiART: politica de frete por grupo de checkout e subsídio proporcional.
-- Cada artista gera uma remessa/pedido separado; o comprador vê o total consolidado.
-- O cálculo deve ser chamado pelo backend confiável após obter cotações reais por CEP.
begin;

alter table public.refugiart_orders
  add column if not exists checkout_group_id uuid,
  add column if not exists checkout_group_subtotal numeric(12,2) not null default 0,
  add column if not exists platform_commission_rate numeric(6,5) not null default 0,
  add column if not exists platform_commission_amount numeric(12,2) not null default 0,
  add column if not exists shipping_quote_amount numeric(12,2) not null default 0,
  add column if not exists shipping_subsidy_amount numeric(12,2) not null default 0,
  add column if not exists shipping_campaign_threshold numeric(12,2) not null default 300,
  add column if not exists shipping_campaign_eligible boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.refugiart_orders'::regclass and conname='refugiart_orders_checkout_group_subtotal_check') then
    alter table public.refugiart_orders add constraint refugiart_orders_checkout_group_subtotal_check check (checkout_group_subtotal >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.refugiart_orders'::regclass and conname='refugiart_orders_commission_rate_check') then
    alter table public.refugiart_orders add constraint refugiart_orders_commission_rate_check check (platform_commission_rate >= 0 and platform_commission_rate <= 1);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.refugiart_orders'::regclass and conname='refugiart_orders_commission_amount_check') then
    alter table public.refugiart_orders add constraint refugiart_orders_commission_amount_check check (platform_commission_amount >= 0 and platform_commission_amount <= subtotal);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.refugiart_orders'::regclass and conname='refugiart_orders_shipping_quote_check') then
    alter table public.refugiart_orders add constraint refugiart_orders_shipping_quote_check check (shipping_quote_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.refugiart_orders'::regclass and conname='refugiart_orders_shipping_subsidy_check') then
    alter table public.refugiart_orders add constraint refugiart_orders_shipping_subsidy_check check (shipping_subsidy_amount >= 0 and shipping_subsidy_amount <= shipping_quote_amount);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.refugiart_orders'::regclass and conname='refugiart_orders_shipping_threshold_check') then
    alter table public.refugiart_orders add constraint refugiart_orders_shipping_threshold_check check (shipping_campaign_threshold >= 0);
  end if;
end;
$$;

-- shipping_amount continua sendo o valor efetivamente cobrado do comprador.
-- O total do pedido continua subtotal + shipping_amount.
-- shipping_quote_amount guarda o frete bruto cotado; shipping_subsidy_amount
-- guarda a parte custeada pela plataforma.

create index if not exists refugiart_orders_checkout_group_idx
  on public.refugiart_orders(checkout_group_id)
  where checkout_group_id is not null;

create or replace function public.refugiart_calculate_shipping_subsidy(
  p_cart_subtotal numeric,
  p_total_commission numeric,
  p_total_shipping numeric,
  p_package_shipping numeric,
  p_campaign_threshold numeric default 300
) returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_pool numeric(12,2);
  v_total_subsidy numeric(12,2);
  v_package_subsidy numeric(12,2);
  v_campaign_eligible boolean;
begin
  if p_cart_subtotal is null or p_total_commission is null
     or p_total_shipping is null or p_package_shipping is null
     or p_campaign_threshold is null
     or p_cart_subtotal < 0 or p_total_commission < 0
     or p_total_shipping < 0 or p_package_shipping < 0
     or p_campaign_threshold < 0 then
    raise exception 'Valores inválidos para cálculo de frete.';
  end if;

  if p_package_shipping > p_total_shipping then
    raise exception 'O frete do pacote não pode superar o frete total.';
  end if;

  v_campaign_eligible := p_cart_subtotal >= p_campaign_threshold;
  v_pool := round(p_total_commission * 0.20, 2);
  v_total_subsidy := least(p_total_shipping, v_pool);

  if p_total_shipping = 0 then
    v_package_subsidy := 0;
  else
    v_package_subsidy := round(
      v_total_subsidy * p_package_shipping / p_total_shipping, 2
    );
  end if;

  return jsonb_build_object(
    'campaign_eligible', v_campaign_eligible,
    'campaign_threshold', p_campaign_threshold,
    'cart_subtotal', round(p_cart_subtotal,2),
    'commission_pool', v_pool,
    'total_shipping', round(p_total_shipping,2),
    'total_subsidy', v_total_subsidy,
    'package_shipping', round(p_package_shipping,2),
    'package_subsidy', least(p_package_shipping,v_package_subsidy),
    'package_buyer_shipping', greatest(0,round(p_package_shipping,2)-least(p_package_shipping,v_package_subsidy))
  );
end;
$$;

revoke all on function public.refugiart_calculate_shipping_subsidy(numeric,numeric,numeric,numeric,numeric)
  from public, anon, authenticated;
grant execute on function public.refugiart_calculate_shipping_subsidy(numeric,numeric,numeric,numeric,numeric)
  to service_role;

commit;
