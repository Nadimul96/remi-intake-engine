create table if not exists asset_organization_relationship_proposals (
  id text primary key,
  tenant_id text not null,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  accepted_record_id text not null references accepted_relationship_records(id) on delete cascade,
  proposal_key text not null,
  relationship_type text not null,
  proposal_state text not null default 'pending_review',
  resolution_readiness text not null,
  confidence_score double precision not null,
  rationale text not null,
  asset_entity_id text references canonical_entities(id) on delete set null,
  organization_entity_id text references canonical_entities(id) on delete set null,
  asset_candidates_json jsonb not null default '[]'::jsonb,
  organization_candidates_json jsonb not null default '[]'::jsonb,
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

create index if not exists asset_organization_relationship_proposals_queue_idx
  on asset_organization_relationship_proposals (current_proposal, proposal_state, updated_at desc);

create index if not exists asset_organization_relationship_proposals_record_idx
  on asset_organization_relationship_proposals (accepted_record_id, updated_at desc);

create table if not exists accepted_asset_organization_relationship_links (
  id text primary key,
  tenant_id text not null,
  source_candidate_id text not null unique references extracted_candidates(id) on delete cascade,
  accepted_record_id text not null references accepted_relationship_records(id) on delete cascade,
  relationship_type text not null,
  canonical_asset_entity_id text not null references canonical_entities(id) on delete cascade,
  canonical_organization_entity_id text not null references canonical_entities(id) on delete cascade,
  link_status text not null default 'active',
  link_reason text not null,
  resolution_proposal_id text references asset_organization_relationship_proposals(id) on delete set null,
  reviewer_actor_id text not null,
  reviewer_actor_name text not null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accepted_asset_organization_relationship_links_asset_idx
  on accepted_asset_organization_relationship_links (canonical_asset_entity_id, updated_at desc);

create index if not exists accepted_asset_organization_relationship_links_org_idx
  on accepted_asset_organization_relationship_links (canonical_organization_entity_id, updated_at desc);
