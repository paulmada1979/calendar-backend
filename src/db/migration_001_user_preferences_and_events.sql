-- Migration 001: Add user preferences and calendar events tables
-- This migration adds tables for storing user timezone preferences, timeline data, and calendar events
-- while maintaining all existing functionality

-- Create user_preferences table to store user's selected timezone
create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  timezone text not null default 'UTC',
  locale text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_user_preferences_user foreign key (user_id) references auth.users(id) on delete cascade
);

-- Create unique index to ensure one preference record per user
create unique index if not exists ux_user_preferences_user on public.user_preferences(user_id);

-- Create user_timelines table to store user's world timeline configurations
create table if not exists public.user_timelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  place_id text not null, -- timezone identifier like 'America/New_York'
  city text not null,
  country text not null,
  zone text not null, -- full timezone string
  timezone_offset numeric(4,2) not null, -- timezone offset in hours
  locale text not null default 'en',
  display_order integer not null default 0, -- for ordering timeline places
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_user_timelines_user foreign key (user_id) references auth.users(id) on delete cascade
);

-- Create index for efficient user timeline queries
create index if not exists idx_user_timelines_user on public.user_timelines(user_id);
create index if not exists idx_user_timelines_active on public.user_timelines(user_id, is_active);

-- Create calendar_events table to store Google Calendar events locally
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  google_event_id text not null, -- Google Calendar event ID
  calendar_id text not null, -- Google Calendar ID
  summary text not null,
  description text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz,
  all_day boolean not null default false,
  attendees jsonb, -- Store attendees as JSON array
  color_id text,
  transparency text default 'opaque',
  visibility text default 'default',
  event_type text default 'meeting', -- 'meeting' or 'task'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_calendar_events_user foreign key (user_id) references auth.users(id) on delete cascade
);

-- Create indexes for efficient calendar events queries
create index if not exists idx_calendar_events_user on public.calendar_events(user_id);
create index if not exists idx_calendar_events_google_id on public.calendar_events(google_event_id);
create index if not exists idx_calendar_events_calendar on public.calendar_events(user_id, calendar_id);
create index if not exists idx_calendar_events_time_range on public.calendar_events(user_id, start_time, end_time);

-- Create unique constraint to prevent duplicate events per user
create unique index if not exists ux_calendar_events_user_google on public.calendar_events(user_id, google_event_id);

-- Add triggers for updated_at columns
drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function set_updated_at();

drop trigger if exists set_user_timelines_updated_at on public.user_timelines;
create trigger set_user_timelines_updated_at
before update on public.user_timelines
for each row execute function set_updated_at();

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
before update on public.calendar_events
for each row execute function set_updated_at();

-- Insert default user preferences for existing users (optional)
-- This can be run manually if needed
-- insert into public.user_preferences (user_id, timezone, locale)
-- select id, 'UTC', 'en-US' from auth.users
-- where id not in (select user_id from public.user_preferences);
