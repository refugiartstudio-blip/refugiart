# Saques e pagamentos aos artistas — arquitetura e pendências

## Estado atual

A carteira existente possui:
- `available_balance`: valor livre para novas operações;
- `pending_balance`: vendas ainda sujeitas à confirmação de entrega;
- `reserved_balance`: valores comprometidos em lances de leilão.

O livro-razão `refugiart_wallet_transactions` já prevê `transaction_type='withdrawal'`, mas isso **não significa que exista saque Pix implementado**. Não há, nesta etapa, solicitação de saque, validação de titularidade, integração bancária, confirmação de transferência ou tratamento de devolução.

## Regra financeira obrigatória

1. Só pode ser solicitado saque do saldo disponível.
2. Saldo pendente de venda e saldo reservado em leilão nunca podem ser sacados.
3. A solicitação deve reservar o valor de forma atômica, impedindo gasto duplo.
4. A reserva de saque deve ser separada da reserva de leilão. Não reutilizar `reserved_balance` atual sem separar os subtipos: criar `withdrawal_reserved_balance` ou uma tabela de reservas que permita reconciliar cada origem.
5. Uma solicitação não equivale a pagamento. O status só muda para pago após confirmação confiável do provedor ou conciliação administrativa com comprovante verificável.
6. Toda ação deve ter chave idempotente e referência externa única quando houver.
7. Falha, rejeição ou expiração deve devolver a reserva ao saldo disponível uma única vez.
8. Não permitir que o artista altere o status para pago nem informe uma referência de provedor como se fosse confirmação.
9. O nome/CPF do titular da chave Pix deve ser validado conforme exigências do provedor e regras aplicáveis; não armazenar dados bancários desnecessários.
10. Definir valor mínimo, tarifas, prazo operacional, limites diários e tratamento de contas de terceiros antes de habilitar saques.

## Estados propostos

- `requested`: solicitação criada; valor já reservado.
- `under_review`: análise antifraude/administrativa.
- `processing`: enviado ao provedor; aguarda resposta.
- `paid`: transferência confirmada pelo provedor.
- `rejected`: rejeitada antes do envio; reserva devolvida.
- `failed`: provedor confirmou falha; reserva devolvida.
- `cancelled`: cancelada antes do processamento; reserva devolvida.
- `reconciliation_required`: estado ambíguo (timeout ou resposta inconclusiva); manter valor reservado até conciliação, nunca devolver automaticamente.

## Modelo de dados recomendado (ainda não implementado)

Tabela `refugiart_payout_requests`:
- id, user_id, amount, currency BRL;
- status e timestamps de cada transição;
- referência da conta/chave Pix tokenizada ou identificador do destinatário no provedor;
- nome/CPF mascarados para exibição, quando permitido;
- provider, provider_transfer_id único;
- idempotency_key única;
- motivo de falha/rejeição e referência de conciliação;
- created_at, updated_at, paid_at.

Tabela de eventos/auditoria:
- payout_request_id, ator, estado anterior/novo, código de evento do provedor, referência externa, payload mínimo sanitizado e timestamp.
- Não guardar segredo, token de acesso, chave privada ou payload com dados pessoais desnecessários.

Coluna ou subconta independente para reserva de saques:
- disponível não pode ficar negativo;
- reserva de saque não pode ultrapassar disponível;
- soma de solicitações em estados reservados deve reconciliar com a reserva contábil;
- a reserva de leilões permanece segregada.

## RPCs/serviços que deverão existir

1. Criar solicitação: autenticada pelo artista, trava a carteira, valida saldo, reserva valor e grava pedido/evento numa transação.
2. Cancelar solicitação: permitido apenas antes do envio ao provedor; idempotente.
3. Enviar ao provedor: somente backend confiável; chave idempotente estável.
4. Receber webhook: validar assinatura, timestamp e idempotência; nunca confiar em chamada do navegador.
5. Confirmar pagamento: somente após evento autenticado/consulta de status no provedor; efetuar débito da reserva e registrar transação `withdrawal`.
6. Falha/rejeição: devolver reserva uma única vez e registrar evento.
7. Conciliação: comparar pedidos internos com transferências do provedor e extrato; divergências vão para `reconciliation_required`.

## Por que a implementação foi deixada pendente

A integração depende da escolha de um provedor que aceite marketplace/intermediação, faça pagamentos Pix a terceiros e permita consulta/webhooks confiáveis. A escolha afeta taxas, KYC, split, responsabilidade por chargebacks e regras de saque. Implementar uma transferência fictícia ou marcar saque como pago sem confirmação criaria risco financeiro.

**Decisão atual:** manter saques Pix desabilitados. O documento orienta a implementação posterior sem alterar carteiras ou movimentar dinheiro.
