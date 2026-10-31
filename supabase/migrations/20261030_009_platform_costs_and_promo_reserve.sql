-- RefugiART: controle de custos, margem de contribuicao e reserva promocional.
-- Requer migrations 001, 003, 005, 006 e 007.
-- Registros sao feitos somente pelo backend confiavel (service_role).
-- A comissao continua no refugiart_platform_ledger para evitar duplicidade.

begin;

create table if not exists public.refugiart_platform_cost_entries (
  id bigint generated always as identity primary key,
  entry_kind text not null check (entry_kind in ('expense','promo_funding','promo_spend')),
  category text not null check (category in (
    'gateway_fee','tax','shipping_subsidy','refund','chargeback',
    'operational_expense','promo_reserve','promo_shipping'
  )),
  amount numeric(12,2) not null check (amount > 0),
  order_id bigint references public.refugiart_orders(id) on delete restrict,
  reference text,
  idempotency_key text not null unique,
  description text,
  created_at timestamptz not null default clock_timestamp(),
  constraint refugiart_platform_cost_kind_category_check check (
    (entry_kind='expense' and category in (
      'gateway_fee','tax','shipping_subsidy','refund','chargeback','operational_expense'
    ))
    or (entry_kind='promo_funding' and category='promo_reserve')
    or (entry_kind='promo_spend' and category='promo_shipping')
  )
);

create index if not exists refugiart_platform_cost_entries_created_idx
  on public.refugiart_platform_cost_entries(created_at desc);
create index if not exists refugiart_platform_cost_entries_order_idx
  on public.refugiart_platform_cost_entries(order_id)
  where order_id is not null;

alter table public.refugiart_platform_cost_entries enable row level security;
revoke all on public.refugiart_platform_cost_entries from public,anon,authenticated;
grant all on public.refugiart_platform_cost_entries to service_role;

-- Saldo promocional: aportes efetivos menos gastos promocionais registrados.
create or replace function public.refugiart_promo_reserve_balance()
returns numeric
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(sum(
    case
      when entry_kind='promo_funding' then amount
      when entry_kind='promo_spend' then -amount
      else 0
    end
  ),0)::numeric(12,2)
  from public.refugiart_platform_cost_entries;
$$;

-- Lanca despesas reais e aportes a reserva promocional.
-- promo_spend so e aceito se houver saldo previamente financiado.
create or replace function public.refugiart_record_platform_cost(
  p_entry_kind text,
  p_category text,
  p_amount numeric,
  p_idempotency_key text,
  p_order_id bigint default null,
  p_reference text default null,
  p_description text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_balance numeric(12,2);
  v_id bigint;
begin
  if p_entry_kind not in ('expense','promo_funding','promo_spend')
     or p_amount is null or p_amount<=0
     or p_amount<>round(p_amount,2)
     or p_idempotency_key is null or length(trim(p_idempotency_key))<8 then
    raise exception 'Lancamento financeiro invalido.';
  end if;

  if (p_entry_kind='expense' and p_category not in (
        'gateway_fee','tax','shipping_subsidy','refund','chargeback','operational_expense'))
     or (p_entry_kind='promo_funding' and p_category<>'promo_reserve')
     or (p_entry_kind='promo_spend' and p_category<>'promo_shipping') then
    raise exception 'Categoria incompatível com o tipo de lancamento.';
  end if;

  -- Serializa gastos promocionais para impedir consumo simultaneo acima do caixa.
  if p_entry_kind in ('promo_funding','promo_spend') then
    perform pg_advisory_xact_lock(hashtext('refugiart_promo_reserve')::bigint);
  end if;

  if exists(select 1 from public.refugiart_platform_cost_entries
            where idempotency_key=trim(p_idempotency_key)) then
    select id into v_id from public.refugiart_platform_cost_entries
      where idempotency_key=trim(p_idempotency_key);
    return jsonb_build_object('success',true,'already_recorded',true,'entry_id',v_id);
  end if;

  if p_entry_kind='promo_spend' then
    v_balance:=public.refugiart_promo_reserve_balance();
    if v_balance<p_amount then
      raise exception 'Reserva promocional insuficiente. Disponivel: R$ %.',to_char(v_balance,'FM999999990D00');
    end if;
  end if;

  insert into public.refugiart_platform_cost_entries(
    entry_kind,category,amount,order_id,reference,idempotency_key,description
  ) values (
    p_entry_kind,p_category,p_amount,p_order_id,nullif(trim(p_reference),''),
    trim(p_idempotency_key),nullif(trim(p_description),'')
  ) returning id into v_id;

  return jsonb_build_object(
    'success',true,'entry_id',v_id,
    'promo_reserve_balance',public.refugiart_promo_reserve_balance()
  );
end;
$$;

-- Visao gerencial: comissao bruta, despesas e resultado de contribuicao.
-- Nao inclui despesas ainda nao registradas nem substitui contabilidade fiscal.
create or replace view public.refugiart_platform_monthly_financial_summary as
with commissions as (
  select date_trunc('month',created_at) as month,
         sum(amount)::numeric(12,2) as gross_commission
  from public.refugiart_platform_ledger
  group by 1
),
costs as (
  select date_trunc('month',created_at) as month,
         sum(amount) filter (where entry_kind='expense')::numeric(12,2) as operating_costs,
         sum(amount) filter (where entry_kind='promo_spend')::numeric(12,2) as promo_costs,
         sum(amount) filter (where category='gateway_fee')::numeric(12,2) as gateway_fees,
         sum(amount) filter (where category='tax')::numeric(12,2) as taxes,
         sum(amount) filter (where category='shipping_subsidy')::numeric(12,2) as shipping_subsidies,
         sum(amount) filter (where category='refund')::numeric(12,2) as refunds,
         sum(amount) filter (where category='chargeback')::numeric(12,2) as chargebacks,
         sum(amount) filter (where category='operational_expense')::numeric(12,2) as other_operating_expenses
  from public.refugiart_platform_cost_entries
  group by 1
),
months as (
  select month from commissions
  union
  select month from costs
)
select m.month,
       coalesce(c.gross_commission,0)::numeric(12,2) as gross_commission,
       coalesce(k.gateway_fees,0)::numeric(12,2) as gateway_fees,
       coalesce(k.taxes,0)::numeric(12,2) as taxes,
       coalesce(k.shipping_subsidies,0)::numeric(12,2) as shipping_subsidies,
       coalesce(k.refunds,0)::numeric(12,2) as refunds,
       coalesce(k.chargebacks,0)::numeric(12,2) as chargebacks,
       coalesce(k.other_operating_expenses,0)::numeric(12,2) as other_operating_expenses,
       coalesce(k.promo_costs,0)::numeric(12,2) as promo_costs,
       (coalesce(k.operating_costs,0)+coalesce(k.promo_costs,0))::numeric(12,2) as total_costs,
       (coalesce(c.gross_commission,0)-coalesce(k.operating_costs,0)-coalesce(k.promo_costs,0))::numeric(12,2)
         as contribution_result_before_unrecorded_costs
from months m
left join commissions c using(month)
left join costs k using(month);

revoke all on public.refugiart_platform_monthly_financial_summary from public,anon,authenticated;
grant select on public.refugiart_platform_monthly_financial_summary to service_role;

revoke all on function public.refugiart_promo_reserve_balance() from public,anon,authenticated;
grant execute on function public.refugiart_promo_reserve_balance() to service_role;
revoke all on function public.refugiart_record_platform_cost(text,text,numeric,text,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.refugiart_record_platform_cost(text,text,numeric,text,bigint,text,text)
  to service_role;

commit;
