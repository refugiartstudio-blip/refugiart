-- RefugiART: impede liberacao de saldo por confirmacao prematura em envio por transportadora.
-- Requer migrations 001, 003, 004, 005, 006 e 007.
-- Mantem a confirmacao por codigo para entrega pessoal/retirada.

begin;

create or replace function public.refugiart_buyer_confirm_delivery(p_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.refugiart_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Faca login.';
  end if;

  select * into v_order
  from public.refugiart_orders
  where id = p_order_id and buyer_id = auth.uid()
  for update;

  if not found then
    raise exception 'Pedido nao encontrado para este comprador.';
  end if;

  if v_order.status not in ('paid','awaiting_shipment','shipped','delivered') then
    raise exception 'Estado do pedido nao permite confirmacao.';
  end if;

  if v_order.delivery_status = 'disputed' then
    raise exception 'Pedido em disputa: a liberacao esta suspensa.';
  end if;

  if v_order.delivery_status = 'confirmed' then
    return jsonb_build_object('success',true,'already_confirmed',true);
  end if;

  -- Para transportadora, o comprador nao pode confirmar antes da postagem.
  -- A confirmacao continua sendo uma declaracao explicita de recebimento,
  -- mas exige que o pedido ja tenha avancado para o estado enviado.
  if v_order.delivery_method = 'carrier'
     and v_order.status not in ('shipped','delivered') then
    raise exception 'O pedido ainda nao foi enviado. A confirmacao de recebimento esta bloqueada.';
  end if;

  update public.refugiart_orders
  set delivery_status = 'confirmed',
      delivery_confirmed_at = clock_timestamp(),
      status = 'delivered'
  where id = p_order_id;

  insert into public.refugiart_delivery_events(
    order_id,actor_id,event_type,delivery_method
  ) values (
    p_order_id,auth.uid(),'buyer_confirmed',v_order.delivery_method
  );

  return public.refugiart_release_seller_payout(p_order_id,'buyer_confirmation');
end;
$$;

revoke all on function public.refugiart_buyer_confirm_delivery(bigint)
  from public, anon;
grant execute on function public.refugiart_buyer_confirm_delivery(bigint)
  to authenticated;

commit;
