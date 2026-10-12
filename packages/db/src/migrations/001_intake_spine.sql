create table if not exists source_connections (
  id text primary key,
  tenant_id text not null,
  key text not null unique,
  kind text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists artifact_blobs (
  id text primary key,
  tenant_id text not null,
  sha256 text not null unique,
  storage_bucket text not null,
  storage_key text not null,
  original_file_name text not null,
  content_type text,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists source_items (
  id text primary key,
  tenant_id text not null,
  source_connection_id text not null references source_connections(id),
  source_uri text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint not null,
  object_key text not null unique,
  status text not null,
  artifact_blob_id text references artifact_blobs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists source_items_tenant_created_idx on source_items (tenant_id, created_at desc);
create index if not exists source_items_status_idx on source_items (status);

create table if not exists ingestion_runs (
  id text primary key,
  source_item_id text not null references source_items(id),
  status text not null,
  stage text not null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingestion_runs_source_item_idx on ingestion_runs (source_item_id, created_at desc);

create table if not exists workflow_runs (
  id text primary key,
  workflow_type text not null,
  status text not null,
  external_workflow_id text unique,
  source_item_id text references source_items(id),
  ingestion_run_id text references ingestion_runs(id),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_runs_source_item_idx on workflow_runs (source_item_id, created_at desc);

create table if not exists derived_artifacts (
  id text primary key,
  artifact_blob_id text not null references artifact_blobs(id),
  kind text not null,
  storage_bucket text not null,
  storage_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists review_items (
  id text primary key,
  queue text not null,
  type text not null,
  status text not null,
  source_item_id text references source_items(id),
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_items_source_item_idx on review_items (source_item_id, created_at desc);

create table if not exists intake_events (
  id text primary key,
  source_item_id text references source_items(id),
  ingestion_run_id text references ingestion_runs(id),
  workflow_run_id text references workflow_runs(id),
  event_type text not null,
  actor_type text not null,
  actor_id text not null,
  message text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intake_events_source_item_idx on intake_events (source_item_id, created_at asc);
