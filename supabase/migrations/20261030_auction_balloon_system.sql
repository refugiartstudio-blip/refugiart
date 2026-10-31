-- RefugiART: estrutura inicial para interesse por balões e leilões.
-- Execute este arquivo no SQL Editor do projeto Supabase antes de ativar as telas.
begin;

alter table public.atelie_posts
  add column if not exists listing_mode text not null default 'community'
    check (listing_mode in ('community','market','auction')),
  add column if not exists auction_status text not null default 'none'
    check (auction_status in ('none','collecting','pending_artist','active','finished','cancelled')),
  add column if not exists auction_starts_at timestamptz,
  add column if not exists auction_ends_at timestamptz,
  add column if not exists auction_initial_price numeric(12,2),
  add column if not exists auction_balloon_count integer not null default 0,
  add column if not exists auction_approved_at timestamptz;

update public.atelie_posts set listing_mode='market' where publicar_mercado=true and preco is not null and listing_mode='community';

create table if not exists public.refugiart_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_balance numeric(12,2) not null default 0 check (available_balance >= 0),
  pending_balance numeric(12,2) not null default 0 check (pending_balance >= 0),
  updated_at timestamptz not null default now()
);

insert into public.refugiart_wallets(user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.refugiart_create_wallet_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.refugiart_wallets(user_id) values(new.id)
  on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_refugiart_create_wallet on auth.users;
create trigger trg_refugiart_create_wallet
after insert on auth.users
for each row execute function public.refugiart_create_wallet_for_user();

create table if not exists public.refugiart_auction_interests (
  id bigint generated always as identity primary key,
  post_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);

create table if not exists public.refugiart_auctions (
  id bigint generated always as identity primary key,
  post_id text not null unique,
  artist_id uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('active','finished','cancelled')),
  initial_price numeric(12,2) not null check (initial_price > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '24 hours'),
  winning_user_id uuid references auth.users(id),
  winning_bid numeric(12,2),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.refugiart_auction_bids (
  id bigint generated always as identity primary key,
  auction_id bigint not null references public.refugiart_auctions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists refugiart_auction_bids_rank_idx
  on public.refugiart_auction_bids(auction_id, amount desc, created_at asc);
create index if not exists refugiart_auctions_active_idx
  on public.refugiart_auctions(status, ends_at);

alter table public.refugiart_wallets enable row level security;
alter table public.refugiart_auction_interests enable row level security;
alter table public.refugiart_auctions enable row level security;
alter table public.refugiart_auction_bids enable row level security;

grant select on public.refugiart_wallets to authenticated;
grant select on public.refugiart_auction_interests to authenticated;
grant select on public.refugiart_auctions to anon, authenticated;
grant select on public.refugiart_auction_bids to authenticated;

drop policy if exists "wallet_owner_read" on public.refugiart_wallets;
create policy "wallet_owner_read" on public.refugiart_wallets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "interest_public_read" on public.refugiart_auction_interests;
drop policy if exists "interest_owner_read" on public.refugiart_auction_interests;
create policy "interest_owner_read" on public.refugiart_auction_interests
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "auctions_public_read" on public.refugiart_auctions;
create policy "auctions_public_read" on public.refugiart_auctions
  for select to anon, authenticated using (true);

drop policy if exists "bids_public_read" on public.refugiart_auction_bids;
drop policy if exists "bids_participant_read" on public.refugiart_auction_bids;
create policy "bids_participant_read" on public.refugiart_auction_bids
  for select to authenticated using (auth.uid() = user_id);

-- O cliente não pode inserir balões ou lances diretamente: somente pelas RPCs.
revoke insert, update, delete on public.refugiart_auction_interests from anon, authenticated;
revoke insert, update, delete on public.refugiart_auctions from anon, authenticated;
revoke insert, update, delete on public.refugiart_auction_bids from anon, authenticated;
revoke insert, update, delete on public.refugiart_wallets from anon, authenticated;

create or replace function public.refugiart_give_balloon(p_post_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_post public.atelie_posts%rowtype;
  v_balance numeric(12,2);
  v_count integer;
  v_status text;
  v_required numeric(12,2);
begin
  if v_user is null then raise exception 'Faça login para manifestar interesse.'; end if;

  -- Bloqueia a linha da obra para serializar os balões e impedir ultrapassar a meta.
  select * into v_post
    from public.atelie_posts
    where id::text = p_post_id
    for update;
  if not found then raise exception 'Obra não encontrada.'; end if;
  if v_post.user_id = v_user then raise exception 'Você não pode dar balão na própria obra.'; end if;

  if v_post.listing_mode = 'auction' then
    if v_post.publicar_mercado is not true
       or v_post.preco is null
       or v_post.auction_status <> 'collecting' then
      raise exception 'Esta obra não está recebendo balões para leilão.';
    end if;
    v_required := coalesce(v_post.auction_initial_price, v_post.preco);
  elsif v_post.listing_mode = 'community' then
    if v_post.publicar_comunidade is not true
       or v_post.auction_status not in ('none','collecting') then
      raise exception 'Esta obra não está recebendo manifestações da comunidade.';
    end if;
    -- Saldo mínimo provisório de R$ 10,00 para obras da comunidade.
    -- O valor não é debitado; obras já em leilão exigem o lance inicial.
    v_required := 10.00;
  else
    raise exception 'Esta obra não aceita balões.';
  end if;

  select coalesce(available_balance,0)
    into v_balance
    from public.refugiart_wallets
    where user_id = v_user;
  v_balance := coalesce(v_balance,0);

  if v_balance < v_required then
    return jsonb_build_object(
      'needs_wallet',true,
      'required',v_required,
      'balance',v_balance
    );
  end if;

  insert into public.refugiart_auction_interests(post_id,user_id)
    values (p_post_id,v_user)
    on conflict (post_id,user_id) do nothing;
  if not found then raise exception 'Você já manifestou interesse nesta obra.'; end if;

  select count(*)::integer
    into v_count
    from public.refugiart_auction_interests
    where post_id = p_post_id;

  v_status := v_post.auction_status;

  if v_post.listing_mode = 'auction' and v_count >= 10 then
    v_status := 'active';
    update public.atelie_posts
      set auction_status='active',
          auction_initial_price=v_required,
          auction_starts_at=now(),
          auction_ends_at=now()+interval '24 hours',
          auction_balloon_count=v_count
      where id::text=p_post_id;

    insert into public.refugiart_auctions(post_id,artist_id,initial_price,starts_at,ends_at)
      values(p_post_id,v_post.user_id,v_required,now(),now()+interval '24 hours')
      on conflict(post_id) do nothing;

  elsif v_post.listing_mode = 'community' and v_count >= 30 then
    v_status := 'pending_artist';
    update public.atelie_posts
      set auction_status='pending_artist',
          auction_balloon_count=v_count
      where id::text=p_post_id;
  else
    update public.atelie_posts
      set auction_balloon_count=v_count
      where id::text=p_post_id;
  end if;

  return jsonb_build_object(
    'needs_wallet',false,
    'count',v_count,
    'status',v_status
  );
end;
$$;

create or replace function public.refugiart_artist_approve_auction(p_post_id text,p_initial_price numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.atelie_posts%rowtype;
  v_interest_count integer;
  v_ends_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;

  select * into v_post
    from public.atelie_posts
    where id::text=p_post_id
    for update;
  if not found or v_post.user_id <> auth.uid() then
    raise exception 'Somente o artista pode aprovar este leilão.';
  end if;
  if v_post.listing_mode <> 'community'
     or v_post.publicar_comunidade is not true
     or v_post.auction_status <> 'pending_artist' then
    raise exception 'Esta obra não está aguardando aprovação.';
  end if;
  if p_initial_price is null or p_initial_price <= 0 then
    raise exception 'Informe um lance inicial válido.';
  end if;

  select count(*)::integer into v_interest_count
    from public.refugiart_auction_interests
    where post_id=p_post_id;
  if v_interest_count < 30 then
    raise exception 'A obra ainda não atingiu os 30 balões necessários.';
  end if;

  v_ends_at := now()+interval '24 hours';

  update public.atelie_posts
    set listing_mode='auction',
        publicar_mercado=true,
        preco=p_initial_price,
        auction_initial_price=p_initial_price,
        auction_status='active',
        auction_approved_at=now(),
        auction_starts_at=now(),
        auction_ends_at=v_ends_at
    where id::text=p_post_id;

  insert into public.refugiart_auctions(post_id,artist_id,initial_price,starts_at,ends_at)
    values(p_post_id,v_post.user_id,p_initial_price,now(),v_ends_at)
    on conflict(post_id) do update
      set status='active',
          initial_price=excluded.initial_price,
          starts_at=excluded.starts_at,
          ends_at=excluded.ends_at,
          winning_user_id=null,
          winning_bid=null,
          closed_at=null;

  return jsonb_build_object('status','active','ends_at',v_ends_at);
end;
$$;

-- Lances financeiros ficam bloqueados até existir reserva atômica do saldo.
-- Esta trava evita aceitar ofertas sem separar o dinheiro do participante.
create or replace function public.refugiart_place_auction_bid(p_auction_id bigint,p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Lances estão temporariamente indisponíveis. A reserva segura de saldo ainda está em implantação.';
end;
$$;

grant execute on function public.refugiart_give_balloon(text) to authenticated;
grant execute on function public.refugiart_artist_approve_auction(text,numeric) to authenticated;
grant execute on function public.refugiart_place_auction_bid(bigint,numeric) to authenticated;

commit;

-- PENDENTE: agendar uma Edge Function/cron para encerrar leilões vencidos,
-- validar saldo final, debitar o vencedor e creditar o artista em saldo bloqueado.
-- Não existe integração de pagamento/deposito/saque nesta migração.
