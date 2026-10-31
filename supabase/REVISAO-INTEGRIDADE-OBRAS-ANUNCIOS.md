# RefugiART — integridade de obras, anúncios e pedidos

Data: 2026-10-31
Tipo: auditoria estática do frontend e das migrations disponíveis. Não houve acesso ao catálogo real do Supabase nem execução de testes SQL.

## 1. Controles positivos já previstos

### Edição e exclusão de obra
No `atelie.js`, a interface só mostra edição ao proprietário e as operações filtram por `id` e `user_id`. Isso melhora a experiência, mas não é a barreira de segurança principal.

A migration `20261030_auction_balloon_system.sql` revoga UPDATE geral de `atelie_posts` para PUBLIC/anon/authenticated e concede somente UPDATE da coluna `caption` a authenticated. Assim, preço, modalidade, status de leilão e flags de publicação não podem ser alterados por UPDATE direto do navegador, desde que a migration tenha sido aplicada e não existam grants/policies adicionais.

**Atenção:** a auditoria não localizou, entre os arquivos revisados, a migration-base que cria as policies de INSERT/DELETE de `atelie_posts`. Confirmar que INSERT exige `auth.uid() = user_id` e DELETE exige propriedade do registro. Não presumir que o filtro JavaScript substitui RLS.

### Pedidos e dados de compradores/vendedores
A migration `20261030_003_orders_shipping_disputes.sql` define RLS para pedidos, itens, remessas e disputas. A leitura é limitada a comprador e vendedor envolvidos; as escritas diretas de clientes são revogadas, ficando para service_role. É um bom desenho, desde que aplicado e sem grants/policies paralelos.

### Carteira e leilões
A migration `20261030_auction_balloon_system.sql` limita leitura de transações e reservas ao próprio usuário; revoga operações diretas de escrita em carteira, reservas, lances e leilões. Lances financeiros permanecem explicitamente bloqueados até existir reserva atômica segura.

## 2. Riscos e lacunas

### ALTO — Sacola no navegador não é fonte confiável
O `bazar.html` armazena no localStorage dados como id, user_id, imagem, legenda, artista e preço. Esses dados podem ser alterados pelo comprador no próprio navegador.

Regra obrigatória para checkout futuro:
- Enviar apenas identificadores das obras e quantidades.
- Reconsultar no servidor cada obra, dono, preço, disponibilidade e modalidade.
- Rejeitar obra removida, em análise, já vendida, do próprio comprador ou não mais anunciada.
- Calcular subtotal, comissão, frete, subsídio e total exclusivamente no backend.
- Criar snapshots do pedido usando dados revalidados e bloquear a obra contra venda simultânea.
- Nunca aceitar preço, comissão, frete ou total enviados pelo localStorage como verdade.

**Status:** checkout financeiro não deve ser ativado até existir função/backend de criação de pedido com essas validações.

### ALTO — Propriedade e preço no momento da criação da publicação
O frontend envia `user_id`, `preco`, `publicar_mercado`, `listing_mode`, `auction_status` e outros campos no INSERT. Validações no navegador são contornáveis.

Ação necessária no banco:
- Policy INSERT exige `auth.uid() = user_id).
- Constraints coerentes: preço positivo quando anúncio comercial; modalidade permitida; consistência entre `listing_mode`, flags e status inicial.
- Não aceitar que INSERT público crie leilão ativo ou vencedor; leilão ativo deve nascer apenas pelo fluxo transacional confiável.
- Definir claramente quais campos o usuário pode escolher ao publicar e quais são derivados pelo banco.
- Confirmar policy DELETE por proprietário, respeitando pedidos/vendas e histórico.

**Status:** pendente inventário das policies reais e análise de dados legados antes de adicionar constraints.

### MÉDIO — Exclusão física pode apagar histórico ou quebrar referências
O frontend executa DELETE direto em `atelie_posts`. Há FKs em módulos financeiros que usam `ON DELETE SET NULL` ou `CASCADE`; a exclusão de uma obra anunciada ou envolvida em leilão/pedido precisa ser bloqueada ou convertida em arquivamento lógico.

Ação recomendada:
- Impedir exclusão física quando houver pedido, lance, reserva ou leilão relacionado.
- Implementar estado de arquivamento/retirada do anúncio e preservar snapshots e histórico.
- Manter exclusão física apenas para publicações sem vínculos e após confirmar dependências.
**Status:** pendente mapear todas as FKs e estados existentes.

### MÉDIO — Sacola pode ficar desatualizada
O localStorage pode conter obras cujo preço ou disponibilidade mudou. A tela não deve afirmar reserva nem garantir preço até validação do servidor.
**Status:** corrigir junto ao checkout.

### MÉDIO — Upload de imagens
O frontend valida MIME, extensão derivada e tamanho até 5 MB, e usa caminho prefixado pelo UUID do usuário. Essas verificações no navegador são contornáveis; Storage precisa validar autenticação, prefixo do usuário, MIME/tamanho e política de sobrescrita no servidor. Bucket público permite leitura pública das imagens, não de documentos privados.

**Status:** conferir configuração real do bucket `artwork-images`, policies Storage e limites de upload.

## 3. Pedidos: invariantes para backend futuro

1. Preço e vendedor sempre lidos da obra no banco.
2. Bloqueio transacional contra duas compras concorrentes da mesma obra única.
3. Idempotência de checkout e referência única do provedor.
4. Nunca marcar pedido como pago por resposta do navegador; apenas webhook autenticado/verificado.
5. Snapshot de título, preço, artista, comissão e frete no pedido.
6. Um pedido/remessa por vendedor no checkout multivendedor, agrupado por `checkout_group_id`.
7. Não liberar saldo antes da confirmação segura de entrega e resolução de disputas.
8. Recalcular total no backend e conferir soma exata de itens + frete líquido.

## 4. Próximos testes no Supabase

- Usuário A tenta publicar com `user_id` de B.
- Usuário A tenta editar preço, status, modalidade e flags de obra própria via REST.
- Usuário A tenta editar/excluir obra de B.
- Usuário A tenta apagar obra já vinculada a pedido/leilão.
- Usuário A altera preço e vendedor no localStorage e tenta checkout.
- Duas sessões tentam comprar a mesma obra simultaneamente.
- Usuário comum tenta inserir pedido, movimentação de carteira, comissão ou pagamento.
- Upload autenticado para prefixo de outro usuário, arquivo acima do limite e MIME falso.
- Anônimo tenta ler tabelas financeiras e objetos privados.

## 5. Decisão operacional

Não ativar checkout, pagamento, lances financeiros nem saque com base apenas no frontend atual. O desenho das migrations financeiras protege parte importante da liquidação, mas falta o endpoint transacional de criação do pedido e a validação real das policies de obras e Storage.

Este documento não afirma que as migrations foram executadas nem que os testes passaram.
