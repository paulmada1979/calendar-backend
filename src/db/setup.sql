-- Database Setup Script
-- This script helps set up the database with all required tables and extensions

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create the set_updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
\i migration_001_user_preferences_and_events.sql

-- Verify tables were created
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'google_calendar_connections',
    'user_preferences', 
    'user_timelines',
    'calendar_events'
  )
ORDER BY table_name;

-- Verify indexes were created
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN (
    'google_calendar_connections',
    'user_preferences', 
    'user_timelines',
    'calendar_events'
  )
ORDER BY tablename, indexname;

-- Verify triggers were created
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers 
WHERE trigger_schema = 'public' 
  AND event_object_table IN (
    'google_calendar_connections',
    'user_preferences', 
    'user_timelines',
    'calendar_events'
  )
ORDER BY event_object_table, trigger_name;

-- Display table structure
\d+ google_calendar_connections
\d+ user_preferences
\d+ user_timelines
\d+ calendar_events

-- Success message
SELECT 'Database setup completed successfully!' as status;
