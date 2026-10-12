import type {
  ArtifactBlob,
  ArtifactFileClassification,
  ArtifactInspectionStatus,
  ArtifactParserTarget,
  ArtifactSupportTier,
  CandidateExtractionResult,
  DerivedArtifactSummary,
  IntakeDetail,
  IntakeQueueItem,
  NormalizedContentKind,
  ParserResultStatus,
  ParserWarning,
  SourceConnection,
  SourceConnectionKind,
  TimelineEvent
} from "@remi/domain";
import { createId } from "@remi/domain";
import type postgres from "postgres";

import { getCandidateExtractionSummary, getExtractedCandidates } from "./candidates";
import { getDb, jsonb } from "./client";
import { getNormalizedContentRecords } from "./content";
import { requiredEnv } from "./env";
import { getNormalizationResultSummary, getProvenanceAnchorsSummary, upsertNormalizationResult } from "./processing";

type DbTransaction = postgres.Sql;

interface SourceConnectionRow {
  id: string;
  tenant_id: string;
  key: string;
  kind: SourceConnectionKind;
  name: string;
  created_at: Date;
  updated_at: Date;
}

interface RegistrationInput {
  actorId: string;
  contentType: string | null;
  fileName: string;
  objectKey: string;
  sizeBytes: number;
  sourceConnectionId: string;
  sourceUri: string;
  tenantId: string;
}

interface RegistrationResult {
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
  shouldStartWorkflow: boolean;
  wasReplayed: boolean;
}

interface PromoteArtifactInput {
  contentType: string | null;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  tenantId: string;
}

interface CompleteIngestionInput {
  actorId: string;
  artifactBlobId: string;
  contentType: string | null;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}

interface DerivedArtifactUpsertInput {
  artifactBlobId: string;
  kind:
    | "artifact_inspection"
    | "candidate_citation_packets"
    | "normalized_metadata"
    | "preview_text"
    | "provenance_anchor_manifest";
  metadata: Record<string, unknown>;
  storageBucket: string;
  storageKey: string;
  version: number;
}

interface ArtifactInspectionSummary {
  fileClassification: ArtifactFileClassification | null;
  inspectionStatus: ArtifactInspectionStatus | null;
  isContainer: boolean | null;
  nativeTextPresent: boolean | null;
  normalizedExtension: string | null;
  ocrNeededLater: boolean | null;
  parserEligible: boolean;
  parserTarget: ArtifactParserTarget | null;
  supportTier: ArtifactSupportTier | null;
}

function asNumber(value: bigint | number | string | null): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return value ? Number(value) : 0;
}

function iso(date: Date): string {
  return date.toISOString();
}

function normalizePayload(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {
      raw: value
    };
  }
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapDerivedArtifact(row: {
  created_at: Date;
  id: string;
  kind: DerivedArtifactSummary["kind"];
  metadata_json: Record<string, unknown> | string;
  storage_key: string;
  version: number;
}): DerivedArtifactSummary {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    storageKey: row.storage_key,
    metadata: normalizePayload(row.metadata_json),
    createdAt: iso(row.created_at)
  };
}

function summarizeInspection(metadata: Record<string, unknown> | null): ArtifactInspectionSummary {
  return {
    fileClassification: (asString(metadata?.fileClassification) as ArtifactFileClassification | null) ?? null,
    inspectionStatus: (asString(metadata?.inspectionStatus) as ArtifactInspectionStatus | null) ?? null,
    isContainer: asBoolean(metadata?.isContainer),
    nativeTextPresent: asBoolean(metadata?.nativeTextPresent),
    normalizedExtension: asString(metadata?.normalizedExtension),
    ocrNeededLater: asBoolean(metadata?.ocrNeededLater),
    parserEligible: asBoolean(metadata?.parserEligible) ?? false,
    parserTarget: (asString(metadata?.parserTarget) as ArtifactParserTarget | null) ?? null,
    supportTier: (asString(metadata?.supportTier) as ArtifactSupportTier | null) ?? null
  };
}

function emptyNormalizedContentRecords() {
  return {
    attachments: [],
    contentKind: null,
    document: null,
    documentPages: [],
    emailMessages: [],
    emailThread: null,
    lastNormalizedAt: null,
    structuredTables: [],
    workbook: null,
    worksheets: []
  };
}

function fallbackNormalizationResult(input: {
  contentKind: NormalizedContentKind | null;
  ingestionStatus: "completed" | "failed" | "processing" | "queued";
}): {
  contentKind: NormalizedContentKind | null;
  lastUpdatedAt: string | null;
  reasonCodes: string[];
  reprocessRecommended: boolean;
  retryRecommended: boolean;
  status: ParserResultStatus;
  summary: string;
  warnings: ParserWarning[];
} {
  if (input.ingestionStatus === "failed") {
    return {
      contentKind: input.contentKind,
      lastUpdatedAt: null,
      reasonCodes: ["ingestion_failed_before_normalization_result"],
      reprocessRecommended: false,
      retryRecommended: true,
      status: "failed",
      summary: "Normalization result is unavailable because ingestion failed.",
      warnings: []
    };
  }

  return {
    contentKind: input.contentKind,
    lastUpdatedAt: null,
    reasonCodes: ["normalization_result_not_recorded"],
    reprocessRecommended: false,
    retryRecommended: false,
    status: "pending",
    summary: "Normalization result has not been recorded yet.",
    warnings: []
  };
}

function fallbackCandidateExtractionResult(input: {
  ingestionStatus: "completed" | "failed" | "processing" | "queued";
  normalizationStatus: ParserResultStatus;
}): CandidateExtractionResult {
  if (input.ingestionStatus === "failed" || input.normalizationStatus === "failed") {
    return {
      status: "failed",
      summary: "Candidate extraction is unavailable because upstream processing failed.",
      reasonCodes: ["upstream_processing_failed_before_candidate_extraction"],
      warnings: [],
      retryRecommended: true,
      reprocessRecommended: false,
      candidateCount: 0,
      lastUpdatedAt: null
    };
  }

  if (input.normalizationStatus === "deferred" || input.normalizationStatus === "skipped") {
    return {
      status: "skipped",
      summary:
        "Candidate extraction was skipped because normalized content is unavailable or reused state has not been recorded yet.",
      reasonCodes: ["candidate_extraction_not_recorded"],
      warnings: [],
      retryRecommended: false,
      reprocessRecommended: input.normalizationStatus === "deferred",
      candidateCount: 0,
      lastUpdatedAt: null
    };
  }

  return {
    status: "pending",
    summary: "Candidate extraction has not been recorded yet.",
    reasonCodes: ["candidate_extraction_not_recorded"],
    warnings: [],
    retryRecommended: false,
    reprocessRecommended: false,
    candidateCount: 0,
    lastUpdatedAt: null
  };
}

function mapSourceConnection(row: SourceConnectionRow): SourceConnection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    key: row.key,
    kind: row.kind,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapArtifactBlob(row: {
  content_type: string | null;
  created_at: Date;
  id: string;
  original_file_name: string;
  sha256: string;
  size_bytes: bigint | number | string;
  storage_bucket: string;
  storage_key: string;
  tenant_id: string;
}): ArtifactBlob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sha256: row.sha256,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    originalFileName: row.original_file_name,
    contentType: row.content_type,
    sizeBytes: asNumber(row.size_bytes),
    createdAt: row.created_at
  };
}

async function insertEvent(
  tx: DbTransaction,
  input: {
    actorId: string;
    actorType?: "system" | "user";
    eventType: string;
    ingestionRunId?: string;
    message: string;
    payload?: Record<string, unknown>;
    sourceItemId?: string;
    workflowRunId?: string;
  }
): Promise<void> {
  await tx`
    insert into intake_events (
      id,
      source_item_id,
      ingestion_run_id,
      workflow_run_id,
      event_type,
      actor_type,
      actor_id,
      message,
      payload_json
    ) values (
      ${createId("event")},
      ${input.sourceItemId ?? null},
      ${input.ingestionRunId ?? null},
      ${input.workflowRunId ?? null},
      ${input.eventType},
      ${input.actorType ?? "system"},
      ${input.actorId},
      ${input.message},
      ${jsonb(input.payload ?? {})}
    )
  `;
}

export async function ensureSourceConnection(input: {
  key: string;
  kind: SourceConnectionKind;
  name: string;
  tenantId: string;
}): Promise<SourceConnection> {
  const sql = getDb();
  const [row] = await sql<SourceConnectionRow[]>`
    insert into source_connections (id, tenant_id, key, kind, name)
    values (${createId("sourceconn")}, ${input.tenantId}, ${input.key}, ${input.kind}, ${input.name})
    on conflict (key)
    do update set
      kind = excluded.kind,
      name = excluded.name,
      updated_at = now()
    returning *
  `;

  return mapSourceConnection(row);
}

export async function createIntakeRegistration(input: RegistrationInput): Promise<RegistrationResult> {
  const sql = getDb();

  return sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    const existing = await tx<
      {
        external_workflow_id: string | null;
        ingestion_run_id: string;
        source_item_id: string;
        workflow_run_id: string;
        workflow_status: "completed" | "failed" | "queued" | "running";
      }[]
    >`
      select
        s.id as source_item_id,
        ir.id as ingestion_run_id,
        wr.id as workflow_run_id,
        wr.external_workflow_id,
        wr.status as workflow_status
      from source_items s
      join lateral (
        select id
        from ingestion_runs
        where source_item_id = s.id
        order by created_at desc
        limit 1
      ) ir on true
      join lateral (
        select id, external_workflow_id, status
        from workflow_runs
        where source_item_id = s.id
        order by created_at desc
        limit 1
      ) wr on true
      where s.object_key = ${input.objectKey}
      limit 1
    `;

    if (existing[0]) {
      return {
        sourceItemId: existing[0].source_item_id,
        ingestionRunId: existing[0].ingestion_run_id,
        workflowRunId: existing[0].workflow_run_id,
        shouldStartWorkflow: !existing[0].external_workflow_id && existing[0].workflow_status === "queued",
        wasReplayed: true
      };
    }

    const sourceItemId = createId("sourceitem");
    const ingestionRunId = createId("ingest");
    const workflowRunId = createId("workflow");

    await tx`
      insert into source_items (
        id,
        tenant_id,
        source_connection_id,
        source_uri,
        file_name,
        content_type,
        size_bytes,
        object_key,
        status
      ) values (
        ${sourceItemId},
        ${input.tenantId},
        ${input.sourceConnectionId},
        ${input.sourceUri},
        ${input.fileName},
        ${input.contentType},
        ${input.sizeBytes},
        ${input.objectKey},
        'registered'
      )
    `;

    await tx`
      insert into ingestion_runs (id, source_item_id, status, stage)
      values (${ingestionRunId}, ${sourceItemId}, 'queued', 'registered')
    `;

    await tx`
      insert into workflow_runs (id, workflow_type, status, source_item_id, ingestion_run_id)
      values (${workflowRunId}, 'intake_registration', 'queued', ${sourceItemId}, ${ingestionRunId})
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      actorType: "user",
      eventType: "source_item_registered",
      sourceItemId,
      ingestionRunId,
      workflowRunId,
      message: "Source item registered for intake",
      payload: {
        fileName: input.fileName,
        objectKey: input.objectKey
      }
    });

    await insertEvent(tx, {
      actorId: input.actorId,
      actorType: "system",
      eventType: "ingestion_queued",
      sourceItemId,
      ingestionRunId,
      workflowRunId,
      message: "Ingestion run queued"
    });

    return {
      sourceItemId,
      ingestionRunId,
      workflowRunId,
      shouldStartWorkflow: true,
      wasReplayed: false
    };
  });
}

export async function bindWorkflowExecutionId(input: {
  actorId: string;
  externalWorkflowId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    const [row] = await tx<{ ingestion_run_id: string | null; source_item_id: string | null }[]>`
      update workflow_runs
      set external_workflow_id = ${input.externalWorkflowId}, updated_at = now()
      where id = ${input.workflowRunId}
      returning source_item_id, ingestion_run_id
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "workflow_started",
      ingestionRunId: row?.ingestion_run_id ?? undefined,
      message: "Temporal workflow started",
      payload: {
        externalWorkflowId: input.externalWorkflowId
      },
      sourceItemId: row?.source_item_id ?? undefined,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function markIngestionProcessing(input: {
  actorId: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    await tx`
      update source_items
      set status = 'processing', updated_at = now()
      where id = ${input.sourceItemId}
    `;

    await tx`
      update ingestion_runs
      set status = 'processing', stage = 'immutable_storage', started_at = coalesce(started_at, now()), updated_at = now()
      where id = ${input.ingestionRunId}
    `;

    await tx`
      update workflow_runs
      set status = 'running', updated_at = now()
      where id = ${input.workflowRunId}
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "ingestion_processing",
      ingestionRunId: input.ingestionRunId,
      message: "Ingestion processing started",
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function upsertArtifactBlob(input: PromoteArtifactInput): Promise<ArtifactBlob> {
  const sql = getDb();
  const [row] = await sql<
    {
      content_type: string | null;
      created_at: Date;
      id: string;
      original_file_name: string;
      sha256: string;
      size_bytes: bigint | number | string;
      storage_bucket: string;
      storage_key: string;
      tenant_id: string;
    }[]
  >`
    insert into artifact_blobs (
      id,
      tenant_id,
      sha256,
      storage_bucket,
      storage_key,
      original_file_name,
      content_type,
      size_bytes
    ) values (
      ${createId("artifact")},
      ${input.tenantId},
      ${input.sha256},
      ${input.storageBucket},
      ${input.storageKey},
      ${input.fileName},
      ${input.contentType},
      ${input.sizeBytes}
    )
    on conflict (sha256)
    do update set
      content_type = coalesce(artifact_blobs.content_type, excluded.content_type)
    returning *
  `;

  return mapArtifactBlob(row);
}

export async function upsertDerivedArtifact(input: DerivedArtifactUpsertInput): Promise<DerivedArtifactSummary> {
  const sql = getDb();
  const [row] = await sql<
    {
      created_at: Date;
      id: string;
      kind: DerivedArtifactSummary["kind"];
      metadata_json: Record<string, unknown> | string;
      storage_key: string;
      version: number;
    }[]
  >`
    insert into derived_artifacts (
      id,
      artifact_blob_id,
      kind,
      version,
      storage_bucket,
      storage_key,
      metadata_json
    ) values (
      ${createId("derived")},
      ${input.artifactBlobId},
      ${input.kind},
      ${input.version},
      ${input.storageBucket},
      ${input.storageKey},
      ${jsonb(input.metadata)}
    )
    on conflict (artifact_blob_id, kind, version)
    do update set
      storage_bucket = excluded.storage_bucket,
      storage_key = excluded.storage_key,
      metadata_json = excluded.metadata_json
    returning id, kind, version, storage_key, metadata_json, created_at
  `;

  return mapDerivedArtifact(row);
}

export async function markInspectionStarted(input: {
  actorId: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await tx`
      update ingestion_runs
      set stage = 'inspection', updated_at = now()
      where id = ${input.ingestionRunId}
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "inspection_started",
      ingestionRunId: input.ingestionRunId,
      message: "Artifact inspection started",
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function recordInspectionArtifacts(input: {
  actorId: string;
  derivedArtifacts: Pick<DerivedArtifactSummary, "id" | "kind" | "version">[];
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "derived_artifacts_recorded",
      ingestionRunId: input.ingestionRunId,
      message: "Derived artifacts recorded",
      payload: {
        derivedArtifacts: input.derivedArtifacts
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "inspection_completed",
      ingestionRunId: input.ingestionRunId,
      message: "Artifact inspection completed",
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function recordInspectionFailure(input: {
  actorId: string;
  artifactBlobId?: string;
  errorMessage: string;
  ingestionRunId: string;
  materialBlocker?: boolean;
  parserTarget?: ArtifactParserTarget | null;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "inspection_failed",
      ingestionRunId: input.ingestionRunId,
      message: "Artifact inspection failed",
      payload: {
        errorMessage: input.errorMessage
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    await upsertNormalizationResult({
      artifactBlobId: input.artifactBlobId ?? null,
      contentKind: null,
      parserTarget: input.parserTarget ?? null,
      reasonCodes: ["inspection_failed_prevented_normalization"],
      reprocessRecommended: false,
      retryRecommended: true,
      sourceItemId: input.sourceItemId,
      status: "failed",
      summary: "Normalization did not run because inspection failed.",
      warnings: [
        {
          code: "inspection_failed",
          message: input.errorMessage
        }
      ]
    });

    if (input.materialBlocker ?? true) {
      const [existing] = await tx<{ id: string }[]>`
        select id
        from review_items
        where source_item_id = ${input.sourceItemId}
          and type = 'unsupported_file'
          and status in ('open', 'in_progress')
        order by created_at desc
        limit 1
      `;

      if (!existing) {
        const reviewId = createId("review");

        await tx`
          insert into review_items (id, queue, type, status, source_item_id, payload_json)
          values (
            ${reviewId},
            'intake',
            'unsupported_file',
            'open',
            ${input.sourceItemId},
            ${JSON.stringify({
              blocker: "inspection_failure",
              errorMessage: input.errorMessage
            })}::jsonb
          )
        `;

        await insertEvent(tx, {
          actorId: input.actorId,
          eventType: "review_item_created",
          ingestionRunId: input.ingestionRunId,
          message: "Review item created for inspection failure",
          payload: {
            reviewItemId: reviewId
          },
          sourceItemId: input.sourceItemId,
          workflowRunId: input.workflowRunId
        });
      }
    }
  });
}

export async function markNormalizationStarted(input: {
  actorId: string;
  artifactBlobId: string;
  ingestionRunId: string;
  parserTarget: ArtifactParserTarget;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await tx`
      update ingestion_runs
      set stage = 'normalization', updated_at = now()
      where id = ${input.ingestionRunId}
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "normalization_started",
      ingestionRunId: input.ingestionRunId,
      message: "Normalized content creation started",
      payload: {
        parserTarget: input.parserTarget
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });

  await upsertNormalizationResult({
    artifactBlobId: input.artifactBlobId,
    contentKind: null,
    parserTarget: input.parserTarget,
    reasonCodes: ["normalization_in_progress"],
    reprocessRecommended: false,
    retryRecommended: false,
    sourceItemId: input.sourceItemId,
    status: "pending",
    summary: "Normalization is in progress.",
    warnings: []
  });
}

export async function recordNormalizedContent(input: {
  actorId: string;
  artifactBlobId: string;
  contentKind: "document" | "email" | "workbook";
  counts: Record<string, number>;
  ingestionRunId: string;
  parserTarget: ArtifactParserTarget;
  reasonCodes: string[];
  reprocessRecommended: boolean;
  retryRecommended: boolean;
  sourceItemId: string;
  status: Extract<ParserResultStatus, "completed" | "completed_with_warnings">;
  summary: string;
  warnings: ParserWarning[];
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "normalized_content_recorded",
      ingestionRunId: input.ingestionRunId,
      message: "Normalized content objects recorded",
      payload: {
        contentKind: input.contentKind,
        counts: input.counts
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "normalization_completed",
      ingestionRunId: input.ingestionRunId,
      message:
        input.status === "completed_with_warnings"
          ? "Normalized content creation completed with warnings"
          : "Normalized content creation completed",
      payload: {
        contentKind: input.contentKind,
        reasonCodes: input.reasonCodes,
        warnings: input.warnings
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });

  await upsertNormalizationResult({
    artifactBlobId: input.artifactBlobId,
    contentKind: input.contentKind,
    parserTarget: input.parserTarget,
    reasonCodes: input.reasonCodes,
    reprocessRecommended: input.reprocessRecommended,
    retryRecommended: input.retryRecommended,
    sourceItemId: input.sourceItemId,
    status: input.status,
    summary: input.summary,
    warnings: input.warnings
  });
}

export async function recordNormalizationSkipped(input: {
  actorId: string;
  artifactBlobId: string | null;
  contentKind: NormalizedContentKind | null;
  ingestionRunId: string;
  parserTarget: ArtifactParserTarget | null;
  reasonCodes: string[];
  reprocessRecommended: boolean;
  retryRecommended: boolean;
  status: Extract<ParserResultStatus, "deferred" | "skipped">;
  sourceItemId: string;
  summary: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "normalization_skipped",
      ingestionRunId: input.ingestionRunId,
      message:
        input.status === "deferred" ? "Normalized content creation deferred" : "Normalized content creation skipped",
      payload: {
        reasonCodes: input.reasonCodes,
        status: input.status
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });

  await upsertNormalizationResult({
    artifactBlobId: input.artifactBlobId,
    contentKind: input.contentKind,
    parserTarget: input.parserTarget,
    reasonCodes: input.reasonCodes,
    reprocessRecommended: input.reprocessRecommended,
    retryRecommended: input.retryRecommended,
    sourceItemId: input.sourceItemId,
    status: input.status,
    summary: input.summary,
    warnings: []
  });
}

export async function recordNormalizationFailure(input: {
  actorId: string;
  artifactBlobId: string | null;
  parserTarget: ArtifactParserTarget | null;
  errorMessage: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "normalization_failed",
      ingestionRunId: input.ingestionRunId,
      message: "Normalized content creation failed",
      payload: {
        errorMessage: input.errorMessage
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });

  await upsertNormalizationResult({
    artifactBlobId: input.artifactBlobId,
    contentKind: null,
    parserTarget: input.parserTarget,
    reasonCodes: ["normalization_failed"],
    reprocessRecommended: false,
    retryRecommended: true,
    sourceItemId: input.sourceItemId,
    status: "failed",
    summary: "Normalization failed.",
    warnings: [
      {
        code: "normalization_failed",
        message: input.errorMessage
      }
    ]
  });
}

export async function markAnchoringStarted(input: {
  actorId: string;
  contentKind: NormalizedContentKind;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await tx`
      update ingestion_runs
      set stage = 'anchoring', updated_at = now()
      where id = ${input.ingestionRunId}
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "anchoring_started",
      ingestionRunId: input.ingestionRunId,
      message: "Content-level provenance anchoring started",
      payload: {
        contentKind: input.contentKind
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function recordProvenanceAnchors(input: {
  actorId: string;
  counts: Record<string, number>;
  ingestionRunId: string;
  sourceItemId: string;
  totalCount: number;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "provenance_anchors_recorded",
      ingestionRunId: input.ingestionRunId,
      message: "Provenance anchors recorded",
      payload: {
        counts: input.counts,
        totalCount: input.totalCount
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "anchoring_completed",
      ingestionRunId: input.ingestionRunId,
      message: "Content-level provenance anchoring completed",
      payload: {
        totalCount: input.totalCount
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function recordAnchoringSkipped(input: {
  actorId: string;
  ingestionRunId: string;
  reasonCodes: string[];
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "anchoring_skipped",
      ingestionRunId: input.ingestionRunId,
      message: "Content-level provenance anchoring skipped",
      payload: {
        reasonCodes: input.reasonCodes
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function recordAnchoringFailure(input: {
  actorId: string;
  errorMessage: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "anchoring_failed",
      ingestionRunId: input.ingestionRunId,
      message: "Content-level provenance anchoring failed",
      payload: {
        errorMessage: input.errorMessage
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function markCandidateExtractionStarted(input: {
  actorId: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await tx`
      update ingestion_runs
      set stage = 'candidate_extraction', updated_at = now()
      where id = ${input.ingestionRunId}
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "candidate_extraction_started",
      ingestionRunId: input.ingestionRunId,
      message: "Evidence-backed candidate extraction started",
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function recordCandidateSignals(input: {
  actorId: string;
  candidateCount: number;
  countsByType: Record<string, number>;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "candidate_signals_recorded",
      ingestionRunId: input.ingestionRunId,
      message: "Evidence-backed candidate signals recorded",
      payload: {
        candidateCount: input.candidateCount,
        countsByType: input.countsByType
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "candidate_extraction_completed",
      ingestionRunId: input.ingestionRunId,
      message: "Evidence-backed candidate extraction completed",
      payload: {
        candidateCount: input.candidateCount
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function recordCandidateExtractionSkipped(input: {
  actorId: string;
  ingestionRunId: string;
  reasonCodes: string[];
  sourceItemId: string;
  summary: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "candidate_extraction_skipped",
      ingestionRunId: input.ingestionRunId,
      message: input.summary,
      payload: {
        reasonCodes: input.reasonCodes
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function recordCandidateExtractionFailure(input: {
  actorId: string;
  errorMessage: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "candidate_extraction_failed",
      ingestionRunId: input.ingestionRunId,
      message: "Evidence-backed candidate extraction failed",
      payload: {
        errorMessage: input.errorMessage
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function completeIngestion(input: CompleteIngestionInput): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    await tx`
      update source_items
      set
        status = 'completed',
        artifact_blob_id = ${input.artifactBlobId},
        content_type = coalesce(${input.contentType}, content_type),
        updated_at = now()
      where id = ${input.sourceItemId}
    `;

    await tx`
      update ingestion_runs
      set
        status = 'completed',
        stage = 'complete',
        completed_at = now(),
        updated_at = now()
      where id = ${input.ingestionRunId}
    `;

    await tx`
      update workflow_runs
      set
        status = 'completed',
        updated_at = now()
      where id = ${input.workflowRunId}
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "ingestion_completed",
      ingestionRunId: input.ingestionRunId,
      message: "Ingestion completed",
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function markIngestionImmutableStored(input: {
  actorId: string;
  artifactBlobId: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "artifact_promoted",
      ingestionRunId: input.ingestionRunId,
      message: "Immutable artifact stored",
      payload: {
        artifactBlobId: input.artifactBlobId
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function failIngestion(input: {
  actorId: string;
  errorMessage: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    await tx`
      update source_items
      set status = 'failed', updated_at = now()
      where id = ${input.sourceItemId}
    `;

    await tx`
      update ingestion_runs
      set
        status = 'failed',
        stage = 'failed',
        completed_at = now(),
        error_message = ${input.errorMessage},
        updated_at = now()
      where id = ${input.ingestionRunId}
    `;

    await tx`
      update workflow_runs
      set status = 'failed', updated_at = now()
      where id = ${input.workflowRunId}
    `;

    await insertEvent(tx, {
      actorId: input.actorId,
      eventType: "ingestion_failed",
      ingestionRunId: input.ingestionRunId,
      message: "Ingestion failed",
      payload: {
        errorMessage: input.errorMessage
      },
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });
  });
}

export async function listIntakeQueueItems(limit = 50): Promise<IntakeQueueItem[]> {
  const sql = getDb();
  const rows = await sql<
    {
      artifact_blob_id: string | null;
      artifact_sha256: string | null;
      content_type: string | null;
      created_at: Date;
      file_name: string;
      immutable_storage_key: string | null;
      ingestion_stage:
        | "anchoring"
        | "candidate_extraction"
        | "complete"
        | "failed"
        | "inspection"
        | "normalization"
        | "registered"
        | "immutable_storage";
      ingestion_status: "completed" | "failed" | "processing" | "queued";
      source_connection_kind: SourceConnectionKind;
      source_connection_name: string;
      source_uri: string;
      source_updated_at: Date;
      sourceitem_id: string;
      sourceitem_status: "completed" | "failed" | "processing" | "registered" | "staged";
      size_bytes: bigint | number | string;
      inspection_metadata_json: Record<string, unknown> | string | null;
      normalization_status: ParserResultStatus | null;
      workflow_status: "completed" | "failed" | "queued" | "running" | null;
    }[]
  >`
    select
      s.id as sourceitem_id,
      s.file_name,
      s.content_type,
      s.size_bytes,
      s.source_uri,
      s.status as sourceitem_status,
      s.created_at,
      s.updated_at as source_updated_at,
      sc.name as source_connection_name,
      sc.kind as source_connection_kind,
      ir.status as ingestion_status,
      ir.stage as ingestion_stage,
      wr.status as workflow_status,
      s.artifact_blob_id,
      ab.sha256 as artifact_sha256,
      ab.storage_key as immutable_storage_key,
      inspection.metadata_json as inspection_metadata_json,
      nr.status as normalization_status
    from source_items s
    join source_connections sc on sc.id = s.source_connection_id
    join lateral (
      select status, stage
      from ingestion_runs
      where source_item_id = s.id
      order by created_at desc
      limit 1
    ) ir on true
    left join lateral (
      select status
      from workflow_runs
      where source_item_id = s.id
      order by created_at desc
      limit 1
    ) wr on true
    left join artifact_blobs ab on ab.id = s.artifact_blob_id
    left join lateral (
      select metadata_json
      from derived_artifacts
      where artifact_blob_id = ab.id and kind = 'artifact_inspection'
      order by version desc, created_at desc
      limit 1
    ) inspection on true
    left join normalization_results nr on nr.source_item_id = s.id
    order by s.created_at desc
    limit ${limit}
  `;

  return rows.map((row) => {
    const inspection = summarizeInspection(
      row.inspection_metadata_json ? normalizePayload(row.inspection_metadata_json) : null
    );

    return {
      id: row.sourceitem_id,
      artifactBlobId: row.artifact_blob_id,
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: asNumber(row.size_bytes),
      sourceConnectionName: row.source_connection_name,
      sourceConnectionKind: row.source_connection_kind,
      sourceUri: row.source_uri,
      status: row.sourceitem_status,
      ingestionStatus: row.ingestion_status,
      ingestionStage: row.ingestion_stage,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.source_updated_at),
      workflowStatus: row.workflow_status,
      artifactSha256: row.artifact_sha256,
      immutableStorageKey: row.immutable_storage_key,
      supportTier: inspection.supportTier,
      parserTarget: inspection.parserTarget,
      inspectionStatus: inspection.inspectionStatus,
      normalizationStatus: row.normalization_status
    };
  });
}

export async function getIntakeQueueItem(sourceItemId: string): Promise<IntakeDetail | null> {
  const sql = getDb();
  const [item] = await sql<
    {
      artifact_blob_id: string | null;
      artifact_sha256: string | null;
      content_type: string | null;
      created_at: Date;
      file_name: string;
      immutable_storage_key: string | null;
      ingestion_stage:
        | "anchoring"
        | "candidate_extraction"
        | "complete"
        | "failed"
        | "inspection"
        | "normalization"
        | "registered"
        | "immutable_storage";
      ingestion_status: "completed" | "failed" | "processing" | "queued";
      source_connection_kind: SourceConnectionKind;
      source_connection_name: string;
      source_uri: string;
      source_updated_at: Date;
      sourceitem_id: string;
      sourceitem_status: "completed" | "failed" | "processing" | "registered" | "staged";
      size_bytes: bigint | number | string;
      inspection_metadata_json: Record<string, unknown> | string | null;
      workflow_status: "completed" | "failed" | "queued" | "running" | null;
    }[]
  >`
    select
      s.id as sourceitem_id,
      s.file_name,
      s.content_type,
      s.size_bytes,
      s.source_uri,
      s.status as sourceitem_status,
      s.created_at,
      s.updated_at as source_updated_at,
      sc.name as source_connection_name,
      sc.kind as source_connection_kind,
      ir.status as ingestion_status,
      ir.stage as ingestion_stage,
      wr.status as workflow_status,
      s.artifact_blob_id,
      ab.sha256 as artifact_sha256,
      ab.storage_key as immutable_storage_key,
      inspection.metadata_json as inspection_metadata_json
    from source_items s
    join source_connections sc on sc.id = s.source_connection_id
    join lateral (
      select status, stage
      from ingestion_runs
      where source_item_id = s.id
      order by created_at desc
      limit 1
    ) ir on true
    left join lateral (
      select status
      from workflow_runs
      where source_item_id = s.id
      order by created_at desc
      limit 1
    ) wr on true
    left join artifact_blobs ab on ab.id = s.artifact_blob_id
    left join lateral (
      select metadata_json
      from derived_artifacts
      where artifact_blob_id = ab.id and kind = 'artifact_inspection'
      order by version desc, created_at desc
      limit 1
    ) inspection on true
    where s.id = ${sourceItemId}
    limit 1
  `;

  if (!item) {
    return null;
  }

  const events = await sql<
    {
      created_at: Date;
      event_type: TimelineEvent["eventType"];
      id: string;
      message: string;
      payload_json: Record<string, unknown> | string;
    }[]
  >`
    select id, event_type, message, payload_json, created_at
    from intake_events
    where source_item_id = ${sourceItemId}
    order by created_at asc
  `;

  const timeline = events.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    message: event.message,
    createdAt: iso(event.created_at),
    payload: normalizePayload(event.payload_json)
  }));

  const derivedArtifacts = item.artifact_sha256
    ? await sql<
        {
          created_at: Date;
          id: string;
          kind: DerivedArtifactSummary["kind"];
          metadata_json: Record<string, unknown> | string;
          storage_key: string;
          version: number;
        }[]
      >`
        select id, kind, version, storage_key, metadata_json, created_at
        from derived_artifacts
        where artifact_blob_id = (
          select artifact_blob_id
          from source_items
          where id = ${sourceItemId}
        )
        order by created_at asc
      `
    : [];

  const inspection = summarizeInspection(
    item.inspection_metadata_json ? normalizePayload(item.inspection_metadata_json) : null
  );
  const normalizedContentRecords = item.artifact_blob_id
    ? await getNormalizedContentRecords(item.artifact_blob_id)
    : emptyNormalizedContentRecords();
  const normalizationResult =
    (await getNormalizationResultSummary(sourceItemId)) ??
    fallbackNormalizationResult({
      contentKind: normalizedContentRecords.contentKind,
      ingestionStatus: item.ingestion_status
    });
  const candidateExtractionResult =
    (item.artifact_blob_id ? await getCandidateExtractionSummary(item.artifact_blob_id) : null) ??
    fallbackCandidateExtractionResult({
      ingestionStatus: item.ingestion_status,
      normalizationStatus: normalizationResult.status
    });
  const provenanceAnchors = item.artifact_blob_id
    ? await getProvenanceAnchorsSummary(item.artifact_blob_id)
    : {
        totalCount: 0,
        groups: [],
        items: []
      };
  const candidateSignals = item.artifact_blob_id ? await getExtractedCandidates(item.artifact_blob_id) : [];

  return {
    id: item.sourceitem_id,
    artifactBlobId: item.artifact_blob_id,
    fileName: item.file_name,
    contentType: item.content_type,
    sizeBytes: asNumber(item.size_bytes),
    sourceConnectionName: item.source_connection_name,
    sourceConnectionKind: item.source_connection_kind,
    sourceUri: item.source_uri,
    status: item.sourceitem_status,
    ingestionStatus: item.ingestion_status,
    ingestionStage: item.ingestion_stage,
    createdAt: iso(item.created_at),
    updatedAt: iso(item.source_updated_at),
    workflowStatus: item.workflow_status,
    artifactSha256: item.artifact_sha256,
    immutableStorageKey: item.immutable_storage_key,
    supportTier: inspection.supportTier,
    parserTarget: inspection.parserTarget,
    inspectionStatus: inspection.inspectionStatus,
    normalizationStatus: normalizationResult.status,
    fileClassification: inspection.fileClassification,
    normalizedExtension: inspection.normalizedExtension,
    nativeTextPresent: inspection.nativeTextPresent,
    ocrNeededLater: inspection.ocrNeededLater,
    isContainer: inspection.isContainer,
    parserEligible: inspection.parserEligible,
    normalizationResult,
    candidateExtractionResult,
    normalizedContent: normalizedContentRecords,
    provenanceAnchors,
    candidateSignals,
    derivedArtifacts: derivedArtifacts.map(mapDerivedArtifact),
    timeline
  };
}

export function buildSourceUri(objectKey: string): string {
  return `s3://${requiredEnv("MINIO_BUCKET")}/${objectKey}`;
}
