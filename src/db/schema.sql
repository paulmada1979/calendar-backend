-- Create table for Google Calendar connections without touching existing user table
-- Assumes there is an existing public.users table with id as UUID or text

-- Ensure pgcrypto is available for gen_random_uuid
create extension if not exists pgcrypto;

create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'google',
  access_token text not null,
  refresh_token text not null,
  scope text,
  token_type text,
  expiry_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_user foreign key (user_id) references auth.users(id) on delete cascade
);

create index if not exists idx_google_calendar_connections_user on public.google_calendar_connections(user_id);
create unique index if not exists ux_google_calendar_connections_user on public.google_calendar_connections(user_id);

-- Update trigger for updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_google_calendar_connections_updated_at on public.google_calendar_connections;
create trigger set_google_calendar_connections_updated_at
before update on public.google_calendar_connections
for each row execute function set_updated_at();


