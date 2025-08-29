-- Migration 005: Add local_file_path field to user_google_documents table
-- This field will store the local file path for downloaded Google Drive files

-- Add local_file_path column
ALTER TABLE public.user_google_documents 
ADD COLUMN IF NOT EXISTS local_file_path text;

-- Add downloaded_at column to track when file was downloaded
ALTER TABLE public.user_google_documents 
ADD COLUMN IF NOT EXISTS downloaded_at timestamptz;

-- Add comment for the new columns
COMMENT ON COLUMN public.user_google_documents.local_file_path IS 'Local file path where the document is stored temporarily';
COMMENT ON COLUMN public.user_google_documents.downloaded_at IS 'Timestamp when the file was downloaded to local storage';
