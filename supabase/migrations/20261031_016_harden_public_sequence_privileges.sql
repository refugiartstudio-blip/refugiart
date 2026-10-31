-- RefugiART — restringe privilégios de sequences para clientes
-- Mantém USAGE para nextval/currval em inserts legítimos.
-- Não altera sequences nem privilégios padrão de papéis gerenciados pelo Supabase.

BEGIN;

REVOKE SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA public
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE SELECT, UPDATE
ON SEQUENCES
FROM anon, authenticated;

COMMIT;
