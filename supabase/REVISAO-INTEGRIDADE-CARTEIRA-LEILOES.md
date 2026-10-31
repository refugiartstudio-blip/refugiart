# RefugiART — integridade da carteira e dos leilões

Data: 2026-10-31
Tipo: auditoria estática das migrations 004, 005, 007, 012 e 013. Não houve execução em PostgreSQL/Supabase.

## 1. Controles positivos identificados

- A carteira separa saldo disponível, pendente e reservado.
- A RPC de lance exige usuário autenticado, impede lance do próprio artista, verifica leilão ativo e obra publicada, valida duas casas decimais e exige saldo disponível.
- O lance bloqueia a linha do leilão e a carteira do participante, reduzindo risco de lances concorrentes e gasto duplo no mesmo leilão.
- Ao aumentar o próprio lance, somente a diferença é reservada; ao ser superado, o líder anterior tem a reserva liberada.
- A liquidação exige reserva ativa suficiente para o vencedor; captura a reserva, cria pedido/item/remessa na mesma transação e credita o artista em saldo pendente.
- A migration 012 corrige o encerramento sem vencedor, liberando reservas ativas com atualização de carteira, estado de reserva e ledger na mesma transação.
- O repasse do artista verifica entrega confirmada, disputa aberta, crédito pendente vinculado ao pedido, saldo pendente e idempotência por timestamp do pedido.
- A comissão é registrada separadamente no livro-razão da plataforma.
- Casos financeiros de refund/chargeback bloqueiam confirmação de entrega e liberação de repasse enquanto abertos ou em análise.

## 2. Riscos e lacunas encontrados

### ALTO — Falta de verificação explícita da reserva do líder anterior ao liberar
Na RPC `refugiart_place_auction_bid` da migration 004, quando o novo lance supera outro participante, a função procura a reserva ativa anterior. Se não a encontrar, o fluxo atual não aborta explicitamente antes de concluir o novo lance.

Risco: se houver inconsistência anterior de dados, o lance novo pode ser aceito sem que a reserva do líder anterior seja liberada, deixando saldo reservado preso ou divergente.

Correção proposta, após teste:
- Se existe lance líder anterior de outro usuário, exigir exatamente uma reserva ativa correspondente.
- Exigir saldo reservado suficiente na carteira anterior.
- Se qualquer condição falhar, abortar toda a transação e encaminhar para conciliação.
**Status: pendente — não alterado sem teste PostgreSQL.**

### ALTO — Ordem de bloqueio de carteiras na RPC de lances pode gerar deadlock entre leilões diferentes
A função bloqueia primeiro a carteira do participante atual e depois pode bloquear a carteira do líder anterior. Em dois leilões simultâneos, dois participantes podem bloquear suas próprias carteiras e tentar bloquear uma à outra.

Risco: deadlock e falha de uma das transações. O PostgreSQL normalmente aborta uma transação, sem confirmar metade das alterações, mas isso causa erro ao usuário e precisa de tratamento/retry seguro.

Correção proposta:
- Determinar previamente os IDs de todas as carteiras envolvidas.
- Bloquear todas em ordem determinística por UUID, antes de alterar saldos.
- Revalidar liderança e reserva após os locks.
**Status: pendente — requer teste concorrente.**

### ALTO — Liquidação deve verificar todas as invariantes de reserva e carteira
A função de encerramento já valida a reserva do vencedor e o saldo reservado dos demais. Ainda é necessário testar:
- carteira inexistente;
- reserva ativa duplicada ou ausente;
- reserva maior/menor que o lance;
- saldo reservado divergente;
- falha ao inserir pedido ou ledger;
- duas execuções concorrentes do cron;
- rollback integral quando qualquer etapa falha.

A transação deve falhar por inteiro em qualquer divergência, sem marcar leilão como encerrado.
**Status: pendente — testes SQL documentados, não executados.**

### MÉDIO — Encerramento sem vencedor precisa de monitoramento
A migration 012 libera reservas sem vencedor, mas se uma carteira estiver divergente, a exceção aborta a execução do lote. Um leilão inconsistente pode permanecer ativo/vencido até correção manual.

Ação: monitorar leilões vencidos com reservas ativas, registrar falhas de cron e alertar administrador; não forçar liberação por ajuste manual sem reconciliação.
**Status: pendente — observabilidade.**

### ALTO — Casos de refund/chargeback não possuem fluxo de resolução financeira
A migration 013 registra casos e bloqueia repasse enquanto status `open` ou `under_review`. Não há função de resolução que:
- registre decisão administrativa e evidências;
- processe reembolso real no gateway;
- trate casos aceitos após repasse;
- recupere valor do artista de forma autorizada;
- impeça saldo negativo ou saque de valores em disputa;
- concilie o retorno do provedor.

Risco: registro do caso não equivale a estorno. Não marcar caso como resolvido/recuperado manualmente sem conciliação do dinheiro real.
**Status: pendente — depende do provedor de pagamento e fluxo administrativo.**

### MÉDIO — Repasse interno não é saque Pix
A RPC de liberação move valor pendente para disponível e destaca comissão. Isso não significa que o dinheiro foi pago ao artista em conta bancária. Saques continuam desabilitados até integração com provedor, KYC, reserva de saque e confirmação do pagamento.

### MÉDIO — Código presencial usa MD5
O código de entrega fica armazenado como MD5. Apesar de ter uso único, expiração e limite de tentativas, MD5 não é a opção recomendada para armazenar códigos. Migrar para hash forte com salt/pgcrypto ou HMAC com segredo mantido no backend, após verificar extensão e ambiente. Não expor o segredo ao cliente.
**Status: pendente — requer pgcrypto/configuração segura.**

## 3. Invariantes financeiras obrigatórias

1. Saldo disponível nunca fica negativo.
2. Saldo reservado deve corresponder à soma das reservas ativas da carteira, consideradas todas as operações de reserva.
3. Saldo pendente deve corresponder a créditos de venda ainda não liberados, estornados ou cancelados.
4. Cada lance aceito deve ter reserva financeira suficiente.
5. Um leilão tem no máximo um vencedor e um pedido de liquidação.
6. Uma reserva capturada não pode ser liberada novamente.
7. Uma reserva liberada não pode ser capturada.
8. Cada lançamento de ledger tem chave idempotente única.
9. Comissão de leilão é 30% do valor final, não do lance inicial.
10. Repasse do artista só ocorre após entrega confirmada, sem disputa/caso financeiro aberto.
11. Saldo disponível interno não representa dinheiro sacável até existir integração Pix.
12. Toda falha em liquidação deve gerar rollback integral e alerta de conciliação.

## 4. Testes prioritários antes de habilitar lances

- Dois lances simultâneos na mesma disputa.
- Um participante cobrindo o próprio lance.
- Participante superado e reserva integralmente devolvida.
- Participantes cruzados em dois leilões simultâneos (deadlock).
- Encerramento com vencedor e múltiplos participantes.
- Encerramento sem lances, mas com reservas inconsistentes.
- Duas execuções simultâneas do encerramento.
- Falha proposital entre captura, pedido, ledger e liberação de reservas (rollback).
- Reexecução do encerramento depois de finalizado.
- Caso financeiro aberto bloqueando confirmação e repasse.
- Chargeback após repasse e tentativa de saque.
- Verificação de conciliação entre wallets, reservations, wallet_transactions, orders e platform ledger.

## 5. Decisão operacional

Manter lances financeiros e saques desabilitados até:
- correções da RPC de lance;
- testes de concorrência e rollback;
- reconciliação de saldos;
- resolução de refund/chargeback;
- integração real de pagamento e saque.

Esta auditoria é estática. Não afirma que migrations foram aplicadas ou que testes passaram.
