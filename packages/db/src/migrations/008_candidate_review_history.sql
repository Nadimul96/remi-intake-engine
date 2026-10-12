create table if not exists candidate_review_history (
  id text primary key,
  candidate_id text not null references extracted_candidates(id) on delete cascade,
  artifact_blob_id text not null references artifact_blobs(id) on delete cascade,
  previous_review_status text not null,
  new_review_status text not null,
  action text not null,
  review_note text,
  edited_value_json jsonb,
  reviewer_actor_id text not null,
  reviewer_actor_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists candidate_review_history_candidate_idx
  on candidate_review_history (candidate_id, created_at desc);

create index if not exists candidate_review_history_artifact_idx
  on candidate_review_history (artifact_blob_id, created_at desc);

insert into candidate_review_history (
  id,
  candidate_id,
  artifact_blob_id,
  previous_review_status,
  new_review_status,
  action,
  review_note,
  edited_value_json,
  reviewer_actor_id,
  reviewer_actor_name,
  created_at
)
select
  'review_' || md5(ec.id || ':' || ec.review_status || ':' || ec.reviewed_at::text),
  ec.id,
  ec.artifact_blob_id,
  'pending_review',
  ec.review_status,
  case ec.review_status
    when 'accepted' then 'accept'
    when 'edited_and_accepted' then 'edit_and_accept'
    when 'rejected' then 'reject'
    else 'accept'
  end,
  ec.review_note,
  case
    when ec.review_status = 'edited_and_accepted' then ec.reviewed_value_json
    else null
  end,
  coalesce(ec.reviewed_by_actor_id, 'actor_backfill'),
  coalesce(ec.reviewed_by_actor_name, 'Backfilled Review'),
  ec.reviewed_at
from extracted_candidates ec
where ec.review_status in ('accepted', 'rejected', 'edited_and_accepted')
  and ec.reviewed_at is not null
  and not exists (
    select 1
    from candidate_review_history history
    where history.candidate_id = ec.id
  );
