-- RefugiART: rateio exato de subsidio entre pacotes de um checkout.
-- Evita diferencas de centavos quando ha varios artistas/remessas.
-- Requer migration 006.

begin;

create or replace function public.refugiart_calculate_group_shipping_subsidy(
  p_cart_subtotal numeric,
  p_total_commission numeric,
  p_packages jsonb,
  p_campaign_threshold numeric default 300
) returns jsonb
language plpgsql
immutable
set search_path=public
as $$
declare
  v_total_shipping numeric(12,2);
  v_pool numeric(12,2);
  v_total_subsidy numeric(12,2);
  v_campaign_eligible boolean;
  v_result jsonb;
begin
  if p_cart_subtotal is null or p_total_commission is null
     or p_packages is null or jsonb_typeof(p_packages)<>'array'
     or p_campaign_threshold is null
     or p_cart_subtotal<0 or p_total_commission<0 or p_campaign_threshold<0 then
    raise exception 'Dados invalidos para rateio do frete.';
  end if;

  if jsonb_array_length(p_packages)=0 then
    raise exception 'Informe ao menos um pacote.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_packages) e
    where coalesce(e->>'package_id','')=''
       or coalesce(e->>'shipping','') !~ '^\d+(\.\d{1,2})?$'
  ) then
    raise exception 'Cada pacote precisa de package_id e frete positivo ou zero com ate duas casas decimais.';
  end if;

  if (select count(*) from jsonb_array_elements(p_packages) e)
     <> (select count(distinct e->>'package_id') from jsonb_array_elements(p_packages) e) then
    raise exception 'Os identificadores dos pacotes devem ser unicos.';
  end if;

  select sum((e->>'shipping')::numeric)::numeric(12,2)
  into v_total_shipping
  from jsonb_array_elements(p_packages) e;

  if exists(select 1 from jsonb_array_elements(p_packages) e where (e->>'shipping')::numeric<0) then
    raise exception 'O frete de cada pacote nao pode ser negativo.';
  end if;

  v_campaign_eligible:=p_cart_subtotal>=p_campaign_threshold;
  v_pool:=round(p_total_commission*0.20,2);
  v_total_subsidy:=least(v_total_shipping,v_pool);

  with raw_packages as (
    select e->>'package_id' as package_id,
           (e->>'shipping')::numeric(12,2) as shipping,
           ordinality,
           case when v_total_shipping=0 then 0::numeric
                else v_total_subsidy*(e->>'shipping')::numeric/v_total_shipping end as raw_share
    from jsonb_array_elements(p_packages) with ordinality as x(e,ordinality)
  ),
  base_shares as (
    select *,
           floor(raw_share*100)/100 as base_share,
           raw_share-floor(raw_share*100)/100 as fractional_cent
    from raw_packages
  ),
  residual as (
    select round((v_total_subsidy-coalesce(sum(base_share),0))*100)::integer as cents
    from base_shares
  ),
  ranked as (
    select b.*,
           row_number() over(order by fractional_cent desc, package_id asc, ordinality asc) as remainder_rank,
           r.cents
    from base_shares b cross join residual r
  ),
  final_shares as (
    select package_id,shipping,
           least(shipping,base_share+
             case when remainder_rank<=cents then 0.01 else 0 end
           )::numeric(12,2) as subsidy
    from ranked
  )
  select jsonb_build_object(
    'campaign_eligible',v_campaign_eligible,
    'campaign_threshold',p_campaign_threshold,
    'cart_subtotal',round(p_cart_subtotal,2),
    'commission_pool',v_pool,
    'total_shipping',v_total_shipping,
    'total_subsidy',v_total_subsidy,
    'buyer_shipping_total',v_total_shipping-v_total_subsidy,
    'packages',coalesce(jsonb_agg(jsonb_build_object(
      'package_id',package_id,
      'shipping',shipping,
      'subsidy',subsidy,
      'buyer_shipping',shipping-subsidy
    ) order by package_id),'[]'::jsonb)
  )
  into v_result
  from final_shares;

  return v_result;
end;
$$;

revoke all on function public.refugiart_calculate_group_shipping_subsidy(numeric,numeric,jsonb,numeric)
  from public,anon,authenticated;
grant execute on function public.refugiart_calculate_group_shipping_subsidy(numeric,numeric,jsonb,numeric)
  to service_role;

commit;
