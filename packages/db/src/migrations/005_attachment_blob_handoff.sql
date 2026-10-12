alter table attachments
  add column if not exists promotion_summary text;

update attachments
set promotion_summary = case
  when promotion_status = 'embedded_only' then 'Attachment exists only inside the parent email blob.'
  when promotion_status = 'promoted' then 'Attachment was promoted into an independent artifact blob.'
  when promotion_status = 'reused_existing_blob' then 'Attachment reused an existing immutable artifact blob.'
  when promotion_status = 'promotion_failed' then 'Attachment promotion failed.'
  else promotion_summary
end
where promotion_summary is null;

create table if not exists artifact_processing_states (
  id text primary key,
  artifact_blob_id text not null references artifact_blobs(id) on delete cascade,
  support_tier text,
  parser_target text,
  inspection_status text,
  normalization_status text,
  content_kind text,
  summary text not null,
  reason_codes_json jsonb not null default '[]'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  retry_recommended boolean not null default false,
  reprocess_recommended boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_blob_id)
);

create index if not exists artifact_processing_states_normalization_idx
  on artifact_processing_states (normalization_status, updated_at desc);
