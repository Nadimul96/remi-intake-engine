create table if not exists entity_resolution_system_events (
  id text primary key,
  tenant_id text not null,
  proposal_id text not null references entity_resolution_proposals(id) on delete cascade,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  accepted_record_type text not null,
  accepted_record_id text not null,
  event_type text not null,
  event_key text not null,
  previous_proposal_state text,
  new_proposal_state text,
  canonical_entity_id text references canonical_entities(id) on delete set null,
  canonical_entity_display_name text,
  alias_values_json jsonb not null default '[]'::jsonb,
  summary text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_key)
);

create index if not exists entity_resolution_system_events_proposal_idx
  on entity_resolution_system_events (proposal_id, created_at desc);

create index if not exists entity_resolution_system_events_source_idx
  on entity_resolution_system_events (source_candidate_id, created_at desc);
