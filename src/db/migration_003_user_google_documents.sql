-- Migration 003: Create user_google_documents table for storing Google Drive documents
-- This table will store all documents (PDF, DOCX, TXT, MD, DOC) from connected Google Drive accounts

-- Create the user_google_documents table
create table if not exists public.user_google_documents (
  id bigint primary key generated always as identity,
  user_id text not null,
  google_drive_file_id text not null,
  file_name text not null,
  file_path text not null,
  mime_type text not null,
  file_size bigint,
  google_drive_web_view_link text,
  last_modified_at timestamptz,
  processed boolean default false,
  processing_status text default 'pending',
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure unique combination of user and Google Drive file
  constraint ux_user_google_documents_user_file unique (user_id, google_drive_file_id)
);

-- Create indexes for better performance
create index if not exists idx_user_google_documents_user_id on public.user_google_documents(user_id);
create index if not exists idx_user_google_documents_processed on public.user_google_documents(processed);
create index if not exists idx_user_google_documents_processing_status on public.user_google_documents(processing_status);
create index if not exists idx_user_google_documents_mime_type on public.user_google_documents(mime_type);
create index if not exists idx_user_google_documents_created_at on public.user_google_documents(created_at);

-- Create trigger for updated_at
drop trigger if exists set_user_google_documents_updated_at on public.user_google_documents;
create trigger set_user_google_documents_updated_at
before update on public.user_google_documents
for each row execute function set_updated_at();

-- Add comment to table
comment on table public.user_google_documents is 'Stores all Google Drive documents for users with processing status';
comment on column public.user_google_documents.processed is 'Whether the document has been processed';
comment on column public.user_google_documents.processing_status is 'Current processing status: pending, processing, completed, failed';
comment on column public.user_google_documents.processing_error is 'Error message if processing failed';
