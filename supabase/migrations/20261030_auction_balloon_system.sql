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
begin
  if v_user is null then raise exception 'Faça login para manifestar interesse.'; end if;
  select * into v_post from public.atelie_posts where id::text = p_post_id for update;
  if not found then raise exception 'Obra não encontrada.'; end if;
  if v_post.user_id = v_user then raise exception 'Você não pode dar balão na própria obra.'; end if;
  if v_post.listing_mode not in ('community','auction') then raise exception 'Esta obra não aceita balões.'; end if;
  if v_post.auction_status in ('pending_artist','active','finished','cancelled') then
    raise exception 'Esta obra não está recebendo novas manifestações.';
  end if;

  select coalesce(available_balance,0) into v_balance
    from public.refugiart_wallets where user_id = v_user;
  v_balance := coalesce(v_balance,0);
  if v_post.preco is not null and v_balance < v_post.preco then
    return jsonb_build_object('needs_wallet',true,'required',v_post.preco,'balance',v_balance);
  end if;
  -- Obra comunitária sem preço: exige saldo positivo como filtro mínimo.
  -- O valor de referência deverá ser definido pelo artista ao aprovar o leilão.
  if v_post.preco is null and v_post.auction_initial_price is null and v_balance <= 0 then
    return jsonb_build_object('needs_wallet',true,'required',1,'balance',v_balance);
  end if;

  insert into public.refugiart_auction_interests(post_id,user_id)
    values (p_post_id,v_user) on conflict (post_id,user_id) do nothing;
  if not found then raise exception 'Você já manifestou interesse nesta obra.'; end if;

  select count(*)::integer into v_count from public.refugiart_auction_interests where post_id=p_post_id;
  v_status := v_post.auction_status;
  if v_post.listing_mode = 'auction' and v_count >= 10 then
    v_status := 'active';
    update public.atelie_posts set auction_status='active',
      auction_initial_price=coalesce(auction_initial_price,preco),
      auction_starts_at=now(), auction_ends_at=now()+interval '24 hours',
      auction_balloon_count=v_count
      where id::text=p_post_id;
    insert into public.refugiart_auctions(post_id,artist_id,initial_price,starts_at,ends_at)
      values(p_post_id,v_post.user_id,coalesce(v_post.auction_initial_price,v_post.preco),now(),now()+interval '24 hours')
      on conflict(post_id) do nothing;
  elsif v_post.listing_mode = 'community' and v_count >= 30 then
    v_status := 'pending_artist';
    update public.atelie_posts set auction_status='pending_artist', auction_balloon_count=v_count where id::text=p_post_id;
  else
    update public.atelie_posts set auction_balloon_count=v_count where id::text=p_post_id;
  end if;
  return jsonb_build_object('needs_wallet',false,'count',v_count,'status',v_status);
end;
$$;

create or replace function public.refugiart_artist_approve_auction(p_post_id text,p_initial_price numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_post public.atelie_posts%rowtype;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  select * into v_post from public.atelie_posts where id::text=p_post_id for update;
  if not found or v_post.user_id <> auth.uid() then raise exception 'Somente o artista pode aprovar este leilão.'; end if;
  if v_post.listing_mode <> 'community' or v_post.auction_status <> 'pending_artist' then
    raise exception 'Esta obra não está aguardando aprovação.';
  end if;
  if p_initial_price is null or p_initial_price <= 0 then raise exception 'Informe um lance inicial válido.'; end if;
  update public.atelie_posts set listing_mode='auction', publicar_mercado=true,
    preco=p_initial_price, auction_initial_price=p_initial_price,
    auction_status='active', auction_approved_at=now(),
    auction_starts_at=now(), auction_ends_at=now()+interval '24 hours'
    where id::text=p_post_id;
  insert into public.refugiart_auctions(post_id,artist_id,initial_price,starts_at,ends_at)
    values(p_post_id,v_post.user_id,p_initial_price,now(),now()+interval '24 hours')
    on conflict(post_id) do update set status='active',initial_price=excluded.initial_price,
      starts_at=excluded.starts_at,ends_at=excluded.ends_at,winning_user_id=null,winning_bid=null,closed_at=null;
  return jsonb_build_object('status','active','ends_at',now()+interval '24 hours');
end;
$$;

create or replace function public.refugiart_place_auction_bid(p_auction_id bigint,p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_auction public.refugiart_auctions%rowtype; v_balance numeric(12,2); v_highest numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Faça login para dar um lance.'; end if;
  select * into v_auction from public.refugiart_auctions where id=p_auction_id for update;
  if not found or v_auction.status <> 'active' or now() >= v_auction.ends_at then
    raise exception 'Este leilão já foi encerrado.';
  end if;
  if v_auction.artist_id=auth.uid() then raise exception 'O artista não pode dar lance na própria obra.'; end if;
  select coalesce(available_balance,0) into v_balance from public.refugiart_wallets where user_id=auth.uid();
  if coalesce(v_balance,0) < p_amount then raise exception 'Saldo insuficiente para este lance.'; end if;
  select coalesce(max(amount),v_auction.initial_price) into v_highest
    from public.refugiart_auction_bids where auction_id=p_auction_id;
  if p_amount <= v_highest then raise exception 'O lance precisa superar a oferta atual.'; end if;
  insert into public.refugiart_auction_bids(auction_id,user_id,amount) values(p_auction_id,auth.uid(),p_amount);
  update public.refugiart_auctions set winning_user_id=auth.uid(),winning_bid=p_amount where id=p_auction_id;
  return jsonb_build_object('accepted',true,'amount',p_amount,'created_at',now());
end;
$$;

grant execute on function public.refugiart_give_balloon(text) to authenticated;
grant execute on function public.refugiart_artist_approve_auction(text,numeric) to authenticated;
grant execute on function public.refugiart_place_auction_bid(bigint,numeric) to authenticated;

commit;

-- PENDENTE: agendar uma Edge Function/cron para encerrar leilões vencidos,
-- validar saldo final, debitar o vencedor e creditar o artista em saldo bloqueado.
-- Não existe integração de pagamento/deposito/saque nesta migração.
