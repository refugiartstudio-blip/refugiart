-- RefugiART: trilha segura para reembolsos e chargebacks.
-- Esta migration registra casos e bloqueia repasses ainda nao liberados.
-- Nao movimenta dinheiro do provedor nem cria saldo negativo na carteira.

begin;

create table if not exists public.refugiart_financial_cases (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.refugiart_orders(id) on delete restrict,
  case_type text not null check (case_type in ('refund','chargeback')),
  status text not null default 'open'
    check (status in ('open','under_review','accepted','rejected','recovered','closed')),
  amount numeric(12,2) not null check (amount > 0),
  provider text,
  provider_case_id text,
  idempotency_key text not null unique,
  reason text not null,
  evidence_reference text,
  seller_payout_was_released boolean not null default false,
  recovery_amount numeric(12,2) not null default 0 check (recovery_amount >= 0),
  resolution text,
  opened_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check (recovery_amount <= amount),
  unique(provider,provider_case_id)
);

create index if not exists refugiart_financial_cases_order_idx
  on public.refugiart_financial_cases(order_id,opened_at desc);
create index if not exists refugiart_financial_cases_open_idx
  on public.refugiart_financial_cases(status,opened_at)
  where status in ('open','under_review');

alter table public.refugiart_financial_cases enable row level security;
revoke all on public.refugiart_financial_cases from public,anon,authenticated;
grant all on public.refugiart_financial_cases to service_role;

-- Entrada idempotente para notificacoes do gateway ou abertura administrativa.
-- Requer chamada pelo backend confiavel/service_role, nunca pelo navegador.
create or replace function public.refugiart_register_financial_case(
  p_order_id bigint,
  p_case_type text,
  p_amount numeric,
  p_idempotency_key text,
  p_reason text,
  p_provider text default null,
  p_provider_case_id text default null,
  p_evidence_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.refugiart_orders%rowtype;
  v_case public.refugiart_financial_cases%rowtype;
  v_id bigint;
begin
  if p_case_type not in ('refund','chargeback')
     or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
     or p_idempotency_key is null or length(trim(p_idempotency_key))<8
     or p_reason is null or length(trim(p_reason))<5 then
    raise exception 'Dados do caso financeiro invalidos.';
  end if;

  select * into v_order
  from public.refugiart_orders
  where id=p_order_id
  for update;
  if not found then raise exception 'Pedido nao encontrado.'; end if;
  if p_amount>v_order.total_amount then
    raise exception 'Valor do caso excede o total pago pelo comprador.';
  end if;

  select * into v_case
  from public.refugiart_financial_cases
  where idempotency_key=trim(p_idempotency_key)
  for update;
  if found then
    if v_case.order_id<>p_order_id
       or v_case.case_type<>p_case_type
       or v_case.amount<>p_amount
       or v_case.provider is distinct from nullif(trim(p_provider),'')
       or v_case.provider_case_id is distinct from nullif(trim(p_provider_case_id),'') then
      raise exception 'Chave idempotente reutilizada com dados diferentes.';
    end if;
    return jsonb_build_object('success',true,'already_registered',true,'case_id',v_case.id);
  end if;

  if exists (
    select 1 from public.refugiart_financial_cases
    where order_id=p_order_id and status in ('open','under_review')
  ) then
    raise exception 'Ja existe caso financeiro em aberto para este pedido.';
  end if;

  insert into public.refugiart_financial_cases(
    order_id,case_type,amount,provider,provider_case_id,idempotency_key,
    reason,evidence_reference,seller_payout_was_released
  ) values (
    p_order_id,p_case_type,p_amount,nullif(trim(p_provider),''),
    nullif(trim(p_provider_case_id),''),trim(p_idempotency_key),
    trim(p_reason),nullif(trim(p_evidence_reference),''),
    v_order.payout_released_at is not null
  ) returning id into v_id;

  -- Suspende o pedido e impede novos repasses se o saldo ainda estiver pendente.
  if v_order.payout_released_at is null then
    update public.refugiart_orders
    set status='refund_pending',delivery_status='disputed',updated_at=clock_timestamp()
    where id=p_order_id;
  end if;

  insert into public.refugiart_delivery_events(
    order_id,actor_id,event_type,delivery_method,notes
  ) values (
    p_order_id,null,'dispute_opened',coalesce(v_order.delivery_method,'carrier'),
    'Caso financeiro registrado: '||p_case_type||' #'||v_id
  );

  return jsonb_build_object(
    'success',true,'case_id',v_id,
    'seller_payout_was_released',v_order.payout_released_at is not null,
    'automatic_wallet_debit',false
  );
end;
$$;

revoke all on function public.refugiart_register_financial_case(
  bigint,text,numeric,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.refugiart_register_financial_case(
  bigint,text,numeric,text,text,text,text,text
) to service_role;

commit;


-- Defesa em profundidade: mesmo que outra RPC tente confirmar entrega ou
-- liberar repasse, um caso financeiro aberto mantem o bloqueio.
create or replace function public.refugiart_block_payout_with_financial_case()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if exists (
    select 1 from public.refugiart_financial_cases c
    where c.order_id=new.id and c.status in ('open','under_review')
  ) then
    if new.delivery_status='confirmed' and
       coalesce(old.delivery_status,'') is distinct from 'confirmed' then
      raise exception 'Existe caso financeiro aberto; a entrega nao pode liberar o repasse.';
    end if;
    if new.payout_released_at is not null and old.payout_released_at is null then
      raise exception 'Existe caso financeiro aberto; o repasse permanece bloqueado.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refugiart_block_payout_with_financial_case on public.refugiart_orders;
create trigger trg_refugiart_block_payout_with_financial_case
before update on public.refugiart_orders
for each row execute function public.refugiart_block_payout_with_financial_case();

revoke all on function public.refugiart_block_payout_with_financial_case()
  from public,anon,authenticated;
grant execute on function public.refugiart_block_payout_with_financial_case()
  to service_role;
