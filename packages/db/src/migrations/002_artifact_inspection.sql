alter table derived_artifacts
  add column if not exists version integer not null default 1;

create unique index if not exists derived_artifacts_identity_idx
  on derived_artifacts (artifact_blob_id, kind, version);

create index if not exists derived_artifacts_blob_created_idx
  on derived_artifacts (artifact_blob_id, created_at desc);
