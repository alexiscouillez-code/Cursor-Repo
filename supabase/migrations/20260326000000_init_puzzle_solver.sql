-- Puzzle Solver 2D V5 — Supabase schema
-- Enable RLS on all tables. Service role bypasses RLS for server jobs.

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists puzzles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  expected_pieces int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  image_path text,
  width int,
  height int,
  piece_count int not null default 0,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);

create table if not exists pieces (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  scan_id uuid references scans(id) on delete set null,
  code text not null,
  bbox jsonb not null,
  geometry jsonb not null,
  colors jsonb,
  textures jsonb,
  is_corner boolean not null default false,
  is_border boolean not null default false,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  unique (puzzle_id, code)
);

create table if not exists piece_edges (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references pieces(id) on delete cascade,
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  side text not null check (side in ('TOP','RIGHT','BOTTOM','LEFT')),
  edge_type text not null check (edge_type in ('EDGE','INNER','TAB','BLANK')),
  length double precision not null,
  curvature double precision,
  signature jsonb not null,
  confidence double precision not null default 0
);

create table if not exists piece_features (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references pieces(id) on delete cascade,
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  feature_type text not null,
  payload jsonb not null
);

create table if not exists matches (
  id text primary key,
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  piece_a_id uuid not null references pieces(id) on delete cascade,
  piece_b_id uuid not null references pieces(id) on delete cascade,
  side_a text not null,
  side_b text not null,
  score jsonb not null,
  confidence double precision not null,
  explanations jsonb not null default '[]',
  status text not null default 'candidate',
  created_at timestamptz not null default now()
);

create table if not exists confirmed_matches (
  match_id text primary key references matches(id) on delete cascade,
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references users(id)
);

create table if not exists rejected_matches (
  match_id text primary key references matches(id) on delete cascade,
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  rejected_at timestamptz not null default now(),
  reason text
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  code text not null,
  origin jsonb not null default '{"x":0,"y":0}',
  orientation double precision not null default 0,
  bbox jsonb,
  confidence double precision not null default 0,
  connections jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (puzzle_id, code)
);

create table if not exists group_pieces (
  group_id uuid not null references groups(id) on delete cascade,
  piece_id uuid not null references pieces(id) on delete cascade,
  primary key (group_id, piece_id)
);

create table if not exists reference_images (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  image_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists reference_regions (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  reference_image_id uuid references reference_images(id) on delete cascade,
  name text not null,
  position text not null,
  confidence double precision not null,
  payload jsonb
);

create table if not exists piece_regions (
  piece_id uuid not null references pieces(id) on delete cascade,
  region_id uuid not null references reference_regions(id) on delete cascade,
  confidence double precision not null,
  primary key (piece_id, region_id)
);

create table if not exists ai_analyses (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  confidence double precision,
  status text not null default 'ok',
  created_at timestamptz not null default now()
);

create table if not exists puzzle_progress (
  puzzle_id uuid primary key references puzzles(id) on delete cascade,
  pieces_total int not null default 0,
  pieces_identified int not null default 0,
  connections_confirmed int not null default 0,
  groups_count int not null default 0,
  estimated_percent int not null default 0,
  payload jsonb,
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_puzzles_user on puzzles(user_id);
create index if not exists idx_scans_puzzle on scans(puzzle_id);
create index if not exists idx_pieces_puzzle on pieces(puzzle_id);
create index if not exists idx_piece_edges_puzzle on piece_edges(puzzle_id);
create index if not exists idx_matches_puzzle_status on matches(puzzle_id, status);
create index if not exists idx_groups_puzzle on groups(puzzle_id);

-- RLS
alter table users enable row level security;
alter table puzzles enable row level security;
alter table scans enable row level security;
alter table pieces enable row level security;
alter table piece_edges enable row level security;
alter table piece_features enable row level security;
alter table matches enable row level security;
alter table confirmed_matches enable row level security;
alter table rejected_matches enable row level security;
alter table groups enable row level security;
alter table group_pieces enable row level security;
alter table reference_images enable row level security;
alter table reference_regions enable row level security;
alter table piece_regions enable row level security;
alter table ai_analyses enable row level security;
alter table puzzle_progress enable row level security;

-- Policies: owner-only via auth.uid() mapped through users.auth_user_id
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select id from users where auth_user_id = auth.uid() limit 1
$$;

create policy puzzles_owner on puzzles
  for all using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

create policy scans_owner on scans
  for all using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

create policy pieces_owner on pieces
  for all using (
    puzzle_id in (select id from puzzles where user_id = public.current_app_user_id())
  )
  with check (
    puzzle_id in (select id from puzzles where user_id = public.current_app_user_id())
  );
