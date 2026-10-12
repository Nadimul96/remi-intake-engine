create table if not exists asset_organization_relationship_resolution_history (
  id text primary key,
  tenant_id text not null,
  proposal_id text not null references asset_organization_relationship_proposals(id) on delete cascade,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  accepted_record_id text not null,
  previous_proposal_state text not null,
  new_proposal_state text not null,
  action text not null,
  chosen_canonical_asset_entity_id text references canonical_entities(id) on delete set null,
  chosen_canonical_asset_display_name text,
  chosen_canonical_organization_entity_id text references canonical_entities(id) on delete set null,
  chosen_canonical_organization_display_name text,
  review_note text,
  reviewer_actor_id text not null,
  reviewer_actor_name text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists asset_org_relationship_resolution_history_proposal_idx
  on asset_organization_relationship_resolution_history (proposal_id, created_at desc);

create index if not exists asset_org_relationship_resolution_history_source_idx
  on asset_organization_relationship_resolution_history (source_candidate_id, created_at desc);

create table if not exists asset_organization_relationship_system_events (
  id text primary key,
  tenant_id text not null,
  proposal_id text not null references asset_organization_relationship_proposals(id) on delete cascade,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  accepted_record_id text not null,
  event_type text not null,
  event_key text not null,
  previous_proposal_state text,
  new_proposal_state text,
  canonical_asset_entity_id text references canonical_entities(id) on delete set null,
  canonical_asset_display_name text,
  canonical_organization_entity_id text references canonical_entities(id) on delete set null,
  canonical_organization_display_name text,
  summary text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_key)
);

create index if not exists asset_org_relationship_system_events_proposal_idx
  on asset_organization_relationship_system_events (proposal_id, created_at desc);

create index if not exists asset_org_relationship_system_events_source_idx
  on asset_organization_relationship_system_events (source_candidate_id, created_at desc);

update asset_organization_relationship_proposals proposal
set metadata_json = proposal.metadata_json || jsonb_strip_nulls(
  jsonb_build_object(
    'acceptedFieldName', accepted.field_name,
    'acceptedValueSnapshot', accepted.accepted_value_json,
    'artifactBlobId', accepted.artifact_blob_id,
    'artifactFileName', artifact.original_file_name
  )
)
from accepted_relationship_records accepted
join artifact_blobs artifact on artifact.id = accepted.artifact_blob_id
where accepted.id = proposal.accepted_record_id;

insert into asset_organization_relationship_resolution_history (
  id,
  tenant_id,
  proposal_id,
  source_candidate_id,
  accepted_record_id,
  previous_proposal_state,
  new_proposal_state,
  action,
  chosen_canonical_asset_entity_id,
  chosen_canonical_asset_display_name,
  chosen_canonical_organization_entity_id,
  chosen_canonical_organization_display_name,
  review_note,
  reviewer_actor_id,
  reviewer_actor_name,
  metadata_json,
  created_at
)
select
  concat('relhist_', md5(clock_timestamp()::text || random()::text || proposal.id)),
  proposal.tenant_id,
  proposal.id,
  proposal.source_candidate_id,
  proposal.accepted_record_id,
  'pending_review',
  proposal.proposal_state,
  case
    when proposal.proposal_state = 'accepted' then 'accept'
    else 'reject'
  end,
  proposal.asset_entity_id,
  asset_entity.display_name,
  proposal.organization_entity_id,
  organization_entity.display_name,
  proposal.review_note,
  proposal.reviewed_by_actor_id,
  proposal.reviewed_by_actor_name,
  jsonb_build_object('backfilled', true),
  proposal.reviewed_at
from asset_organization_relationship_proposals proposal
left join canonical_entities asset_entity on asset_entity.id = proposal.asset_entity_id
left join canonical_entities organization_entity on organization_entity.id = proposal.organization_entity_id
where proposal.reviewed_at is not null
  and proposal.reviewed_by_actor_id is not null
  and proposal.reviewed_by_actor_name is not null
  and proposal.proposal_state in ('accepted', 'rejected')
  and not exists (
    select 1
    from asset_organization_relationship_resolution_history history
    where history.proposal_id = proposal.id
  );
