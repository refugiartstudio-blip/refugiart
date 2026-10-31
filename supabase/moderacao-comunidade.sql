-- RefugiART | Sistema de moderação comunitária
-- Execute este arquivo no SQL Editor do Supabase.
begin;

alter table public.atelie_posts
  add column if not exists moderation_status text not null default 'published'
    check (moderation_status in ('published','under_review','removed')),
  add column if not exists content_sensitive boolean not null default false,
  add column if not exists moderation_updated_at timestamptz;

create table if not exists public.atelie_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id bigint not null references public.atelie_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in (
    'sexual_content','nonconsensual_intimate','violence','hate_or_harassment',
    'minor_safety','missing_sensitive_warning','spam','other'
  )),
  details text,
  created_at timestamptz not null default now(),
  unique(post_id, reporter_id)
);

create index if not exists atelie_post_reports_post_idx
  on public.atelie_post_reports(post_id);

create table if not exists public.refugiart_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.refugiart_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id bigint references public.atelie_posts(id) on delete set null,
  kind text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists refugiart_notifications_user_idx
  on public.refugiart_notifications(user_id, created_at desc);

alter table public.atelie_post_reports enable row level security;
alter table public.refugiart_admins enable row level security;
alter table public.refugiart_notifications enable row level security;

drop policy if exists "Users read own moderation notifications" on public.refugiart_notifications;
create policy "Users read own moderation notifications"
  on public.refugiart_notifications for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users update own moderation notifications" on public.refugiart_notifications;
create policy "Users update own moderation notifications"
  on public.refugiart_notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Verificação segura de administrador para o navegador.
-- A tabela refugiart_admins permanece inacessível por SELECT direto.
create or replace function public.refugiart_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.refugiart_admins where user_id = auth.uid()
  );
$$;
revoke all on function public.refugiart_is_admin() from public, anon;
grant execute on function public.refugiart_is_admin() to authenticated;

-- Remove políticas SELECT permissivas anteriores para que o status seja respeitado.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname='public' and tablename='atelie_posts' and cmd='SELECT'
  loop
    execute format('drop policy if exists %I on public.atelie_posts', p.policyname);
  end loop;
end $$;

create policy "Published posts public and owners see own"
  on public.atelie_posts for select to anon, authenticated
  using (moderation_status = 'published' or auth.uid() = user_id);

-- Denúncias não podem ser lidas ou alteradas diretamente pelo navegador.
revoke all on public.atelie_post_reports from anon, authenticated;
revoke all on public.refugiart_admins from anon, authenticated;
grant select, update on public.refugiart_notifications to authenticated;

create or replace function public.refugiart_submit_post_report(
  p_post_id bigint,
  p_reason text,
  p_details text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_total integer;
  v_status text;
  v_inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para denunciar.'; end if;
  select user_id, moderation_status into v_owner, v_status
    from public.atelie_posts where id=p_post_id for update;
  if not found then raise exception 'Publicação não encontrada.'; end if;
  if v_owner = auth.uid() then raise exception 'Você não pode denunciar sua própria publicação.'; end if;
  if v_status <> 'published' then raise exception 'Esta publicação já está em análise ou foi removida.'; end if;
  if p_reason not in ('sexual_content','nonconsensual_intimate','violence','hate_or_harassment','minor_safety','missing_sensitive_warning','spam','other')
    then raise exception 'Motivo de denúncia inválido.'; end if;

  insert into public.atelie_post_reports(post_id, reporter_id, reason, details)
  values(p_post_id, auth.uid(), p_reason, nullif(left(trim(coalesce(p_details,'')),500),''))
  on conflict(post_id, reporter_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select count(*) into v_total from public.atelie_post_reports where post_id=p_post_id;
    return jsonb_build_object('accepted',false,'already_reported',true,'reports',v_total,'under_review',false);
  end if;

  select count(*) into v_total from public.atelie_post_reports where post_id=p_post_id;
  if v_total >= 10 then
    update public.atelie_posts
      set moderation_status='under_review', moderation_updated_at=now()
      where id=p_post_id and moderation_status='published';
    if found then
      insert into public.refugiart_notifications(user_id,post_id,kind,message)
      values(v_owner,p_post_id,'post_under_review',
        'Sua publicação recebeu denúncias e foi temporariamente ocultada da comunidade enquanto aguarda revisão administrativa. Ela continua no seu Ateliê.');
    end if;
  end if;

  return jsonb_build_object('accepted',true,'already_reported',false,'reports',v_total,
    'under_review',v_total >= 10);
end;
$$;

create or replace function public.refugiart_review_post(
  p_post_id bigint,
  p_decision text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.refugiart_admins where user_id=auth.uid())
    then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_decision not in ('restore','remove') then raise exception 'Decisão inválida.'; end if;
  select user_id into v_owner from public.atelie_posts where id=p_post_id for update;
  if not found then raise exception 'Publicação não encontrada.'; end if;

  update public.atelie_posts
    set moderation_status=case when p_decision='restore' then 'published' else 'removed' end,
        moderation_updated_at=now()
    where id=p_post_id;

  insert into public.refugiart_notifications(user_id,post_id,kind,message)
  values(v_owner,p_post_id,
    case when p_decision='restore' then 'post_restored' else 'post_removed' end,
    case when p_decision='restore'
      then 'Após revisão administrativa, sua obra foi liberada e voltou a ficar visível na comunidade.'
      else 'Após revisão administrativa, sua obra foi mantida oculta por violar as diretrizes do RefugiART. Novas violações poderão resultar em suspensão ou banimento da conta. Se discordar, entre em contato com a administração para contestar.'
    end || case when coalesce(trim(p_note),'')<>'' then ' Observação: '||left(trim(p_note),500) else '' end);
end;
$$;

-- Remove a assinatura anterior para permitir a correção do tipo de retorno (uuid -> bigint).
drop function if exists public.refugiart_admin_queue();

create or replace function public.refugiart_admin_queue()
returns table(
  id bigint, user_id uuid, image_url text, caption text, category text,
  created_at timestamptz, report_count bigint, reasons jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.refugiart_admins where user_id=auth.uid())
    then raise exception 'Acesso administrativo não autorizado.'; end if;
  return query
    select p.id,p.user_id,p.image_url,p.caption,p.category,p.created_at,
      count(r.id), coalesce(jsonb_agg(distinct r.reason) filter(where r.id is not null),'[]'::jsonb)
    from public.atelie_posts p
    left join public.atelie_post_reports r on r.post_id=p.id
    where p.moderation_status='under_review'
    group by p.id
    order by p.moderation_updated_at asc nulls first;
end;
$$;

revoke all on function public.refugiart_submit_post_report(bigint,text,text) from public, anon;
revoke all on function public.refugiart_review_post(bigint,text,text) from public, anon;
revoke all on function public.refugiart_admin_queue() from public, anon;
grant execute on function public.refugiart_submit_post_report(bigint,text,text) to authenticated;
grant execute on function public.refugiart_review_post(bigint,text,text) to authenticated;
grant execute on function public.refugiart_admin_queue() to authenticated;

commit;

-- IMPORTANTE: depois de executar, torne sua conta administradora substituindo
-- SEU-UUID pelo ID do usuário em Authentication > Users:
-- insert into public.refugiart_admins(user_id) values ('SEU-UUID');
