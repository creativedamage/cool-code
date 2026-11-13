-- COOL Code — initial tracking schema (already applied on the live project)
create table public.links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[A-Za-z0-9_-]{3,40}$'),
  name text,
  target_url text not null check (target_url ~* '^https?://'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.scans (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.links(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  device text, os text, country text, visitor_hash text,
  is_bot boolean not null default false
);
create index scans_link_time_idx on public.scans (link_id, scanned_at desc);
create table public.app_keys (key_hash text primary key, label text, created_at timestamptz not null default now());
alter table public.links enable row level security;
alter table public.scans enable row level security;
alter table public.app_keys enable row level security;
revoke all on public.links, public.scans, public.app_keys from anon, authenticated;

create or replace function public.link_daily(p_link uuid, p_days int default 30, p_tz text default 'UTC')
returns table (day date, scans bigint, uniques bigint)
language sql stable security invoker set search_path = public as $$
  with d as (
    select generate_series((now() at time zone p_tz)::date - (p_days - 1), (now() at time zone p_tz)::date, interval '1 day')::date as day
  )
  select d.day, count(s.id), count(distinct s.visitor_hash)
  from d left join scans s on s.link_id = p_link and not s.is_bot and (s.scanned_at at time zone p_tz)::date = d.day
  group by d.day order by d.day;
$$;
revoke execute on function public.link_daily(uuid, int, text) from public, anon, authenticated;
