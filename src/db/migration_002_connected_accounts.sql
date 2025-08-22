-- Migration 002: Create connected_accounts table for social media integrations
-- This table will store connections to various platforms like LinkedIn, Facebook, Twitter, Instagram

-- Create the provider enum type
create type if not exists provider_enum as enum (
  'linkedin',
  'facebook', 
  'twitter',
  'instagram',
  'google',
  'outlook',
  'slack',
  'gmail',
  'onedrive',
  'dropbox',
  'googledrive'
);

-- Create the connected_accounts table
create table if not exists public.connected_accounts (
  id bigint primary key generated always as identity,
  user_id text not null,
  provider provider_enum not null,
  auth_config_id text,
  connected_account_id text,
  account_label text,
  account_email text,
  external_user_id text,
  external_org_id text,
  scopes text[] default '{}',
  status text default 'active',
  is_primary boolean default false,
  last_validated_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta jsonb default '{}',
  public_url text
);

-- Create indexes for better performance
create index if not exists idx_connected_accounts_user_id on public.connected_accounts(user_id);
create index if not exists idx_connected_accounts_provider on public.connected_accounts(provider);
create index if not exists idx_connected_accounts_status on public.connected_accounts(status);
create index if not exists idx_connected_accounts_external_user_id on public.connected_accounts(external_user_id);

-- Create unique constraint to prevent duplicate connections for the same user and provider
create unique index if not exists ux_connected_accounts_user_provider 
on public.connected_accounts(user_id, provider) 
where status = 'active';

-- Create trigger for updated_at
drop trigger if exists set_connected_accounts_updated_at on public.connected_accounts;
create trigger set_connected_accounts_updated_at
before update on public.connected_accounts
for each row execute function set_updated_at();

-- Insert some sample data for testing (optional)
-- insert into public.connected_accounts (user_id, provider, account_label, status) 
-- values ('test-user-1', 'linkedin', 'Personal LinkedIn', 'active');
