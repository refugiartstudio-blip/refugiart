-- RefugiART: campos de modalidade necessários para separar vendas e leilões no Bazar.
-- Migração segura: não altera grants, policies, carteira ou funções financeiras.
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

-- Preserva os anúncios que já estavam publicados como vendas normais.
update public.atelie_posts
set listing_mode = 'market'
where publicar_mercado = true
  and preco is not null
  and listing_mode = 'community';

commit;
