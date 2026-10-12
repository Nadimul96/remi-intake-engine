alter table attachments
  add column if not exists promoted_artifact_blob_id text references artifact_blobs(id),
  add column if not exists promotion_status text not null default 'embedded_only';

create table if not exists normalization_results (
  id text primary key,
  source_item_id text not null references source_items(id) on delete cascade,
  artifact_blob_id text references artifact_blobs(id),
  parser_target text,
  content_kind text,
  status text not null,
  summary text not null,
  reason_codes_json jsonb not null default '[]'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  retry_recommended boolean not null default false,
  reprocess_recommended boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_item_id)
);

create index if not exists normalization_results_artifact_blob_idx
  on normalization_results (artifact_blob_id);

create table if not exists provenance_anchors (
  id text primary key,
  tenant_id text not null,
  artifact_blob_id text not null references artifact_blobs(id) on delete cascade,
  owner_type text not null,
  owner_id text not null,
  anchor_kind text not null,
  anchor_key text not null,
  title text not null,
  summary text not null,
  locator_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id, anchor_kind, anchor_key)
);

create index if not exists provenance_anchors_blob_idx
  on provenance_anchors (artifact_blob_id, anchor_kind, created_at asc);
