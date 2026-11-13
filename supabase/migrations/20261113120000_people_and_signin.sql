-- COOL Code — people, sign-in, and "made by"
-- Run once in Supabase → project "cool-code" → SQL Editor. Safe to run more than once.

-- Who made each code
alter table public.links add column if not exists created_by_email text;
alter table public.links add column if not exists created_by_name text;
create index if not exists links_creator_idx on public.links (created_by_email);

-- Access keys belong to a person (interim sign-in until Google is ready)
alter table public.app_keys add column if not exists email text;
alter table public.app_keys add column if not exists name text;
alter table public.app_keys add column if not exists is_admin boolean not null default false;
update public.app_keys
   set name = 'Wayne Goodman', email = 'wgoodman@thecoolchurch.com', is_admin = true
 where label = 'Wayne desktop app';

-- People who have used the app
create table if not exists public.app_users (
  email text primary key,
  name text,
  picture text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- Server settings (Google client, allowed domain, admins)
create table if not exists public.app_config (
  key text primary key,
  value text not null
);
insert into public.app_config (key, value) values
  ('allowed_domain', 'thecoolchurch.com'),
  ('admin_emails', 'wgoodman@thecoolchurch.com')
on conflict (key) do update set value = excluded.value;

alter table public.app_users enable row level security;
alter table public.app_config enable row level security;
revoke all on public.app_users, public.app_config from anon, authenticated;

-- Codes made so far were made by Wayne
update public.links set created_by_email = 'wgoodman@thecoolchurch.com', created_by_name = 'Wayne Goodman'
 where created_by_email is null and slug <> 'cctest1';

-- Summary now includes the creator
drop function if exists public.link_summaries();
create function public.link_summaries()
returns table (
  id uuid, slug text, name text, target_url text, archived boolean, created_at timestamptz,
  created_by_email text, created_by_name text,
  total bigint, uniques bigint, today bigint, last7 bigint, last_scan timestamptz
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.slug, l.name, l.target_url, l.archived, l.created_at,
    l.created_by_email, l.created_by_name,
    count(s.id) filter (where not s.is_bot),
    count(distinct s.visitor_hash) filter (where not s.is_bot),
    count(s.id) filter (where not s.is_bot and s.scanned_at >= date_trunc('day', now())),
    count(s.id) filter (where not s.is_bot and s.scanned_at >= now() - interval '7 days'),
    max(s.scanned_at) filter (where not s.is_bot)
  from links l left join scans s on s.link_id = l.id
  group by l.id
  order by l.created_at desc;
$$;
revoke execute on function public.link_summaries() from public, anon, authenticated;

-- Remove the test link left over from setup
delete from public.links where slug = 'cctest1';
