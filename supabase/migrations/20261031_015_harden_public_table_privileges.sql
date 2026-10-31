-- RefugiART — reduz privilégios administrativos concedidos aos papéis do navegador.
-- Mantém SELECT/INSERT/UPDATE/DELETE; as policies RLS continuam definindo
-- quais linhas cada usuário pode acessar ou modificar.
-- Não altera o schema storage, nem os privilégios de service_role/postgres.
--
-- Aplicar somente após conferir o projeto Supabase correto e homologar.

BEGIN;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLES
FROM anon, authenticated;

COMMIT;

-- Verificação pós-aplicação (executar separadamente, somente leitura):
-- SELECT c.relname AS tabela, r.rolname AS papel,
--        has_table_privilege(r.rolname, c.oid, 'TRUNCATE') AS pode_truncate,
--        has_table_privilege(r.rolname, c.oid, 'MAINTAIN') AS pode_maintain,
--        has_table_privilege(r.rolname, c.oid, 'REFERENCES') AS pode_references,
--        has_table_privilege(r.rolname, c.oid, 'TRIGGER') AS pode_trigger
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
-- WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
-- ORDER BY c.relname, r.rolname;
--
-- Observação: esta migration não corrige policies RLS nem substitui testes
-- com usuários anon/authenticated. Ela remove somente privilégios de tabela
-- desnecessários para o navegador.
