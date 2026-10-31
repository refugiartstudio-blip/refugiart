-- RefugiART | Diagnostico de conciliacao financeira
-- SOMENTE LEITURA: execute no SQL Editor do Supabase depois das migrations.
-- Nao altera carteiras, pedidos, pagamentos ou lancamentos.
-- A conciliacao contabil definitiva depende da integracao com o gateway.

-- 1) Pedidos pagos: compare total do pedido com o identificador externo.
select
  id, buyer_id, seller_id, status, subtotal, shipping_amount, total_amount,
  payment_provider, provider_payment_id, paid_at,
  platform_commission_rate, platform_commission_amount,
  payout_released_at, delivery_status
from public.refugiart_orders
where status <> 'pending_payment'
order by created_at desc;

-- 2) Pedidos sem identificador externo de pagamento.
-- Revisar manualmente: pode haver dados legados ou pagamentos ainda nao integrados.
select id,status,total_amount,payment_provider,provider_payment_id,paid_at
from public.refugiart_orders
where status in ('paid','awaiting_shipment','shipped','delivered','refund_pending','refunded')
  and (provider_payment_id is null or payment_provider is null)
order by created_at desc;

-- 3) Creditos de venda pendentes que ainda nao foram liberados.
select
  o.id as order_id,o.status,o.seller_id,o.subtotal,
  w.pending_balance,
  tx.id as pending_transaction_id,tx.amount as pending_credit,
  o.delivery_status,o.payout_released_at
from public.refugiart_orders o
left join public.refugiart_wallet_transactions tx
  on tx.related_order_id=o.id
 and tx.user_id=o.seller_id
 and tx.transaction_type='sale'
 and tx.direction='credit'
 and tx.status='pending'
left join public.refugiart_wallets w on w.user_id=o.seller_id
where o.payout_released_at is null
  and o.status in ('paid','awaiting_shipment','shipped','delivered','refund_pending','disputed')
order by o.created_at;

-- 4) Pedidos marcados como liberados: conferir lancamento liquido e comissao.
select
  o.id as order_id,o.seller_id,o.subtotal,
  o.platform_commission_amount,
  o.payout_released_at,
  count(tx.id) filter (
    where tx.idempotency_key='seller-payout-net:'||o.id
      and tx.status='confirmed'
  ) as net_credit_entries,
  coalesce(sum(tx.amount) filter (
    where tx.idempotency_key='seller-payout-net:'||o.id
      and tx.status='confirmed'
  ),0) as net_credit_amount,
  count(tx.id) filter (
    where tx.idempotency_key='seller-platform-commission:'||o.id
      and tx.status='confirmed'
  ) as commission_debit_entries,
  count(pl.id) as platform_commission_entries,
  coalesce(sum(pl.amount),0) as platform_commission_ledger_amount
from public.refugiart_orders o
left join public.refugiart_wallet_transactions tx on tx.related_order_id=o.id
left join public.refugiart_platform_ledger pl
  on pl.order_id=o.id and pl.entry_type='commission'
where o.payout_released_at is not null
group by o.id,o.seller_id,o.subtotal,o.platform_commission_amount,o.payout_released_at
having
  count(tx.id) filter (
    where tx.idempotency_key='seller-payout-net:'||o.id
      and tx.status='confirmed'
  ) <> 1
  or count(tx.id) filter (
    where tx.idempotency_key='seller-platform-commission:'||o.id
      and tx.status='confirmed'
  ) <> case when o.platform_commission_amount>0 then 1 else 0 end
  or count(pl.id) <> case when o.platform_commission_amount>0 then 1 else 0 end
  or coalesce(sum(tx.amount) filter (
    where tx.idempotency_key='seller-payout-net:'||o.id
      and tx.status='confirmed'
  ),0) <> o.subtotal-o.platform_commission_amount
  or coalesce(sum(pl.amount),0) <> o.platform_commission_amount
order by o.payout_released_at desc;

-- 5) Casos de reembolso/chargeback abertos ou em revisao.
select
  c.id,c.order_id,c.case_type,c.status,c.amount,
  c.seller_payout_was_released,c.recovery_amount,
  c.provider,c.provider_case_id,c.opened_at
from public.refugiart_financial_cases c
where c.status in ('open','under_review')
order by c.opened_at;

-- 6) Lancamentos de custos sem referencia a pedido, quando ela seria esperada.
select id,entry_kind,category,amount,idempotency_key,description,created_at
from public.refugiart_platform_cost_entries
where category in ('gateway_fee','shipping_subsidy','refund','chargeback')
  and order_id is null
order by created_at desc;

-- IMPORTANTE:
-- As consultas acima sao alertas de conciliacao, nao prova de saldo bancario.
-- Nao some a coluna amount de todas as transacoes para inferir saldo:
-- os movimentos de reserva, liberacao, reversao e credito pendente possuem
-- semanticas diferentes. A conciliacao final exige extrato/API do gateway,
-- eventos assinados, taxas efetivas, estornos e saques confirmados.
