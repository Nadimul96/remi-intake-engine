create table if not exists candidate_extraction_states (
  id text primary key,
  artifact_blob_id text not null references artifact_blobs(id) on delete cascade,
  status text not null,
  summary text not null,
  candidate_count integer not null default 0,
  reason_codes_json jsonb not null default '[]'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  retry_recommended boolean not null default false,
  reprocess_recommended boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_blob_id)
);

create index if not exists candidate_extraction_states_status_idx
  on candidate_extraction_states (status, updated_at desc);

create table if not exists extracted_candidates (
  id text primary key,
  tenant_id text not null,
  artifact_blob_id text not null references artifact_blobs(id) on delete cascade,
  candidate_key text not null,
  candidate_type text not null,
  field_name text not null,
  value_type text not null,
  candidate_value_json jsonb not null,
  confidence_score double precision not null,
  extraction_method text not null,
  extraction_method_detail text not null,
  source_semantic_object_type text,
  source_semantic_object_id text,
  summary text not null,
  review_ready boolean not null default true,
  citation_packet_json jsonb not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_blob_id, candidate_key)
);

create index if not exists extracted_candidates_artifact_type_idx
  on extracted_candidates (artifact_blob_id, candidate_type, updated_at desc);
