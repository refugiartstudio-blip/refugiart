# RefugiART — roteiro de validação financeira

Este roteiro é para ambiente de desenvolvimento/homologação. Não usar dinheiro real.

## Ordem das migrações

1. `moderação-comunidade.sql` (reaplicar a versão corrigida, após revisar políticas existentes).
2. `migrations/20261030_auction_balloon_system.sql`.
3. `migrations/20261030_003_orders_shipping_disputes.sql`.
4. `migrations/20261030_004_auction_reservations.sql`.
5. `migrations/20261030_005_auction_settlement_safety.sql`.
6. `agendar-encerramento-leiloes.sql` somente depois de validar a função e confirmar que pg_cron está habilitado.

A ordem deve ser confirmada contra o estado real do projeto antes de executar. Os arquivos não foram executados neste repositório remoto.

## Pré-condições

- Criar usuários de teste distintos: artista, participante A, participante B e usuário sem saldo.
- Confirmar que cada usuário possui carteira.
- Creditar saldo exclusivamente por procedimento administrativo de teste, nunca por update no navegador.
- Criar uma obra publicada e um leilão de teste com preço inicial conhecido.
- Verificar políticas RLS, grants, triggers e tipos de colunas existentes.
- Não habilitar checkout, Pix, saque ou lances em produção antes dos testes.

## Cenários de lance

1. Participante A oferta o lance mínimo: saldo disponível diminui e reservado aumenta pelo mesmo valor.
2. A aumenta o próprio lance: somente a diferença adicional é reservada.
3. Participante B supera A: reserva de A retorna ao disponível; B fica reservado.
4. A volta a ofertar: uma nova reserva é criada/reativada sem duplicar a reserva anterior.
5. Participante sem saldo tenta ofertar: operação falha sem criar lance ou movimentação.
6. Artista tenta ofertar na própria obra: operação falha.
7. Lance no instante/apos o encerramento: operação falha com base no relógio do banco.
8. Duas ofertas concorrentes: nenhuma carteira fica negativa e somente uma sequência válida é registrada.
9. Reexecutar encerramento: nenhum pedido, captura ou crédito duplicado.
10. Leilão sem lance: encerra sem vencedor e sem movimentação financeira.

## Cenários de encerramento com vencedor

- A reserva do vencedor é capturada uma única vez.
- O saldo reservado do vencedor diminui.
- O valor do artista entra como pendente, não disponível.
- As reservas dos demais participantes são liberadas.
- É criado um pedido único vinculado ao leilão.
- O pedido fica em `awaiting_shipment`, com pagamento interno registrado e prazo de três dias úteis.
- É criada uma remessa em `awaiting_post`.
- O frete fica explicitamente `pending_quote`; o valor do lance não deve ser apresentado como frete grátis.
- O item preserva o título/legenda e o preço do momento da venda.
- Qualquer inconsistência deve abortar toda a transação, sem liquidar parcialmente.

## Limitações ainda abertas

- Não há integração com provedor de pagamento externo.
- O checkout da sacola não cria pedidos nem recebe pagamentos.
- O prazo de três dias úteis depende do calendário de feriados preenchido e revisado.
- Ainda não existe verificação oficial automática de rastreamento/postagem.
- Ainda não existe processo de reembolso via provedor nem tratamento completo de chargeback.
- O cron job precisa ser instalado e monitorado.
- A função de lance ainda não deve ser ligada à interface pública antes da revisão técnica e dos testes de concorrência, RLS e saldos.
