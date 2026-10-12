create table if not exists canonical_entity_aliases (
  id text primary key,
  tenant_id text not null,
  canonical_entity_id text not null references canonical_entities(id) on delete cascade,
  entity_type text not null,
  alias_type text not null,
  alias_value text not null,
  normalized_alias_value text not null,
  alias_status text not null default 'active',
  source_candidate_id text references extracted_candidates(id) on delete cascade,
  source_accepted_record_type text,
  source_accepted_record_id text,
  source_artifact_blob_id text,
  reviewer_actor_id text,
  reviewer_actor_name text,
  review_note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_entity_id, normalized_alias_value, source_candidate_id)
);

create index if not exists canonical_entity_aliases_lookup_idx
  on canonical_entity_aliases (tenant_id, entity_type, normalized_alias_value, updated_at desc);

create index if not exists canonical_entity_aliases_source_idx
  on canonical_entity_aliases (source_candidate_id, updated_at desc);

alter table entity_resolution_proposals
  add column if not exists match_category text not null default 'create_new';

alter table entity_resolution_proposals
  add column if not exists matching_candidates_json jsonb not null default '[]'::jsonb;
