# RefugiART — revisão técnica da base financeira

Data da revisão: 30/10/2026  
Escopo: migrations 001, 003, 004, 005, 006 e 007, comparadas entre si no branch `main`.

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

- **Confirmação antecipada de entrega:** a RPC `refugiart_buyer_confirm_delivery` aceita pedidos em `paid` e `awaiting_shipment`, além de `shipped` e `delivered`. Isso permite que uma confirmação acidental ou prematura libere o saldo antes de o pedido ser postado. Restringir a confirmação de transportadora a pedido efetivamente enviado (`shipped`) e manter o código de uso único como caminho de entrega pessoal/retirada.
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
