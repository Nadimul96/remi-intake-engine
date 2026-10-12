import type {
  ConflictKind,
  ConflictListResponse,
  ConflictSeverity,
  ConflictSide,
  ConflictStatus,
  ConflictSummary
} from "@remi/domain";
import { createId } from "@remi/domain";
import type postgres from "postgres";

import { getDb, jsonb } from "./client";

type DbTransaction = postgres.Sql;

/** A current candidate as conflict detection sees it. */
export interface ConflictDetectionInput {
  id: string;
  artifactBlobId: string;
  fileName: string;
  fieldName: string;
  candidateValue: unknown;
  extractionMethodDetail: string;
  metadata: Record<string, unknown>;
  provenanceAnchorIds: string[];
  evidence: string;
  locatorHint: string | null;
}

/** What a detector reports; persisted as-is and keyed by `conflictKey`. */
export interface DetectedConflictInput {
  conflictKey: string;
  kind: ConflictKind;
  severity: ConflictSeverity;
  assetName: string | null;
  metric: string | null;
  period: string | null;
  title: string;
  summary: string;
  sides: ConflictSide[];
}

export class ConflictNotFoundError extends Error {}

const ASSET_NAME_FIELD = "probable_asset_name_mention";
const METRIC_FIELD_PATTERN = "metric.%";

interface ConflictRow {
  asset_name: string | null;
  conflict_key: string;
  first_detected_at: Date;
  id: string;
  kind: ConflictKind;
  last_detected_at: Date;
  metric: string | null;
  period: string | null;
  resolution_note: string | null;
  resolved_at: Date | null;
  resolved_by_actor_id: string | null;
  resolved_candidate_id: string | null;
  severity: ConflictSeverity;
  sides_json: ConflictSide[] | string;
  status: ConflictStatus;
  summary: string;
  title: string;
}

function mapConflict(row: ConflictRow): ConflictSummary {
  return {
    id: row.id,
    conflictKey: row.conflict_key,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    assetName: row.asset_name,
    metric: row.metric,
    period: row.period,
    title: row.title,
    summary: row.summary,
    sides: typeof row.sides_json === "string" ? (JSON.parse(row.sides_json) as ConflictSide[]) : row.sides_json,
    resolvedCandidateId: row.resolved_candidate_id,
    resolutionNote: row.resolution_note,
    resolvedByActorId: row.resolved_by_actor_id,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    firstDetectedAt: row.first_detected_at.toISOString(),
    lastDetectedAt: row.last_detected_at.toISOString()
  };
}

async function loadDetectionInputs(tx: DbTransaction, tenantId: string): Promise<ConflictDetectionInput[]> {
  const rows = await tx<
    {
      artifact_blob_id: string;
      candidate_value_json: unknown;
      citation_packet_json:
        | {
            evidencePreview?: string;
            extractionMetadata?: { locatorHint?: string | null };
            provenanceAnchorIds?: string[];
          }
        | string;
      extraction_method_detail: string;
      field_name: string;
      id: string;
      metadata_json: Record<string, unknown> | string;
      original_file_name: string;
    }[]
  >`
    select
      candidate.id,
      candidate.artifact_blob_id,
      candidate.field_name,
      candidate.candidate_value_json,
      candidate.extraction_method_detail,
      candidate.metadata_json,
      candidate.citation_packet_json,
      blob.original_file_name
    from extracted_candidates candidate
    join artifact_blobs blob on blob.id = candidate.artifact_blob_id
    where candidate.tenant_id = ${tenantId}
      and candidate.current_extraction = true
      and candidate.review_status <> 'rejected'
      and (candidate.field_name = ${ASSET_NAME_FIELD} or candidate.field_name like ${METRIC_FIELD_PATTERN})
    order by candidate.artifact_blob_id, candidate.created_at, candidate.id
  `;

  return rows.map((row) => {
    const packet =
      typeof row.citation_packet_json === "string" ? JSON.parse(row.citation_packet_json) : row.citation_packet_json;
    const metadata = typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json;
    return {
      id: row.id,
      artifactBlobId: row.artifact_blob_id,
      fileName: row.original_file_name,
      fieldName: row.field_name,
      candidateValue: row.candidate_value_json,
      extractionMethodDetail: row.extraction_method_detail,
      metadata: metadata ?? {},
      provenanceAnchorIds: packet.provenanceAnchorIds ?? [],
      evidence: packet.evidencePreview ?? "",
      locatorHint: packet.extractionMetadata?.locatorHint ?? null
    };
  });
}

/**
 * Re-run detection for a tenant and reconcile the stored conflicts with the result.
 *
 * The read and the write share one transaction behind a per-tenant advisory lock, so
 * two workers finishing at the same time cannot interleave a stale view. Conflicts are
 * upserted by key (keeping their review status); ones that no longer reproduce are
 * marked superseded rather than deleted, mirroring how candidates are superseded.
 */
export async function runConflictDetection(
  tenantId: string,
  detect: (inputs: ConflictDetectionInput[]) => DetectedConflictInput[]
): Promise<{ current: number; superseded: number }> {
  const sql = getDb();

  return sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    await tx`select pg_advisory_xact_lock(hashtext(${`conflicts:${tenantId}`}))`;

    const detected = detect(await loadDetectionInputs(tx, tenantId));
    const keys: string[] = [];

    for (const conflict of detected) {
      keys.push(conflict.conflictKey);
      const [row] = await tx<{ id: string }[]>`
        insert into conflicts (
          id, tenant_id, conflict_key, kind, severity, asset_name, metric, period, title, summary, sides_json
        ) values (
          ${createId("conflict")},
          ${tenantId},
          ${conflict.conflictKey},
          ${conflict.kind},
          ${conflict.severity},
          ${conflict.assetName},
          ${conflict.metric},
          ${conflict.period},
          ${conflict.title},
          ${conflict.summary},
          ${jsonb(conflict.sides)}
        )
        on conflict (tenant_id, conflict_key) do update set
          kind = excluded.kind,
          severity = excluded.severity,
          asset_name = excluded.asset_name,
          metric = excluded.metric,
          period = excluded.period,
          title = excluded.title,
          summary = excluded.summary,
          sides_json = excluded.sides_json,
          current_detection = true,
          superseded_at = null,
          last_detected_at = now(),
          updated_at = now()
        returning id
      `;

      await tx`delete from conflict_sides where conflict_id = ${row.id}`;
      const links = conflict.sides.flatMap((side) =>
        side.provenanceAnchorIds.map((anchorId) => ({
          conflict_id: row.id,
          candidate_id: side.candidateId,
          provenance_anchor_id: anchorId
        }))
      );
      if (links.length > 0) {
        await tx`
          insert into conflict_sides ${tx(links)}
          on conflict do nothing
        `;
      }
    }

    const superseded = await tx`
      update conflicts
      set current_detection = false, superseded_at = now(), updated_at = now()
      where tenant_id = ${tenantId}
        and current_detection = true
        and ${keys.length > 0 ? tx`conflict_key not in ${tx(keys)}` : tx`true`}
    `;

    return { current: detected.length, superseded: superseded.count };
  });
}

function rankOf(values: string[]): Map<string, number> {
  return new Map(values.map((value, index) => [value, index]));
}

const SEVERITY_ORDER = rankOf(["high", "medium", "low"]);
const STATUS_ORDER = rankOf(["open", "resolved", "dismissed"]);

export async function listConflicts(tenantId: string): Promise<ConflictListResponse> {
  const sql = getDb();
  const rows = await sql<ConflictRow[]>`
    select *
    from conflicts
    where tenant_id = ${tenantId} and current_detection = true
  `;
  const items = rows
    .map(mapConflict)
    .sort(
      (left, right) =>
        (STATUS_ORDER.get(left.status) ?? 9) - (STATUS_ORDER.get(right.status) ?? 9) ||
        (SEVERITY_ORDER.get(left.severity) ?? 9) - (SEVERITY_ORDER.get(right.severity) ?? 9) ||
        left.title.localeCompare(right.title)
    );

  return {
    counts: {
      open: items.filter((item) => item.status === "open").length,
      resolved: items.filter((item) => item.status === "resolved").length,
      dismissed: items.filter((item) => item.status === "dismissed").length
    },
    items
  };
}

export async function getConflict(conflictId: string): Promise<ConflictSummary | null> {
  const sql = getDb();
  const [row] = await sql<ConflictRow[]>`select * from conflicts where id = ${conflictId}`;
  return row ? mapConflict(row) : null;
}

/** Record a reviewer decision; "resolve" may name the side the reviewer trusts. */
export async function decideConflict(input: {
  action: "resolve" | "dismiss" | "reopen";
  actorId: string;
  candidateId: string | null;
  conflictId: string;
  note: string | null;
}): Promise<ConflictSummary> {
  const sql = getDb();
  const newStatus: ConflictStatus =
    input.action === "resolve" ? "resolved" : input.action === "dismiss" ? "dismissed" : "open";

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    const [existing] = await tx<{ sides_json: ConflictSide[] | string; status: ConflictStatus }[]>`
      select status, sides_json from conflicts where id = ${input.conflictId} for update
    `;
    if (!existing) {
      throw new ConflictNotFoundError(`Conflict ${input.conflictId} was not found.`);
    }
    const sides = typeof existing.sides_json === "string" ? JSON.parse(existing.sides_json) : existing.sides_json;
    const chosen =
      input.action === "resolve" && input.candidateId
        ? ((sides as ConflictSide[]).find((side) => side.candidateId === input.candidateId)?.candidateId ?? null)
        : null;

    await tx`
      update conflicts set
        status = ${newStatus},
        resolved_candidate_id = ${chosen},
        resolution_note = ${input.action === "reopen" ? null : input.note},
        resolved_by_actor_id = ${input.action === "reopen" ? null : input.actorId},
        resolved_at = ${input.action === "reopen" ? null : new Date()},
        updated_at = now()
      where id = ${input.conflictId}
    `;
    await tx`
      insert into conflict_resolution_history (
        id, conflict_id, action, previous_status, new_status, candidate_id, note, actor_id
      ) values (
        ${createId("conflicthist")},
        ${input.conflictId},
        ${input.action},
        ${existing.status},
        ${newStatus},
        ${chosen},
        ${input.note},
        ${input.actorId}
      )
    `;
  });

  const updated = await getConflict(input.conflictId);
  if (!updated) {
    throw new ConflictNotFoundError(`Conflict ${input.conflictId} was not found.`);
  }
  return updated;
}
