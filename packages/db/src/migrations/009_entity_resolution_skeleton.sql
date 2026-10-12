create table if not exists canonical_entities (
  id text primary key,
  tenant_id text not null,
  entity_type text not null,
  display_name text not null,
  normalized_name text not null,
  status text not null default 'active',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists canonical_entities_lookup_idx
  on canonical_entities (tenant_id, entity_type, normalized_name, updated_at desc);

create table if not exists entity_resolution_proposals (
  id text primary key,
  tenant_id text not null,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  accepted_record_type text not null,
  accepted_record_id text not null,
  proposal_key text not null,
  entity_type text not null,
  proposal_kind text not null,
  proposal_state text not null default 'pending_review',
  proposed_display_name text not null,
  normalized_display_name text not null,
  target_entity_id text references canonical_entities(id) on delete set null,
  resolved_entity_id text references canonical_entities(id) on delete set null,
  confidence_score double precision not null,
  rationale text not null,
  match_strategy text not null,
  matching_entity_ids_json jsonb not null default '[]'::jsonb,
  current_proposal boolean not null default true,
  superseded_at timestamptz,
  review_note text,
  reviewed_at timestamptz,
  reviewed_by_actor_id text,
  reviewed_by_actor_name text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_candidate_id, proposal_key)
);

create index if not exists entity_resolution_proposals_queue_idx
  on entity_resolution_proposals (current_proposal, proposal_state, updated_at desc);

create index if not exists entity_resolution_proposals_entity_idx
  on entity_resolution_proposals (tenant_id, entity_type, normalized_display_name, updated_at desc);

create table if not exists accepted_truth_entity_links (
  id text primary key,
  tenant_id text not null,
  source_candidate_id text not null unique references extracted_candidates(id) on delete cascade,
  accepted_record_type text not null,
  accepted_record_id text not null,
  canonical_entity_id text not null references canonical_entities(id) on delete cascade,
  entity_type text not null,
  link_status text not null default 'active',
  link_reason text not null,
  resolution_proposal_id text references entity_resolution_proposals(id) on delete set null,
  reviewer_actor_id text not null,
  reviewer_actor_name text not null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accepted_truth_entity_links_entity_idx
  on accepted_truth_entity_links (canonical_entity_id, updated_at desc);

create index if not exists accepted_truth_entity_links_record_idx
  on accepted_truth_entity_links (accepted_record_type, accepted_record_id, updated_at desc);
