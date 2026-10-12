import type {
  ArtifactParserTarget,
  NormalizedContentKind,
  ParserResultStatus,
  ParserResultSummary,
  ParserWarning,
  PromotedArtifactSummary,
  ProvenanceAnchorSummary,
  ProvenanceAnchorsSummary
} from "@remi/domain";
import { createId } from "@remi/domain";
import type postgres from "postgres";

import { getDb, jsonb } from "./client";
import { getNormalizedContentRecords } from "./content";

type DbTransaction = postgres.Sql;

interface JsonMap {
  [key: string]: unknown;
}

export interface ProvenanceAnchorInput {
  anchorKey: string;
  anchorKind: string;
  locator: JsonMap;
  metadata: JsonMap;
  ownerId: string;
  ownerType: string;
  summary: string;
  title: string;
}

export interface UpsertNormalizationResultInput {
  artifactBlobId: string | null;
  contentKind: NormalizedContentKind | null;
  metadata?: JsonMap;
  parserTarget: string | null;
  reasonCodes: string[];
  reprocessRecommended: boolean;
  retryRecommended: boolean;
  sourceItemId: string;
  status: ParserResultStatus;
  summary: string;
  warnings: ParserWarning[];
}

export interface UpsertArtifactProcessingStateInput {
  artifactBlobId: string;
  contentKind: NormalizedContentKind | null;
  inspectionStatus: "completed" | "failed" | "pending" | "unsupported" | null;
  metadata?: JsonMap;
  normalizationStatus: ParserResultStatus | null;
  parserTarget: ArtifactParserTarget | null;
  reasonCodes: string[];
  reprocessRecommended: boolean;
  retryRecommended: boolean;
  summary: string;
  supportTier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
  warnings: ParserWarning[];
}

function normalizePayload<T>(value: T | string): T {
  if (typeof value !== "string") {
    return value;
  }

  return JSON.parse(value) as T;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapParserResult(row: {
  content_kind: NormalizedContentKind | null;
  reason_codes_json: string[] | string;
  reprocess_recommended: boolean;
  retry_recommended: boolean;
  status: ParserResultStatus;
  summary: string;
  updated_at: Date;
  warnings_json: ParserWarning[] | string;
}): ParserResultSummary {
  return {
    status: row.status,
    summary: row.summary,
    reasonCodes: normalizePayload<string[]>(row.reason_codes_json),
    warnings: normalizePayload<ParserWarning[]>(row.warnings_json),
    retryRecommended: row.retry_recommended,
    reprocessRecommended: row.reprocess_recommended,
    contentKind: row.content_kind,
    lastUpdatedAt: iso(row.updated_at)
  };
}

export function mapAnchor(row: {
  anchor_key: string;
  anchor_kind: string;
  id: string;
  locator_json: Record<string, unknown> | string;
  metadata_json: Record<string, unknown> | string;
  owner_id: string;
  owner_type: string;
  summary: string;
  title: string;
}): ProvenanceAnchorSummary {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    anchorKind: row.anchor_kind,
    anchorKey: row.anchor_key,
    title: row.title,
    summary: row.summary,
    locator: normalizePayload<Record<string, unknown>>(row.locator_json),
    metadata: normalizePayload<Record<string, unknown>>(row.metadata_json)
  };
}

function mapArtifactProcessing(row: {
  artifact_blob_id: string;
  content_kind: NormalizedContentKind | null;
  content_type: string | null;
  inspection_status: "completed" | "failed" | "pending" | "unsupported" | null;
  normalization_status: ParserResultStatus | null;
  original_file_name: string;
  parser_target: ArtifactParserTarget | null;
  sha256: string;
  summary: string;
  support_tier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
}): PromotedArtifactSummary {
  return {
    artifactBlobId: row.artifact_blob_id,
    sha256: row.sha256,
    originalFileName: row.original_file_name,
    contentType: row.content_type,
    supportTier: row.support_tier,
    parserTarget: row.parser_target,
    inspectionStatus: row.inspection_status,
    normalizationStatus: row.normalization_status,
    contentKind: row.content_kind,
    summary: row.summary
  };
}

export async function upsertNormalizationResult(input: UpsertNormalizationResultInput): Promise<ParserResultSummary> {
  const sql = getDb();
  const [row] = await sql<
    {
      content_kind: NormalizedContentKind | null;
      reason_codes_json: string[] | string;
      reprocess_recommended: boolean;
      retry_recommended: boolean;
      status: ParserResultStatus;
      summary: string;
      updated_at: Date;
      warnings_json: ParserWarning[] | string;
    }[]
  >`
    insert into normalization_results (
      id,
      source_item_id,
      artifact_blob_id,
      parser_target,
      content_kind,
      status,
      summary,
      reason_codes_json,
      warnings_json,
      retry_recommended,
      reprocess_recommended,
      metadata_json
    ) values (
      ${createId("normresult")},
      ${input.sourceItemId},
      ${input.artifactBlobId},
      ${input.parserTarget},
      ${input.contentKind},
      ${input.status},
      ${input.summary},
      ${jsonb(input.reasonCodes)},
      ${jsonb(input.warnings)},
      ${input.retryRecommended},
      ${input.reprocessRecommended},
      ${jsonb(input.metadata ?? {})}
    )
    on conflict (source_item_id)
    do update set
      artifact_blob_id = excluded.artifact_blob_id,
      parser_target = excluded.parser_target,
      content_kind = excluded.content_kind,
      status = excluded.status,
      summary = excluded.summary,
      reason_codes_json = excluded.reason_codes_json,
      warnings_json = excluded.warnings_json,
      retry_recommended = excluded.retry_recommended,
      reprocess_recommended = excluded.reprocess_recommended,
      metadata_json = excluded.metadata_json,
      updated_at = now()
    returning status, summary, reason_codes_json, warnings_json, retry_recommended, reprocess_recommended, content_kind, updated_at
  `;

  return mapParserResult(row);
}

export async function upsertArtifactProcessingState(
  input: UpsertArtifactProcessingStateInput
): Promise<PromotedArtifactSummary> {
  const sql = getDb();
  await sql`
    insert into artifact_processing_states (
      id,
      artifact_blob_id,
      support_tier,
      parser_target,
      inspection_status,
      normalization_status,
      content_kind,
      summary,
      reason_codes_json,
      warnings_json,
      retry_recommended,
      reprocess_recommended,
      metadata_json
    ) values (
      ${createId("artifactproc")},
      ${input.artifactBlobId},
      ${input.supportTier},
      ${input.parserTarget},
      ${input.inspectionStatus},
      ${input.normalizationStatus},
      ${input.contentKind},
      ${input.summary},
      ${jsonb(input.reasonCodes)},
      ${jsonb(input.warnings)},
      ${input.retryRecommended},
      ${input.reprocessRecommended},
      ${jsonb(input.metadata ?? {})}
    )
    on conflict (artifact_blob_id)
    do update set
      support_tier = excluded.support_tier,
      parser_target = excluded.parser_target,
      inspection_status = excluded.inspection_status,
      normalization_status = excluded.normalization_status,
      content_kind = excluded.content_kind,
      summary = excluded.summary,
      reason_codes_json = excluded.reason_codes_json,
      warnings_json = excluded.warnings_json,
      retry_recommended = excluded.retry_recommended,
      reprocess_recommended = excluded.reprocess_recommended,
      metadata_json = excluded.metadata_json,
      updated_at = now()
  `;
  const summary = await getArtifactProcessingSummary(input.artifactBlobId);
  if (!summary) {
    throw new Error(`Artifact processing state missing after upsert for ${input.artifactBlobId}`);
  }
  return summary;
}

export async function getArtifactProcessingSummary(artifactBlobId: string): Promise<PromotedArtifactSummary | null> {
  const sql = getDb();
  const [row] = await sql<
    {
      artifact_blob_id: string;
      content_kind: NormalizedContentKind | null;
      content_type: string | null;
      inspection_status: "completed" | "failed" | "pending" | "unsupported" | null;
      normalization_status: ParserResultStatus | null;
      original_file_name: string;
      parser_target: ArtifactParserTarget | null;
      sha256: string;
      summary: string;
      support_tier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
    }[]
  >`
    select
      aps.artifact_blob_id,
      aps.support_tier,
      aps.parser_target,
      aps.inspection_status,
      aps.normalization_status,
      aps.content_kind,
      aps.summary,
      ab.sha256,
      ab.content_type,
      ab.original_file_name
    from artifact_processing_states aps
    join artifact_blobs ab on ab.id = aps.artifact_blob_id
    where aps.artifact_blob_id = ${artifactBlobId}
    limit 1
  `;

  return row ? mapArtifactProcessing(row) : null;
}

export async function getNormalizationResultSummary(sourceItemId: string): Promise<ParserResultSummary | null> {
  const sql = getDb();
  const [row] = await sql<
    {
      content_kind: NormalizedContentKind | null;
      reason_codes_json: string[] | string;
      reprocess_recommended: boolean;
      retry_recommended: boolean;
      status: ParserResultStatus;
      summary: string;
      updated_at: Date;
      warnings_json: ParserWarning[] | string;
    }[]
  >`
    select
      status,
      summary,
      reason_codes_json,
      warnings_json,
      retry_recommended,
      reprocess_recommended,
      content_kind,
      updated_at
    from normalization_results
    where source_item_id = ${sourceItemId}
    limit 1
  `;

  return row ? mapParserResult(row) : null;
}

export async function persistProvenanceAnchors(input: {
  anchors: ProvenanceAnchorInput[];
  artifactBlobId: string;
  tenantId: string;
}): Promise<ProvenanceAnchorsSummary> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    const retainedKeys = new Set<string>();

    for (const anchor of input.anchors) {
      retainedKeys.add(`${anchor.ownerType}::${anchor.ownerId}::${anchor.anchorKind}::${anchor.anchorKey}`);

      await tx`
        insert into provenance_anchors (
          id,
          tenant_id,
          artifact_blob_id,
          owner_type,
          owner_id,
          anchor_kind,
          anchor_key,
          title,
          summary,
          locator_json,
          metadata_json
        ) values (
          ${createId("anchor")},
          ${input.tenantId},
          ${input.artifactBlobId},
          ${anchor.ownerType},
          ${anchor.ownerId},
          ${anchor.anchorKind},
          ${anchor.anchorKey},
          ${anchor.title},
          ${anchor.summary},
          ${jsonb(anchor.locator)},
          ${jsonb(anchor.metadata)}
        )
        on conflict (owner_type, owner_id, anchor_kind, anchor_key)
        do update set
          title = excluded.title,
          summary = excluded.summary,
          locator_json = excluded.locator_json,
          metadata_json = excluded.metadata_json,
          updated_at = now()
      `;
    }

    const existing = await tx<
      {
        anchor_key: string;
        anchor_kind: string;
        owner_id: string;
        owner_type: string;
      }[]
    >`
      select owner_type, owner_id, anchor_kind, anchor_key
      from provenance_anchors
      where artifact_blob_id = ${input.artifactBlobId}
    `;

    const stale = existing.filter(
      (anchor) =>
        !retainedKeys.has(`${anchor.owner_type}::${anchor.owner_id}::${anchor.anchor_kind}::${anchor.anchor_key}`)
    );

    if (stale.length > 0) {
      for (const anchor of stale) {
        await tx`
          delete from provenance_anchors
          where artifact_blob_id = ${input.artifactBlobId}
            and owner_type = ${anchor.owner_type}
            and owner_id = ${anchor.owner_id}
            and anchor_kind = ${anchor.anchor_kind}
            and anchor_key = ${anchor.anchor_key}
        `;
      }
    }
  });

  return getProvenanceAnchorsSummary(input.artifactBlobId);
}

export async function getProvenanceAnchorsSummary(artifactBlobId: string): Promise<ProvenanceAnchorsSummary> {
  const sql = getDb();
  const rows = await sql<
    {
      anchor_key: string;
      anchor_kind: string;
      id: string;
      locator_json: Record<string, unknown> | string;
      metadata_json: Record<string, unknown> | string;
      owner_id: string;
      owner_type: string;
      summary: string;
      title: string;
    }[]
  >`
    select
      id,
      owner_type,
      owner_id,
      anchor_kind,
      anchor_key,
      title,
      summary,
      locator_json,
      metadata_json
    from provenance_anchors
    where artifact_blob_id = ${artifactBlobId}
    order by anchor_kind asc, created_at asc
  `;

  const items = rows.map(mapAnchor);
  const groups = [
    ...items.reduce(
      (map, item) => map.set(item.anchorKind, (map.get(item.anchorKind) ?? 0) + 1),
      new Map<string, number>()
    )
  ]
    .map(([anchorKind, count]) => ({ anchorKind, count }))
    .sort((left, right) => left.anchorKind.localeCompare(right.anchorKind));

  return {
    totalCount: items.length,
    groups,
    items
  };
}

export async function getBlobReuseState(artifactBlobId: string): Promise<{
  anchorCount: number;
  contentKind: NormalizedContentKind | null;
  hasAnchors: boolean;
  hasNormalizedContent: boolean;
}> {
  const normalizedContent = await getNormalizedContentRecords(artifactBlobId);
  const anchors = await getProvenanceAnchorsSummary(artifactBlobId);

  return {
    anchorCount: anchors.totalCount,
    contentKind: normalizedContent.contentKind,
    hasAnchors: anchors.totalCount > 0,
    hasNormalizedContent: Boolean(normalizedContent.contentKind)
  };
}
