alter table extracted_candidates
  add column if not exists review_status text not null default 'pending_review',
  add column if not exists reviewed_value_json jsonb,
  add column if not exists review_note text,
  add column if not exists reviewed_by_actor_id text,
  add column if not exists reviewed_by_actor_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists accepted_record_type text,
  add column if not exists accepted_record_id text,
  add column if not exists current_extraction boolean not null default true,
  add column if not exists superseded_at timestamptz;

create index if not exists extracted_candidates_review_queue_idx
  on extracted_candidates (review_ready, current_extraction, review_status, updated_at desc);

create index if not exists extracted_candidates_current_idx
  on extracted_candidates (artifact_blob_id, current_extraction, updated_at desc);

create table if not exists accepted_fact_records (
  id text primary key,
  tenant_id text not null,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  artifact_blob_id text not null references artifact_blobs(id) on delete cascade,
  field_name text not null,
  value_type text not null,
  accepted_value_json jsonb not null,
  source_semantic_object_type text,
  source_semantic_object_id text,
  provenance_anchor_ids_json jsonb not null default '[]'::jsonb,
  citation_packet_json jsonb not null,
  review_status text not null,
  reviewer_actor_id text not null,
  reviewer_actor_name text not null,
  reviewed_at timestamptz not null,
  review_note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_candidate_id)
);

create index if not exists accepted_fact_records_artifact_idx
  on accepted_fact_records (artifact_blob_id, reviewed_at desc);

create table if not exists accepted_relationship_records (
  id text primary key,
  tenant_id text not null,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  artifact_blob_id text not null references artifact_blobs(id) on delete cascade,
  field_name text not null,
  value_type text not null,
  accepted_value_json jsonb not null,
  source_semantic_object_type text,
  source_semantic_object_id text,
  provenance_anchor_ids_json jsonb not null default '[]'::jsonb,
  citation_packet_json jsonb not null,
  review_status text not null,
  reviewer_actor_id text not null,
  reviewer_actor_name text not null,
  reviewed_at timestamptz not null,
  review_note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_candidate_id)
);

create index if not exists accepted_relationship_records_artifact_idx
  on accepted_relationship_records (artifact_blob_id, reviewed_at desc);

create table if not exists accepted_classification_records (
  id text primary key,
  tenant_id text not null,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  artifact_blob_id text not null references artifact_blobs(id) on delete cascade,
  field_name text not null,
  value_type text not null,
  accepted_value_json jsonb not null,
  source_semantic_object_type text,
  source_semantic_object_id text,
  provenance_anchor_ids_json jsonb not null default '[]'::jsonb,
  citation_packet_json jsonb not null,
  review_status text not null,
  reviewer_actor_id text not null,
  reviewer_actor_name text not null,
  reviewed_at timestamptz not null,
  review_note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_candidate_id)
);

create index if not exists accepted_classification_records_artifact_idx
  on accepted_classification_records (artifact_blob_id, reviewed_at desc);
