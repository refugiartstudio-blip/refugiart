-- RefugiART | Agendamento do encerramento automático de leilões
-- Execute DEPOIS da migration 20261030_auction_balloon_system.sql.
-- Requer a extensão pg_cron habilitada no projeto Supabase.

create extension if not exists pg_cron;

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname = 'refugiart-close-expired-auctions'
  loop
    perform cron.unschedule(job.jobid);
  end loop;

  perform cron.schedule(
    'refugiart-close-expired-auctions',
    '* * * * *',
    'select public.refugiart_close_expired_auctions();'
  );
end;
$$;

-- O agendador verifica os vencimentos a cada minuto.
-- Atualmente, como os lances ainda estão bloqueados, encerra sem vencedor.
