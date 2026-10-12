create table if not exists documents (
  id text primary key,
  tenant_id text not null,
  artifact_blob_id text not null references artifact_blobs(id),
  title text,
  page_count integer not null,
  text_available boolean not null default false,
  text_preview text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_blob_id)
);

create table if not exists document_pages (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  page_number integer not null,
  text_available boolean not null default false,
  char_count integer not null default 0,
  text_preview text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, page_number)
);

create index if not exists document_pages_document_idx
  on document_pages (document_id, page_number);

create table if not exists email_threads (
  id text primary key,
  tenant_id text not null,
  artifact_blob_id text not null references artifact_blobs(id),
  thread_key text not null,
  subject text,
  message_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_blob_id)
);

create table if not exists email_messages (
  id text primary key,
  email_thread_id text not null references email_threads(id) on delete cascade,
  artifact_blob_id text not null references artifact_blobs(id),
  position integer not null,
  message_id_header text,
  subject text,
  sender text,
  to_json jsonb not null default '[]'::jsonb,
  cc_json jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  sent_at_raw text,
  body_preview text,
  attachment_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_blob_id),
  unique (email_thread_id, position)
);

create index if not exists email_messages_thread_idx
  on email_messages (email_thread_id, position);

create table if not exists attachments (
  id text primary key,
  email_message_id text not null references email_messages(id) on delete cascade,
  source_artifact_blob_id text not null references artifact_blobs(id),
  part_index integer not null,
  file_name text,
  content_type text,
  size_bytes bigint,
  content_disposition text,
  content_id text,
  sha256 text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email_message_id, part_index)
);

create index if not exists attachments_message_idx
  on attachments (email_message_id, part_index);

create table if not exists workbooks (
  id text primary key,
  tenant_id text not null,
  artifact_blob_id text not null references artifact_blobs(id),
  file_name text not null,
  sheet_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_blob_id)
);

create table if not exists worksheets (
  id text primary key,
  workbook_id text not null references workbooks(id) on delete cascade,
  sheet_index integer not null,
  name text not null,
  max_row integer,
  max_column integer,
  table_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workbook_id, sheet_index)
);

create index if not exists worksheets_workbook_idx
  on worksheets (workbook_id, sheet_index);

create table if not exists structured_tables (
  id text primary key,
  worksheet_id text not null references worksheets(id) on delete cascade,
  table_key text not null,
  name text not null,
  ref text,
  header_row_count integer,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worksheet_id, table_key)
);

create index if not exists structured_tables_worksheet_idx
  on structured_tables (worksheet_id, table_key);
