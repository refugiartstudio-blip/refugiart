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


## Segurança de contas, dados e moderação — auditoria estática

Documento: `REVISAO-SEGURANCA-CONTAS-E-DADOS.md`

Achados:
- A migration `moderacao-comunidade.sql` remove todas as policies SELECT de `atelie_posts`; precisa inventário e substituição seletiva para não apagar permissões legítimas.
- O limiar automático de 10 denúncias pode ser abusado por contas coordenadas; precisa rate limit, critérios de gravidade e revisão humana.
- Falta trilha de auditoria imutável e estruturada das decisões administrativas.
- Grants e policies de notificações precisam ser validados no banco para detectar permissões adicionais.
- Revisar buckets Storage, uploads, exposição de campos de perfil e ausência de segredos no frontend.

**Status:** auditoria estática documentada; sem mudanças de policy porque o estado real do banco não foi inspecionado. Testes com contas de papéis diferentes e inventário Supabase continuam pendentes.


## Integridade de obras, anúncios e checkout — auditoria estática

Documento: `REVISAO-INTEGRIDADE-OBRAS-ANUNCIOS.md`

Controles positivos encontrados:
- A migration `20261030_auction_balloon_system.sql` revoga UPDATE geral em `atelie_posts` e libera somente a coluna `caption` para authenticated.
- A migration `20261030_003_orders_shipping_disputes.sql` desenha leitura de pedidos/itens/remessas/disputas apenas para comprador e vendedor e reserva escrita ao service_role.
- Carteira, reservas e lances têm escrita direta revogada para clientes; lances financeiros seguem bloqueados.

Pendências:
- Localizar e validar as policies reais de INSERT/DELETE de `atelie_posts`; exigir ownership no banco.
- Sacola em localStorage é manipulável: checkout futuro deve receber somente IDs/quantidades e recalcular obra, preço, vendedor, disponibilidade, comissão e frete no backend.
- Criar proteção transacional contra compra simultânea de obra única.
- Bloquear exclusão física de obras com vínculos financeiros/leilão; preferir arquivamento lógico.
- Auditar bucket `artwork-images`, policies de Storage, MIME/tamanho e prefixo por usuário.
- Não ativar checkout, pagamento, lance financeiro ou saque antes do backend transacional e dos testes reais.

**Status:** análise estática documentada; sem execução de SQL ou teste de políticas no Supabase.


## Carteira e leilões — auditoria estática

Documento: `REVISAO-INTEGRIDADE-CARTEIRA-LEILOES.md`

Controles encontrados:
- Reserva separa saldo disponível de saldo reservado.
- Lances exigem saldo e leilão válido; aumento do próprio lance reserva somente a diferença.
- Liquidação do vencedor captura reserva e cria pedido/remessa na mesma transação; saldo do artista fica pendente.
- Migration 012 libera reservas quando não há vencedor.
- Repasse exige entrega confirmada e verifica crédito pendente; comissão é registrada separadamente.
- Casos financeiros abertos/em análise bloqueiam entrega e repasse.

Pendências de alta prioridade:
- A RPC de lance não aborta explicitamente se a reserva ativa do líder anterior estiver ausente; reforçar a invariante.
- Bloqueio de carteira atual seguido da carteira do líder anterior pode gerar deadlock entre leilões diferentes; adotar ordem determinística de locks e teste concorrente.
- Testar rollback integral, concorrência de cron, saldo/reserva divergente e idempotência.
- Implementar resolução real de refund/chargeback e conciliação com gateway.
- Migrar hash MD5 do código presencial para hash/HMAC mais forte.
- Saldo disponível não é saque Pix; saques continuam desabilitados.

**Status:** documentado; nenhuma migration foi executada nem alterada nesta etapa.


## Checkout, entrada de pagamentos e conciliação — auditoria estática

Documento: `REVISAO-CHECKOUT-ENTRADA-PAGAMENTOS.md`

Achados:
- A sacola (`sacola.html`) usa `localStorage`; preço e total são manipuláveis no navegador. O botão de finalizar ainda apenas informa que a integração não está disponível.
- O Bazar consulta anúncios publicados no Supabase e adiciona dados locais à sacola; isso não reserva a obra nem garante disponibilidade.
- A migration 003 cria estrutura de pedidos e referências de provedor, mas não implementa cobrança nem confirmação de pagamento.
- Não foi localizado fluxo de servidor para criar cobrança, validar webhook assinado, processar eventos idempotentes ou conciliar com extrato/API do provedor.
- O diagnóstico SQL existente é somente leitura e não substitui conciliação externa.

**Bloqueios P0:** backend recalcular preços e frete; reserva atômica de obra única; snapshots financeiros; cobrança vinculada a referência interna; webhook autenticado e idempotente; estados explícitos; tratamento de eventos atrasados/repetidos; conciliação de bruto, taxas, líquido, reembolso e chargeback.

**Dependências:** escolher provedor que aceite marketplace, vendedores terceiros, KYC, split e Pix; decidir recebimento centralizado ou split; definir política de expiração e tratamento de carrinho com múltiplos artistas. Não presumir suporte do provedor.

**Status:** auditoria estática concluída e documentada. Nenhuma cobrança foi criada e nenhum SQL foi executado. Checkout permanece desativado até implementação e homologação ponta a ponta.


## Reserva transacional inicial do checkout — 31/10/2026

Código criado: `migrations/20261031_014_checkout_item_reservations.sql`  
Auditoria: `REVISAO-RESERVA-TRANSACIONAL-CHECKOUT.md`

Implementado em código, ainda não executado:
- Grupo de checkout por comprador com chave idempotente.
- Reserva por obra com snapshots de vendedor, título e preço consultados do banco.
- Lock das obras em ordem estável e índice único para impedir reserva/venda concorrente da mesma obra.
- Prazo inicial de 15 minutos e expiração lazy na próxima tentativa de checkout.
- RPC autenticada aceita somente IDs e chave de idempotência; subtotal calculado no banco.
- RLS e revogação de escrita direta dos clientes.

Limites:
- Ainda não cria `refugiart_orders`, não calcula frete/comissão, não chama provedor, não confirma pagamento e não credita carteira.
- Não existe rotina agendada para expirar reservas sem novas chamadas.
- Falta função segura de cancelamento/liberação e transição para `consumed` após pagamento autenticado.
- Histórico de reserva impede exclusão física da obra; será necessário arquivamento lógico.
- Migration requer revisão e testes reais de PostgreSQL, concorrência, idempotência, RLS e grants antes de execução.

**Status:** etapa de código/documentação criada no GitHub. Não executada no Supabase; checkout continua desativado.


## Auditoria real do Supabase — grants e privilégios padrão (31/10/2026)

Foi realizada consulta somente leitura no projeto Supabase pelo SQL Editor. Resultado observado:
- 13 tabelas no schema `public`, todas com RLS ativado.
- Em 11 tabelas listadas, `anon` e `authenticated` possuíam grants amplos, incluindo `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN`.
- As concessões de tabela observadas foram feitas diretamente por `postgres`.
- Os privilégios padrão de `postgres` no schema `public` também concediam privilégios amplos a papéis do navegador em novas tabelas.
- `anon` e `authenticated` não possuem `BYPASSRLS`, não são superusuários e não têm `CREATE` no schema `public`.
- Os privilégios padrão do schema `storage` também foram observados, mas não serão alterados nesta correção.

Correção preparada em `migrations/20261031_015_harden_public_table_privileges.sql`: revoga somente `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN` para `anon` e `authenticated` nas tabelas públicas existentes e nos privilégios padrão de futuras tabelas criadas por `postgres`. Mantém CRUD e RLS. A migration ainda **não foi aplicada**. Ver detalhes em `REVISAO-GRANTS-E-PRIVILEGIOS-PADRAO.md`.

Pendências: homologar a migration; testar fluxos da comunidade e ateliê; revisar privilégios padrão de sequences; auditar Storage separadamente; avaliar policies duplicadas sem removê-las às cegas.



## Auditoria real do Supabase Storage — 31/10/2026

Documento detalhado: `REVISAO-SEGURANCA-STORAGE.md`.

Consultas somente leitura confirmaram:
- Buckets públicos `artwork-images` (12 objetos) e `profile-photos` (3 objetos); ambos são usados pelo frontend para URLs públicas.
- Bucket `Public` sem objetos. Busca explícita no código por referência a esse bucket não retornou resultados; não excluir até confirmar ausência de dependências.
- Policies de INSERT/UPDATE/DELETE de `artwork-images` limitam o primeiro segmento do caminho ao UUID do usuário autenticado.
- Policies de INSERT/UPDATE de `profile-photos` aplicam a mesma restrição; não foi observada policy DELETE para fotos de perfil.
- Não foram observadas policies de escrita para `anon`.
- `storage.objects` concede grants SQL CRUD a `anon` e `authenticated`. Isso não prova, isoladamente, que acesso anônimo consiga gravar/apagar objetos; RLS/policies também se aplicam. Não revogar grants de Storage sem homologação.
- Os buckets não têm limite de tamanho nem MIME types configurados. O frontend limita uploads a 5 MB; obras aceitam JPEG/PNG/WEBP e fotos também aceitam GIF. Limite no navegador não substitui validação no servidor.

**Status:** auditoria somente leitura concluída para os resultados coletados. Nenhum bucket, objeto, grant ou policy foi alterado. Pendências: configurar limites e MIME types após testes; avaliar remoção/substituição de fotos e objetos órfãos; confirmar se `Public` é legado; homologar qualquer alteração de grants/policies. 


## Auditoria de sequences — primeira consulta (31/10/2026)

A consulta a `information_schema.role_usage_grants` retornou USAGE para `anon` e `authenticated` nas sequências:
`atelie_posts_id_seq`, `chat_messages_id_seq`, `community_post_comments_id_seq`, `community_post_interest_id_seq` e `community_post_likes_id_seq`.

USAGE permite utilizar a sequência (por exemplo, obter próximo valor com `nextval`); não equivale a permissão UPDATE/SELECT da sequência. A consulta ainda não mostra o conjunto completo de privilégios efetivos, concessões a PUBLIC ou privilégios padrão. Não revogar ainda: primeiro concluir inventário de ACLs e verificar dependências de INSERT que usam valores padrão.


## Auditoria de ACLs das sequences — 31/10/2026

A inspeção de `pg_class.relacl` com `aclexplode` confirmou que, nas cinco sequências abaixo, tanto `anon` quanto `authenticated` possuem SELECT, UPDATE e USAGE:
- `atelie_posts_id_seq`
- `chat_messages_id_seq`
- `community_post_comments_id_seq`
- `community_post_interest_id_seq`
- `community_post_likes_id_seq`

Também aparecem SELECT, UPDATE e USAGE para `postgres` e `service_role`. Não foram listadas concessões para `PUBLIC` nem concessões com grant option.

UPDATE em sequência permite alterar o estado do contador (por exemplo, via `setval`); SELECT permite consultar seu estado. Essas permissões são mais amplas do que o necessário para o uso comum de IDs por inserts com defaults, que normalmente precisam de USAGE. Isso não concede, por si só, escrita nas linhas das tabelas, mas pode permitir interferir nos contadores e causar saltos ou colisões de IDs se o contador for reposicionado incorretamente.

**Próximo passo:** verificar privilégios padrão de sequences e defaults efetivos antes de preparar uma migration. Não revogar ainda; testar inserts legítimos que dependam de `nextval`, funções e fluxos existentes em homologação. A consulta atual cobre as cinco sequences existentes no schema public que retornaram no inventário.


## Privilégios padrão de sequences — 31/10/2026

A consulta a `pg_default_acl` confirmou defaults amplos de SELECT, UPDATE e USAGE para `anon` e `authenticated` em sequences no schema `public`, tanto para o criador `postgres` quanto para `supabase_admin`. Também existem defaults em schemas gerenciados (`storage`, `graphql`, `graphql_public`, `extensions`, `realtime` e `auth`), que não serão alterados nesta etapa.

Migration preparada: `migrations/20261031_016_harden_public_sequence_privileges.sql`.
- Revoga SELECT e UPDATE de `anon` e `authenticated` nas sequences públicas existentes.
- Revoga SELECT e UPDATE dos privilégios padrão de sequences criadas pelo papel `postgres` no schema `public`.
- Mantém USAGE para que inserts legítimos que usam `nextval` continuem funcionando.
- Não altera defaults de `supabase_admin` nem schemas gerenciados pelo Supabase.

**Atenção:** a migration foi criada no GitHub, mas não foi aplicada nem testada. O default de `supabase_admin` no schema `public` permanece identificado como ponto de atenção; não foi alterado por ser papel administrativo gerenciado. Antes de produção, validar criação de novas sequences por cada fluxo/role, inserts que usam defaults, chamadas a `currval` e funções SQL/RPC existentes.
