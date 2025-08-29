-- Migration 004: Add result field to user_google_documents table
-- This field will store the result from Langflow processing

-- Add result column to store processing results
ALTER TABLE public.user_google_documents 
ADD COLUMN IF NOT EXISTS result jsonb;

-- Add comment for the new column
COMMENT ON COLUMN public.user_google_documents.result IS 'JSON result from Langflow processing';
