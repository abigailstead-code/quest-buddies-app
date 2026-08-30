-- QUEST ROAD - Supabase/Postgres schema
-- Run after enabling Supabase Auth. The app currently uses localStorage demo mode;
-- this migration is the backend contract for the next implementation step.

create extension if not exists pgcrypto;

create type public.quest_priority as enum ('small', 'medium', 'major');
create type public.quest_status as enum ('planned', 'completed');
create type public.transaction_kind as enum ('quest', 'reward', 'bonus', 'adjustment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  avatar text not null default '🧭',
  created_at timestamptz not null default now()
);

create table public.pairs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Quest Road',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  journey_start_date date not null default current_date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.pair_members (
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pair_id, user_id)
);

create unique index one_active_pair_per_user on public.pair_members(user_id);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  notes text,
  due_date date not null,
  priority public.quest_priority not null default 'medium',
  status public.quest_status not null default 'planned',
  coin_value integer not null default 20 check (coin_value >= 0),
  xp_value integer not null default 50 check (xp_value >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quests_pair_owner_due_idx on public.quests(pair_id, owner_id, due_date);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  for_user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  emoji text not null default '🎁',
  cost integer not null check (cost > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  title text not null,
  description text,
  emoji text not null default '⭐',
  target_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.encouragements (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  kind public.transaction_kind not null,
  label text not null,
  source_id uuid,
  created_at timestamptz not null default now()
);

create index transactions_user_created_idx on public.coin_transactions(user_id, created_at desc);

create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards(id) on delete restrict,
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cost integer not null check (cost > 0),
  redeemed_at timestamptz not null default now()
);

create table public.weekly_bonus_rules (
  pair_id uuid primary key references public.pairs(id) on delete cascade,
  enabled boolean not null default true,
  completion_threshold numeric not null default .80 check (completion_threshold between 0 and 1),
  completion_bonus_coins integer not null default 50,
  active_days_threshold integer not null default 5 check (active_days_threshold between 1 and 7),
  streak_bonus_coins integer not null default 25
);

-- Balance is derived from the immutable ledger instead of stored as mutable state.
create or replace function public.coin_balance(target_user uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(amount), 0)::integer
  from public.coin_transactions
  where user_id = target_user;
$$;

-- Pair membership helper used by RLS.
create or replace function public.is_pair_member(target_pair uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.pair_members
    where pair_id = target_pair and user_id = auth.uid()
  );
$$;

-- Complete/reopen a quest atomically and write/remove its ledger transaction.
create or replace function public.set_quest_completed(target_quest uuid, make_completed boolean)
returns public.quests
language plpgsql
security definer
set search_path = public
as $$
declare q public.quests;
begin
  select * into q from public.quests where id = target_quest for update;
  if q.id is null or q.owner_id <> auth.uid() or not public.is_pair_member(q.pair_id) then
    raise exception 'Quest not found or not permitted';
  end if;

  if make_completed and q.status <> 'completed' then
    update public.quests set status='completed', completed_at=now(), updated_at=now() where id=q.id returning * into q;
    insert into public.coin_transactions(pair_id,user_id,amount,kind,label,source_id)
    values(q.pair_id,q.owner_id,q.coin_value,'quest','Completed: ' || q.title,q.id);
  elsif not make_completed and q.status = 'completed' then
    update public.quests set status='planned', completed_at=null, updated_at=now() where id=q.id returning * into q;
    delete from public.coin_transactions where user_id=q.owner_id and kind='quest' and source_id=q.id;
  end if;
  return q;
end;
$$;

create or replace function public.redeem_reward(target_reward uuid)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare r public.rewards;
declare redemption public.reward_redemptions;
declare balance integer;
begin
  select * into r from public.rewards where id=target_reward and active=true for update;
  if r.id is null or not public.is_pair_member(r.pair_id) then raise exception 'Reward unavailable'; end if;
  if r.for_user_id is not null and r.for_user_id <> auth.uid() then raise exception 'Reward is for the other player'; end if;
  select public.coin_balance(auth.uid()) into balance;
  if balance < r.cost then raise exception 'Not enough coins'; end if;
  insert into public.reward_redemptions(reward_id,pair_id,user_id,cost)
  values(r.id,r.pair_id,auth.uid(),r.cost) returning * into redemption;
  insert into public.coin_transactions(pair_id,user_id,amount,kind,label,source_id)
  values(r.pair_id,auth.uid(),-r.cost,'reward','Redeemed: ' || r.title,redemption.id);
  return redemption;
end;
$$;

-- Create matching profile automatically on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.quests enable row level security;
alter table public.rewards enable row level security;
alter table public.milestones enable row level security;
alter table public.encouragements enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.weekly_bonus_rules enable row level security;

create policy "profile self or pairmate read" on public.profiles for select using (
  id=auth.uid() or exists(
    select 1 from public.pair_members me join public.pair_members them using(pair_id)
    where me.user_id=auth.uid() and them.user_id=profiles.id
  )
);
create policy "profile self update" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());

create policy "pair members read pair" on public.pairs for select using(public.is_pair_member(id));
create policy "authenticated create pair" on public.pairs for insert to authenticated with check(created_by=auth.uid());
create policy "pair creator update pair" on public.pairs for update using(created_by=auth.uid());

create policy "members read membership" on public.pair_members for select using(public.is_pair_member(pair_id));
create policy "self join pair" on public.pair_members for insert to authenticated with check(user_id=auth.uid());
create policy "self leave pair" on public.pair_members for delete using(user_id=auth.uid());

create policy "pair reads quests" on public.quests for select using(public.is_pair_member(pair_id));
create policy "owner creates quests" on public.quests for insert with check(owner_id=auth.uid() and public.is_pair_member(pair_id));
create policy "owner edits quests" on public.quests for update using(owner_id=auth.uid() and public.is_pair_member(pair_id));
create policy "owner deletes quests" on public.quests for delete using(owner_id=auth.uid() and public.is_pair_member(pair_id));

create policy "pair reads rewards" on public.rewards for select using(public.is_pair_member(pair_id));
create policy "pair creates rewards" on public.rewards for insert with check(created_by=auth.uid() and public.is_pair_member(pair_id));
create policy "creator edits rewards" on public.rewards for update using(created_by=auth.uid() and public.is_pair_member(pair_id));

create policy "pair reads milestones" on public.milestones for select using(public.is_pair_member(pair_id));
create policy "pair manages milestones insert" on public.milestones for insert with check(public.is_pair_member(pair_id));
create policy "pair manages milestones update" on public.milestones for update using(public.is_pair_member(pair_id));
create policy "pair manages milestones delete" on public.milestones for delete using(public.is_pair_member(pair_id));

create policy "pair reads encouragements" on public.encouragements for select using(public.is_pair_member(pair_id));
create policy "sender sends encouragement" on public.encouragements for insert with check(from_user_id=auth.uid() and public.is_pair_member(pair_id));

create policy "pair reads transactions" on public.coin_transactions for select using(public.is_pair_member(pair_id));
create policy "pair reads redemptions" on public.reward_redemptions for select using(public.is_pair_member(pair_id));
create policy "pair reads bonus rules" on public.weekly_bonus_rules for select using(public.is_pair_member(pair_id));
create policy "pair creates bonus rules" on public.weekly_bonus_rules for insert with check(public.is_pair_member(pair_id));
create policy "pair updates bonus rules" on public.weekly_bonus_rules for update using(public.is_pair_member(pair_id));

-- Important: no weekly reset/delete job is required.
-- Levels are derived from pair.journey_start_date + quest.due_date.
-- Therefore future levels generate automatically and old incomplete quests remain historical/overdue.
