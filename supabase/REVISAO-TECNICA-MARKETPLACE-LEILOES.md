# RefugiART — revisão técnica do Mercado, Bazar e Leilões

Data: 2026-10-31  
Escopo: leitura estática do frontend e da migration `20261030_auction_balloon_system.sql`. Nenhuma alteração foi executada no banco e nenhum teste autenticado/SQL foi realizado.

## 1. Bloqueio de compatibilidade confirmado

As páginas `atelie.js`, `mercado.html` e `bazar.html` consultam os campos `listing_mode`, `auction_status`, `auction_initial_price`, `auction_ends_at` e `auction_balloon_count` em `public.atelie_posts`. A página `leiloes.html` consulta a tabela `refugiart_auctions`.

Na inspeção anterior do catálogo de produção, esses campos e as tabelas financeiras/leilões ainda não existiam. A consulta de existência das seis tabelas previstas pela migration não retornou registros. Portanto, as telas dependem da aplicação da migration antes de funcionarem integralmente.

**Não aplicar a migration automaticamente:** ela cria carteiras e fluxo de interesse/leilão, altera privilégios de atualização de `atelie_posts` e instala funções `SECURITY DEFINER`. A aplicação precisa ser precedida por revisão do SQL e conferência do estado atual do banco.

## 2. Controles positivos encontrados no código

- A publicação no Ateliê confere sessão e propriedade do Ateliê antes de enviar.
- O upload usa prefixo com UUID do usuário e nome de arquivo aleatório.
- A interface de leilões mantém os lances financeiros desabilitados enquanto não existe reserva segura de saldo.
- A migration revoga escrita direta nas tabelas de carteira, interesse, leilão e lance, reservando operações sensíveis a funções confiáveis.
- A função de encerramento automático é restrita a `service_role`; a migration reconhece que ainda falta agendar o processo.

Esses controles são intenções verificadas no código, não prova de que a migration esteja aplicada ou de que o sistema tenha passado em testes.

## 3. Pontos que exigem correção ou validação antes da ativação

### 3.1 Permissões de publicação, edição e exclusão

O frontend faz INSERT e DELETE em `atelie_posts`, além de UPDATE da legenda. A migration de leilões revoga UPDATE geral e concede somente UPDATE da coluna `caption`. Isso é coerente com a edição limitada, mas não substitui a verificação das policies e grants reais de INSERT e DELETE.

Antes de aplicar a migration, confirmar que:
- INSERT exige `auth.uid() = user_id`;
- DELETE exige propriedade e não permite apagar obras com pedidos/leilões vinculados;
- o proprietário consegue editar somente a legenda após a migration;
- os campos de preço, modalidade, flags e status só são alterados por rotinas confiáveis.

### 3.2 Integridade do fluxo de balões

A função `refugiart_give_balloon` usa bloqueio de linha e unicidade por obra/usuário, o que ajuda a serializar manifestações e evitar duplicidade. Porém, o saldo mínimo é apenas uma verificação de saldo disponível; o valor não é reservado nem debitado. Isso deve permanecer descrito claramente na interface: o balão manifesta interesse, não representa pagamento, lance ou reserva de compra.

A regra provisória de R$ 10,00 para obras da comunidade e a regra de exigir o lance inicial para leilões precisam ser confirmadas como regra de produto antes de produção.

### 3.3 Encerramento e liquidação

A migration encerra leilões vencidos sem vencedor e sem movimentação financeira. Ela própria registra que falta agendar uma Edge Function/cron e implementar validação de saldo, débito do vencedor e crédito do artista. Portanto, não há liquidação financeira completa.

### 3.4 Busca e apresentação pública

O Bazar e o Mercado consultam anúncios por `publicar_mercado = true`, preço não nulo e moderação publicada. O Bazar também apresenta estados de interesse/leilão. Após a migration, validar se cada combinação de `listing_mode`, `auction_status`, `publicar_mercado` e `preco` aparece no destino correto, especialmente obras em coleta de interesse e leilões ativos.

### 3.5 Segurança de funções

A migration cria funções `SECURITY DEFINER` com `search_path = public`. É recomendável endurecer o caminho para `pg_catalog, public` e qualificar referências sensíveis, além de revisar privilégios de criação no schema `public`. Fazer isso em migration revisada e testada, não por alteração improvisada no banco ativo.

## 4. Critérios para liberar o marketplace

1. Conferir estado real de colunas, tabelas, constraints, policies, grants e funções.
2. Revisar e aplicar migrations em ordem, com backup e plano de reversão.
3. Testar publicação, edição de legenda e exclusão com duas contas distintas.
4. Testar balões duplicados, concorrência, saldo ausente e metas atingidas.
5. Testar que ninguém consegue inserir/alterar carteira, leilão ou lance diretamente pela API.
6. Manter checkout, pagamento, lances financeiros e saque desativados até existir backend transacional, integração de pagamento verificada e liquidação idempotente.
7. Testar as páginas em navegador real e conferir logs do Supabase.

## 5. Status

- Revisão estática de `atelie.js`, `mercado.html`, `bazar.html`, `leiloes.html` e migration de leilões: realizada.
- Compatibilidade do frontend com o schema atual: bloqueada pela ausência dos campos/tabelas previstos.
- Alterações no banco: nenhuma.
- Testes de produção: não realizados.
- Checkout, pagamento, lances e saques: não liberar.
