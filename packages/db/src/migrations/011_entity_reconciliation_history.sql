create table if not exists entity_resolution_history (
  id text primary key,
  tenant_id text not null,
  proposal_id text not null references entity_resolution_proposals(id) on delete cascade,
  source_candidate_id text not null references extracted_candidates(id) on delete cascade,
  accepted_record_type text not null,
  accepted_record_id text not null,
  previous_proposal_state text not null,
  new_proposal_state text not null,
  action text not null,
  chosen_entity_id text references canonical_entities(id) on delete set null,
  chosen_entity_display_name text,
  chosen_entity_created boolean not null default false,
  created_alias_values_json jsonb not null default '[]'::jsonb,
  review_note text,
  reviewer_actor_id text not null,
  reviewer_actor_name text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists entity_resolution_history_proposal_idx
  on entity_resolution_history (proposal_id, created_at desc);

create index if not exists entity_resolution_history_source_idx
  on entity_resolution_history (source_candidate_id, created_at desc);

insert into entity_resolution_history (
  id,
  tenant_id,
  proposal_id,
  source_candidate_id,
  accepted_record_type,
  accepted_record_id,
  previous_proposal_state,
  new_proposal_state,
  action,
  chosen_entity_id,
  chosen_entity_display_name,
  chosen_entity_created,
  created_alias_values_json,
  review_note,
  reviewer_actor_id,
  reviewer_actor_name,
  metadata_json,
  created_at
)
select
  concat('entityhist_', md5(clock_timestamp()::text || random()::text || proposal.id)),
  proposal.tenant_id,
  proposal.id,
  proposal.source_candidate_id,
  proposal.accepted_record_type,
  proposal.accepted_record_id,
  'pending_review',
  proposal.proposal_state,
  case
    when proposal.proposal_state = 'accepted' then 'accept'
    else 'reject'
  end,
  proposal.resolved_entity_id,
  resolved_entity.display_name,
  false,
  coalesce(alias_values.created_alias_values_json, '[]'::jsonb),
  proposal.review_note,
  proposal.reviewed_by_actor_id,
  proposal.reviewed_by_actor_name,
  jsonb_build_object('backfilled', true),
  proposal.reviewed_at
from entity_resolution_proposals proposal
left join canonical_entities resolved_entity on resolved_entity.id = proposal.resolved_entity_id
left join lateral (
  select jsonb_agg(alias.alias_value order by alias.created_at asc) as created_alias_values_json
  from canonical_entity_aliases alias
  where alias.source_candidate_id = proposal.source_candidate_id
) alias_values on true
where proposal.reviewed_at is not null
  and proposal.reviewed_by_actor_id is not null
  and proposal.reviewed_by_actor_name is not null
  and proposal.proposal_state in ('accepted', 'rejected')
  and not exists (
    select 1
    from entity_resolution_history history
    where history.proposal_id = proposal.id
  );
