# RefugiART — auditoria de grants e privilégios padrão

Data: 2026-10-31  
Ambiente: projeto Supabase consultado pelo SQL Editor  
Método: consultas somente leitura executadas pelo responsável do projeto e análise estática do resultado.

## Resultado observado

Foram identificadas 13 tabelas no schema `public`. Todas estavam com RLS ativado.

Nas 11 tabelas retornadas pela consulta de grants, os papéis `anon` e `authenticated` possuíam privilégios amplos de tabela: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN`.

A inspeção dos ACLs mostrou concessões diretas feitas por `postgres`, e não apenas herança de `PUBLIC`.

Os privilégios padrão do papel `postgres` no schema `public` também concediam privilégios amplos sobre futuras tabelas e sequências para `anon`, `authenticated` e `service_role`. No schema `storage` há ACLs padrão semelhantes; **não modificar Storage nesta correção**, pois é uma área gerenciada pelo Supabase e exige auditoria própria.

Os papéis `anon` e `authenticated` não são superusuários, não possuem `BYPASSRLS` e não têm privilégio `CREATE` no schema `public`. `service_role` possui `BYPASSRLS`, comportamento esperado para operações confiáveis do backend.

## Interpretação e limites

- RLS está ativado nas 13 tabelas observadas, mas RLS não substitui grants.
- `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN` não são privilégios necessários ao navegador para o fluxo comum da aplicação.
- A existência de um grant não prova, isoladamente, que a operação esteja exposta por uma rota específica da API, nem demonstra exploração. Ainda assim, é uma concessão excessiva que deve ser removida.
- A correção proposta preserva `SELECT`, `INSERT`, `UPDATE` e `DELETE`, deixando as policies RLS existentes responsáveis por restringir as linhas.
- As policies duplicadas em `profiles` e `atelie_posts` permanecem como item separado; não foram removidas nesta etapa para evitar mudanças de comportamento sem testes.
- O resultado de privilégios padrão para sequências (`rwU`) também merece revisão específica, mas não será alterado sem inventário de sequences e dependências de IDs.

## Correção preparada

Arquivo: `migrations/20261031_015_harden_public_table_privileges.sql`

A migration:
1. Revoga de `anon` e `authenticated` os privilégios `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN` das tabelas existentes em `public`.
2. Ajusta os privilégios padrão do papel `postgres` no schema `public`, para que novas tabelas não recebam esses quatro privilégios para os papéis do navegador.
3. Mantém os privilégios DML comuns e não altera `service_role`, `postgres`, policies RLS ou o schema `storage`.

## Estado

<em>Preparada no repositório; ainda não aplicada no Supabase.</em>

Antes de aplicar em produção:
- confirmar que a migration é compatível com a versão PostgreSQL do projeto;
- aplicar primeiro em projeto de homologação, se disponível;
- testar cadastro/edição de perfil, publicação/edição/exclusão de obras, comunidade, mensagens, notificações e moderação;
- repetir as consultas de grants e privilégios padrão;
- testar usuários anônimos e autenticados distintos, confirmando que RLS continua limitando as linhas;
- conferir privilégios padrão de sequências em uma etapa separada;
- auditar Storage separadamente.

A migration é idempotente quanto aos privilégios revogados, mas isso não substitui backup, revisão e homologação.
