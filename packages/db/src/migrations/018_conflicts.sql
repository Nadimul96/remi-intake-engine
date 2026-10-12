-- Cross-document conflicts found by deterministic detection over current candidates.
-- A conflict is keyed by what it is about (kind, asset, metric, period), so re-running
-- detection updates it in place; conflicts that stop reproducing are superseded, not deleted.
create table if not exists conflicts (
  id text primary key,
  tenant_id text not null,
  conflict_key text not null,
  kind text not null,
  severity text not null,
  status text not null default 'open',
  asset_name text,
  metric text,
  period text,
  title text not null,
  summary text not null,
  sides_json jsonb not null,
  current_detection boolean not null default true,
  superseded_at timestamptz,
  resolved_candidate_id text references extracted_candidates(id) on delete set null,
  resolution_note text,
  resolved_by_actor_id text,
  resolved_at timestamptz,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, conflict_key)
);

create index if not exists conflicts_queue_idx
  on conflicts (tenant_id, current_detection, status, severity);

-- Relational links from each conflict to the candidates and provenance anchors it cites.
create table if not exists conflict_sides (
  conflict_id text not null references conflicts(id) on delete cascade,
  candidate_id text not null references extracted_candidates(id) on delete cascade,
  provenance_anchor_id text not null references provenance_anchors(id) on delete cascade,
  primary key (conflict_id, candidate_id, provenance_anchor_id)
);

create index if not exists conflict_sides_candidate_idx on conflict_sides (candidate_id);

create table if not exists conflict_resolution_history (
  id text primary key,
  conflict_id text not null references conflicts(id) on delete cascade,
  action text not null,
  previous_status text not null,
  new_status text not null,
  candidate_id text,
  note text,
  actor_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists conflict_resolution_history_conflict_idx
  on conflict_resolution_history (conflict_id, created_at desc);
