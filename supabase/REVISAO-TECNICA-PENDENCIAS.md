# RefugiART — revisão técnica da base financeira

Data da revisão: 30/10/2026  
Escopo: migrations 001, 003, 004, 005, 006, 007 e 008, comparadas entre si no branch `main`.

## Resultado geral

A base já contém estrutura relevante para carteiras, reservas de lance, liquidação de leilão, pedidos, remessas, disputas, política de subsídio de frete e confirmação de entrega. Isso representa implementação real de banco de dados, mas ainda não equivale a um marketplace homologado.

**Não executar em produção nem movimentar dinheiro real antes de testar as migrations em um projeto Supabase de homologação, com usuários fictícios e concorrência.**

## Pontos confirmados na leitura dos arquivos

1. **Ordem de dependências:** 003 cria pedidos e remessas; 004 depende dessas tabelas e cria reservas/lances; 005 substitui a liquidação de leilões; 006 adiciona snapshots de frete/comissão; 007 adiciona confirmação de entrega e liberação do saldo.
2. **Constraint de status:** 003 declara o status do pedido com constraint inline, cujo nome padrão PostgreSQL é `refugiart_orders_status_check`. A 007 remove e recria essa constraint incluindo `disputed`. O nome usado na 007 é compatível com a definição da 003.
3. **Comissão:** 007 define snapshot de 20% para pedido sem `auction_id` e 30% para pedido com `auction_id`. A liquidação separa o líquido do artista e registra a comissão no livro da plataforma.
4. **Confirmação presencial:** o código é emitido a pedido do comprador, armazenado como hash, expira em 48 horas, tem limite de tentativas e só pode ser consumido uma vez.
5. **Disputa:** a RPC de abertura de disputa bloqueia a liquidação enquanto houver disputa aberta ou em análise.
6. **Proteção de saldo:** a liquidação exige crédito pendente do tipo `sale`, ligado ao pedido, e confere seu valor com o subtotal.
7. **Frete:** a função 006 calcula o limite total do subsídio a partir de 20% da comissão, mas sua chamada isolada por pacote não garante o ajuste de centavos residuais do grupo. A distribuição exata precisa ocorrer em uma função de grupo ou no backend confiável.
8. **Integrações:** não foram encontradas nessas migrations integração com gateway, split de pagamento, cotador de frete, rastreamento automático ou saque Pix.

## Pendências técnicas prioritárias

### P0 — corrigir antes de liberar qualquer operação financeira

- **Confirmação antecipada de entrega:** identificada na 007 e corrigida na migration 008. Para transportadora, a confirmação do comprador agora exige status `shipped` ou `delivered`; entrega pessoal/retirada mantém o código de uso único. A correção está versionada, mas ainda precisa ser aplicada e testada no Supabase.
- **Homologar a liquidação:** testar concorrência entre confirmações, disputa simultânea, saldos pendentes de vários pedidos do mesmo artista, reexecução e idempotência.
- **Validar o fluxo de estorno:** ainda não há fluxo completo para reembolso/chargeback após pagamento ao artista, nem regra de recuperação de saldo já disponibilizado.
- **Validar as migrations no PostgreSQL:** leitura estática não confirma execução, permissões efetivas, triggers, RLS, constraints ou comportamento concorrente.

### P1 — fechar o fluxo operacional

- Implementar revisão administrativa de entrega com autorização real por papel/claim administrativo. O método `admin_review` aparece na validação interna, mas ainda não há RPC administrativa completa que registre evidência, ator e decisão.
- Criar prazo de confirmação e fila de revisão para que o artista não fique bloqueado indefinidamente quando o comprador não responde.
- Integrar consulta confiável de rastreio e prova de postagem/entrega. O evento `tracking_submitted` existe no domínio, mas não há integração automática.
- Criar função de cálculo do subsídio para o grupo inteiro, com rateio proporcional e ajuste determinístico dos centavos.
- Tratar o encerramento de leilão sem vencedor com reservas ativas como exceção de reconciliação. Pela lógica normal, reserva e lance são criados juntos; se os dados divergirem, a reserva não pode ficar esquecida.

### P2 — antes de abrir o marketplace ao público

- Cotação real por vendedor/origem, CEP, peso e dimensões.
- Checkout agrupado com pedidos separados por artista.
- Gateway compatível com marketplace/split, ou alternativa transparente ao comprador.
- Reembolso, chargeback, conciliação, taxas, tributos e custos operacionais.
- Saque Pix com validação de titularidade e trilha de auditoria.
- Painéis do comprador, artista e administração.
- Testes RLS com usuário anônimo, comprador, artista, terceiro e administrador.

## Observação sobre a margem

A comissão registrada é receita bruta da plataforma, não lucro líquido. Taxas de pagamento, tributos, reembolsos, chargebacks, suporte e operação precisam ser contabilizados separadamente. O subsídio ordinário de frete continua limitado a 20% da comissão total e ao frete real cotado; a campanha de R$ 300 representa elegibilidade, não frete grátis incondicional.

## Critério para considerar concluído

Uma etapa só deve passar para “homologada” após: migration aplicada em ambiente de teste; cenários positivos e negativos executados; RLS/grants conferidos; concorrência testada; saldos e ledger conciliados; e evidência registrada. Arquivo SQL criado no GitHub não significa que a função já esteja ativa no Supabase.


## Correção adicionada após esta revisão

A migration `20261030_008_prevent_early_delivery_confirmation.sql` substitui a RPC de confirmação do comprador. Em pedidos por transportadora, impede confirmar recebimento enquanto o pedido estiver apenas pago ou aguardando postagem. A correção foi criada no GitHub, mas não foi aplicada ao Supabase.


## Migration 009 — custos e margem da plataforma

Criada `20261030_009_platform_costs_and_promo_reserve.sql` para registrar custos reais separadamente da comissão. Inclui categorias de gateway, tributos, subsídio de frete, reembolso, chargeback e despesas operacionais, além de reserva promocional com saldo financiado e bloqueio de gasto acima do disponível. Cria visão mensal de resultado de contribuição antes de custos não registrados.

**Limite atual:** os registros ainda dependem de integração do backend; criar a tabela não lança automaticamente taxas, tributos ou subsídios. O relatório não deve ser chamado de lucro líquido enquanto custos estiverem faltando. A migration precisa ser aplicada e testada em homologação.

### Pendências financeiras adicionais

- Integrar cada evento de pagamento/cotação/reembolso ao lançamento idempotente correspondente no livro de custos.
- Não contar aporte da reserva promocional como receita operacional; contar somente o gasto promocional como custo.
- Criar painel interno que mostre comissão bruta, custos por categoria, resultado de contribuição, saldo da reserva promocional e margem percentual.
- Definir limites de aprovação para despesas manuais e trilha de auditoria.
- Validar o relatório mensal com conciliação de pedidos, ledger de comissão e extratos do provedor.


## Migration 010 — rateio exato do subsídio

Criada `20261030_010_exact_group_shipping_subsidy.sql`. A função recebe a lista de pacotes e fretes, calcula o teto global de 20% da comissão e distribui os centavos residuais por maiores restos. O objetivo é evitar que arredondamentos independentes por artista excedam ou deixem saldo do orçamento de subsídio sem alocação. A execução real ainda precisa de homologação PostgreSQL.


## Migration 012 — reservas em leilao sem vencedor

A migration `20261030_012_release_no_winner_auction_reservations.sql` substitui o encerramento de leiloes para devolver todas as reservas ainda ativas quando nao houver lance vencedor. Cada devolucao exige saldo reservado suficiente, muda a reserva para `released` e grava uma transacao idempotente no historico. Se qualquer participante apresentar divergencia, a transacao completa e revertida e o leilao nao e marcado como encerrado.

**Homologacao obrigatoria:** testar leilao sem lances; leilao com varios participantes e sem vencedor elegivel; reserva ativa com carteira consistente; reserva ativa com carteira inconsistente (espera-se rollback integral); execucao repetida apos encerramento (nao deve devolver duas vezes).

A migration ainda nao foi executada no Supabase nem testada em PostgreSQL real.


## Migration 013 — casos financeiros (reembolso/chargeback)

Arquivo: `migrations/20261030_013_refund_chargeback_cases.sql`

- Cria `refugiart_financial_cases` com tipo, status, valor, provedor, referência externa, chave idempotente, evidência e indicação se o repasse já ocorreu.
- RPC `refugiart_register_financial_case` restrita a `service_role`, valida pedido/valor e impede duplicidade conflitante.
- Se o repasse ainda não ocorreu, marca o pedido como `refund_pending` e `delivery_status='disputed'`.
- Trigger adicional bloqueia confirmação de entrega e liberação de repasse enquanto houver caso aberto/em revisão.
- Não faz débito automático na carteira nem presume que o gateway já devolveu o dinheiro.

**Pendências deliberadas (não liberar para produção ainda):**
1. Implementar resolução administrativa autenticada e auditável (aceitar/rejeitar/encerrar), com papéis administrativos reais; não existe RPC administrativa nesta migration.
2. Definir fluxo financeiro separado para reembolso aprovado antes do repasse e recuperação após repasse.
3. Após repasse, não há bloqueio de saque ou compensação de recebíveis futuros. A obrigação de recuperação precisa ser modelada sem permitir saldo negativo artificial.
4. Integrar webhooks assinados do gateway, validar eventos e reconciliar valores efetivamente pagos, taxas, estornos e chargebacks.
5. Revisar se o provedor permite reembolso parcial e múltiplos chargebacks por pedido; a regra atual aceita um caso aberto por pedido de cada vez.
6. Confirmar no PostgreSQL real a compatibilidade de constraints, permissões, triggers e estados existentes.

## Diagnóstico de conciliação

Arquivo: `DIAGNOSTICO-CONCILIACAO-FINANCEIRA.sql`

- Consultas somente leitura para localizar pedidos sem referência de pagamento, créditos pendentes, repasses sem lançamentos correspondentes, casos financeiros abertos e despesas sem pedido associado.
- A consulta não tenta inferir saldo bancário somando indiscriminadamente transações de tipos diferentes.
- A conciliação definitiva depende dos extratos/eventos do gateway e de integração ainda não implementada.
- Executar somente depois de aplicar e validar as migrations; não altera dados.


## Saques Pix — arquitetura documentada, implementação pendente

Arquivo: `SAQUES-PAGAMENTOS-ARTISTAS-PIX.md`

- A carteira atual distingue saldo disponível, pendente e reservado para leilões.
- O tipo de transação `withdrawal` já existe no ledger, mas não existe fluxo de saque Pix integrado.
- Não foi criada RPC nem migration de saque, para não simular transferência sem provedor.
- A futura reserva de saque deve ser segregada da reserva de leilão; não reutilizar `reserved_balance` sem separar contabilmente os compromissos.
- Estados propostos cobrem solicitação, análise, processamento, pagamento confirmado, falha e conciliação pendente.
- Webhooks precisam de assinatura validada, idempotência e conciliação com transferência real.

**Dependência externa:** selecionar provedor compatível com marketplace e Pix para terceiros, definir KYC/titularidade, tarifas, limites e regras de split. Até lá, saques permanecem desabilitados.

## Observação da auditoria de leilões

A primeira migration de reservas (004) foi substituída pela liquidação mais segura em 005, e 012 preserva essa lógica ao corrigir a liberação de reservas em leilões sem vencedor. A rotina de fechamento deve continuar sendo comparada com 005 sempre que houver alteração; não executar migrations isoladamente fora da ordem.
