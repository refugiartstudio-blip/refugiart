-- RefugiART: impede reutilizacao silenciosa de chave idempotente com valores diferentes.
-- Requer migration 009.

begin;

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
  v_existing public.refugiart_platform_cost_entries%rowtype;
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
    raise exception 'Categoria incompativel com o tipo de lancamento.';
  end if;

  if p_entry_kind in ('promo_funding','promo_spend') then
    perform pg_advisory_xact_lock(hashtext('refugiart_promo_reserve')::bigint);
  end if;

  select * into v_existing
  from public.refugiart_platform_cost_entries
  where idempotency_key=trim(p_idempotency_key)
  for update;

  if found then
    if v_existing.entry_kind<>p_entry_kind
       or v_existing.category<>p_category
       or v_existing.amount<>p_amount
       or v_existing.order_id is distinct from p_order_id
       or v_existing.reference is distinct from nullif(trim(p_reference),'') then
      raise exception 'Chave idempotente ja utilizada com dados diferentes.';
    end if;
    return jsonb_build_object(
      'success',true,'already_recorded',true,'entry_id',v_existing.id,
      'promo_reserve_balance',public.refugiart_promo_reserve_balance()
    );
  end if;

  if p_entry_kind='promo_spend' then
    v_balance:=public.refugiart_promo_reserve_balance();
    if v_balance<p_amount then
      raise exception 'Reserva promocional insuficiente. Saldo disponivel: R$ %.',
        to_char(v_balance,'FM999999990D00');
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

revoke all on function public.refugiart_record_platform_cost(text,text,numeric,text,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.refugiart_record_platform_cost(text,text,numeric,text,bigint,text,text)
  to service_role;

commit;
