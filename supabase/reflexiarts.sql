-- Estrutura das Reflexões (ReflexiARTs) públicas da RefugiART
create table if not exists public.reflexiarts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  category text not null,
  created_at timestamptz not null default now()
);

create index if not exists reflexiarts_created_at_idx
  on public.reflexiarts (created_at desc);

alter table public.reflexiarts enable row level security;

grant select on public.reflexiarts to anon, authenticated;
grant insert, delete on public.reflexiarts to authenticated;

drop policy if exists "ReflexiARTs are publicly readable" on public.reflexiarts;
create policy "ReflexiARTs are publicly readable"
  on public.reflexiarts for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can publish their own ReflexiARTs" on public.reflexiarts;
create policy "Users can publish their own ReflexiARTs"
  on public.reflexiarts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own ReflexiARTs" on public.reflexiarts;
create policy "Users can delete their own ReflexiARTs"
  on public.reflexiarts for delete
  to authenticated
  using (auth.uid() = user_id);
