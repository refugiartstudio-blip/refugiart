-- RefugiART: privilégios mínimos para leitura e manutenção do próprio perfil.
-- Pré-requisito: RLS permanece habilitado e as policies existentes continuam
-- limitando INSERT/UPDATE ao registro cujo id = auth.uid().
BEGIN;

GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.profiles TO authenticated;

COMMIT;
