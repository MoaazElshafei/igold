-- Run once in Supabase → SQL Editor
create table if not exists prices (
  id int primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table prices enable row level security;

-- Anyone can read; writes only with the service_role key (used by GitHub Actions)
create policy "public read" on prices for select using (true);
