-- Quest Buddies starts with no rooms or product data. Supabase Auth owns user credentials.
create table if not exists public.quest_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar text not null default 'compass',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quest_rooms (
  id uuid primary key,
  code text not null unique,
  name text not null,
  status text not null check (status in ('waiting', 'playing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quest_room_members (
  room_id uuid not null references public.quest_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  color text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, role)
);

create table if not exists public.quest_room_states (
  room_id uuid primary key references public.quest_rooms(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists quest_room_members_user_id_idx on public.quest_room_members(user_id);

alter table public.quest_profiles enable row level security;
alter table public.quest_rooms enable row level security;
alter table public.quest_room_members enable row level security;
alter table public.quest_room_states enable row level security;

create policy "profiles are visible to the owner" on public.quest_profiles
  for select using (auth.uid() = id);
create policy "members can view their rooms" on public.quest_rooms
  for select using (exists (select 1 from public.quest_room_members m where m.room_id = id and m.user_id = auth.uid()));
create policy "members can view room memberships" on public.quest_room_members
  for select using (user_id = auth.uid() or exists (select 1 from public.quest_room_members mine where mine.room_id = room_id and mine.user_id = auth.uid()));
create policy "members can view room state" on public.quest_room_states
  for select using (exists (select 1 from public.quest_room_members m where m.room_id = room_id and m.user_id = auth.uid()));
