import type {
  AcceptedRecordType,
  CandidateCitationPacket,
  CandidateExtractionMethod,
  CandidateExtractionResult,
  CandidateReviewStatus,
  ExtractedCandidateSummary,
  ExtractedCandidateType,
  ParserResultStatus,
  ParserWarning
} from "@remi/domain";
import { createId } from "@remi/domain";
import type postgres from "postgres";

import { getDb } from "./client";

type DbTransaction = postgres.Sql;

interface JsonMap {
  [key: string]: unknown;
}

interface CandidateRow {
  accepted_record_id: string | null;
  accepted_record_type: AcceptedRecordType | null;
  artifact_blob_id: string;
  candidate_type: ExtractedCandidateType;
  candidate_value_json: unknown;
  citation_packet_json: CandidateCitationPacket | string;
  confidence_score: number | string;
  created_at: Date;
  current_extraction: boolean;
  extraction_method: CandidateExtractionMethod;
  extraction_method_detail: string;
  field_name: string;
  id: string;
  metadata_json: JsonMap | string;
  review_note: string | null;
  review_ready: boolean;
  review_status: CandidateReviewStatus;
  reviewed_at: Date | null;
  reviewed_by_actor_id: string | null;
  reviewed_by_actor_name: string | null;
  reviewed_value_json: unknown | null;
  source_semantic_object_id: string | null;
  source_semantic_object_type: string | null;
  summary: string;
  superseded_at: Date | null;
  updated_at: Date;
  value_type: string;
}

export interface PersistExtractedCandidateInput {
  artifactBlobId: string;
  candidateKey: string;
  candidateType: ExtractedCandidateType;
  citationPacket: CandidateCitationPacket;
  confidence: number;
  extractionMethod: CandidateExtractionMethod;
  extractionMethodDetail: string;
  fieldName: string;
  metadata?: JsonMap;
  reviewReady: boolean;
  sourceSemanticObjectId: string | null;
  sourceSemanticObjectType: string | null;
  summary: string;
  tenantId: string;
  valueType: string;
  candidateValue: unknown;
}

export interface UpsertCandidateExtractionStateInput {
  artifactBlobId: string;
  candidateCount: number;
  metadata?: JsonMap;
  reasonCodes: string[];
  reprocessRecommended: boolean;
  retryRecommended: boolean;
  status: ParserResultStatus;
  summary: string;
  warnings: ParserWarning[];
}

function normalizePayload<T>(value: T | string): T {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

function normalizeJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapCandidate(row: CandidateRow): ExtractedCandidateSummary {
  return {
    id: row.id,
    artifactBlobId: row.artifact_blob_id,
    candidateType: row.candidate_type,
    fieldName: row.field_name,
    valueType: row.value_type,
    candidateValue: normalizeJsonValue(row.candidate_value_json),
    confidence: typeof row.confidence_score === "number" ? row.confidence_score : Number(row.confidence_score),
    extractionMethod: row.extraction_method,
    extractionMethodDetail: row.extraction_method_detail,
    summary: row.summary,
    sourceSemanticObjectType: row.source_semantic_object_type,
    sourceSemanticObjectId: row.source_semantic_object_id,
    reviewReady: row.review_ready,
    reviewStatus: row.review_status,
    reviewedValue: normalizeJsonValue(row.reviewed_value_json),
    reviewNote: row.review_note,
    reviewedAt: iso(row.reviewed_at),
    reviewedByActorId: row.reviewed_by_actor_id,
    reviewedByActorName: row.reviewed_by_actor_name,
    acceptedRecordType: row.accepted_record_type,
    acceptedRecordId: row.accepted_record_id,
    currentExtraction: row.current_extraction,
    supersededAt: iso(row.superseded_at),
    citationPacket: normalizePayload<CandidateCitationPacket>(row.citation_packet_json),
    metadata: normalizePayload<JsonMap>(row.metadata_json),
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function mapCandidateExtractionState(row: {
  candidate_count: number | string;
  reason_codes_json: string[] | string;
  reprocess_recommended: boolean;
  retry_recommended: boolean;
  status: ParserResultStatus;
  summary: string;
  updated_at: Date;
  warnings_json: ParserWarning[] | string;
}): CandidateExtractionResult {
  return {
    status: row.status,
    summary: row.summary,
    reasonCodes: normalizePayload<string[]>(row.reason_codes_json),
    warnings: normalizePayload<ParserWarning[]>(row.warnings_json),
    retryRecommended: row.retry_recommended,
    reprocessRecommended: row.reprocess_recommended,
    candidateCount: typeof row.candidate_count === "number" ? row.candidate_count : Number(row.candidate_count),
    lastUpdatedAt: iso(row.updated_at)
  };
}

export async function replaceExtractedCandidates(input: {
  artifactBlobId: string;
  candidates: PersistExtractedCandidateInput[];
  tenantId: string;
}): Promise<ExtractedCandidateSummary[]> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    const retainedKeys = new Set<string>();

    for (const candidate of input.candidates) {
      retainedKeys.add(candidate.candidateKey);

      await tx`
        insert into extracted_candidates (
          id,
          tenant_id,
          artifact_blob_id,
          candidate_key,
          candidate_type,
          field_name,
          value_type,
          candidate_value_json,
          confidence_score,
          extraction_method,
          extraction_method_detail,
          source_semantic_object_type,
          source_semantic_object_id,
          summary,
          review_ready,
          citation_packet_json,
          metadata_json,
          current_extraction,
          superseded_at
        ) values (
          ${createId("candidate")},
          ${candidate.tenantId},
          ${candidate.artifactBlobId},
          ${candidate.candidateKey},
          ${candidate.candidateType},
          ${candidate.fieldName},
          ${candidate.valueType},
          ${JSON.stringify(candidate.candidateValue)}::jsonb,
          ${candidate.confidence},
          ${candidate.extractionMethod},
          ${candidate.extractionMethodDetail},
          ${candidate.sourceSemanticObjectType},
          ${candidate.sourceSemanticObjectId},
          ${candidate.summary},
          ${candidate.reviewReady},
          ${JSON.stringify(candidate.citationPacket)}::jsonb,
          ${JSON.stringify(candidate.metadata ?? {})}::jsonb,
          true,
          null
        )
        on conflict (artifact_blob_id, candidate_key)
        do update set
          tenant_id = excluded.tenant_id,
          candidate_type = excluded.candidate_type,
          field_name = excluded.field_name,
          value_type = excluded.value_type,
          candidate_value_json = excluded.candidate_value_json,
          confidence_score = excluded.confidence_score,
          extraction_method = excluded.extraction_method,
          extraction_method_detail = excluded.extraction_method_detail,
          source_semantic_object_type = excluded.source_semantic_object_type,
          source_semantic_object_id = excluded.source_semantic_object_id,
          summary = excluded.summary,
          review_ready = excluded.review_ready,
          citation_packet_json = excluded.citation_packet_json,
          metadata_json = excluded.metadata_json,
          current_extraction = true,
          superseded_at = null,
          updated_at = now()
      `;
    }

    if (retainedKeys.size === 0) {
      await tx`
        update extracted_candidates
        set
          current_extraction = false,
          superseded_at = coalesce(superseded_at, now()),
          updated_at = now()
        where artifact_blob_id = ${input.artifactBlobId}
          and current_extraction = true
      `;
    } else {
      await tx`
        update extracted_candidates
        set
          current_extraction = false,
          superseded_at = coalesce(superseded_at, now()),
          updated_at = now()
        where artifact_blob_id = ${input.artifactBlobId}
          and current_extraction = true
          and candidate_key not in ${tx([...retainedKeys])}
      `;
    }
  });

  return getExtractedCandidates(input.artifactBlobId);
}

export async function upsertCandidateExtractionState(
  input: UpsertCandidateExtractionStateInput
): Promise<CandidateExtractionResult> {
  const sql = getDb();
  const [row] = await sql<
    {
      candidate_count: number | string;
      reason_codes_json: string[] | string;
      reprocess_recommended: boolean;
      retry_recommended: boolean;
      status: ParserResultStatus;
      summary: string;
      updated_at: Date;
      warnings_json: ParserWarning[] | string;
    }[]
  >`
    insert into candidate_extraction_states (
      id,
      artifact_blob_id,
      status,
      summary,
      candidate_count,
      reason_codes_json,
      warnings_json,
      retry_recommended,
      reprocess_recommended,
      metadata_json
    ) values (
      ${createId("candextract")},
      ${input.artifactBlobId},
      ${input.status},
      ${input.summary},
      ${input.candidateCount},
      ${JSON.stringify(input.reasonCodes)}::jsonb,
      ${JSON.stringify(input.warnings)}::jsonb,
      ${input.retryRecommended},
      ${input.reprocessRecommended},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    on conflict (artifact_blob_id)
    do update set
      status = excluded.status,
      summary = excluded.summary,
      candidate_count = excluded.candidate_count,
      reason_codes_json = excluded.reason_codes_json,
      warnings_json = excluded.warnings_json,
      retry_recommended = excluded.retry_recommended,
      reprocess_recommended = excluded.reprocess_recommended,
      metadata_json = excluded.metadata_json,
      updated_at = now()
    returning status, summary, candidate_count, reason_codes_json, warnings_json, retry_recommended, reprocess_recommended, updated_at
  `;

  return mapCandidateExtractionState(row);
}

export async function getCandidateExtractionSummary(artifactBlobId: string): Promise<CandidateExtractionResult | null> {
  const sql = getDb();
  const [row] = await sql<
    {
      candidate_count: number | string;
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
      candidate_count,
      reason_codes_json,
      warnings_json,
      retry_recommended,
      reprocess_recommended,
      updated_at
    from candidate_extraction_states
    where artifact_blob_id = ${artifactBlobId}
    limit 1
  `;

  return row ? mapCandidateExtractionState(row) : null;
}

export async function getExtractedCandidate(
  candidateId: string,
  options?: { includeSuperseded?: boolean }
): Promise<ExtractedCandidateSummary | null> {
  const sql = getDb();
  const includeSuperseded = options?.includeSuperseded ?? false;

  const [row] = includeSuperseded
    ? await sql<CandidateRow[]>`
        select
          id,
          artifact_blob_id,
          candidate_type,
          field_name,
          value_type,
          candidate_value_json,
          confidence_score,
          extraction_method,
          extraction_method_detail,
          source_semantic_object_type,
          source_semantic_object_id,
          summary,
          review_ready,
          review_status,
          reviewed_value_json,
          review_note,
          reviewed_at,
          reviewed_by_actor_id,
          reviewed_by_actor_name,
          accepted_record_type,
          accepted_record_id,
          current_extraction,
          superseded_at,
          citation_packet_json,
          metadata_json,
          created_at,
          updated_at
        from extracted_candidates
        where id = ${candidateId}
        limit 1
      `
    : await sql<CandidateRow[]>`
        select
          id,
          artifact_blob_id,
          candidate_type,
          field_name,
          value_type,
          candidate_value_json,
          confidence_score,
          extraction_method,
          extraction_method_detail,
          source_semantic_object_type,
          source_semantic_object_id,
          summary,
          review_ready,
          review_status,
          reviewed_value_json,
          review_note,
          reviewed_at,
          reviewed_by_actor_id,
          reviewed_by_actor_name,
          accepted_record_type,
          accepted_record_id,
          current_extraction,
          superseded_at,
          citation_packet_json,
          metadata_json,
          created_at,
          updated_at
        from extracted_candidates
        where id = ${candidateId}
          and current_extraction = true
        limit 1
      `;

  return row ? mapCandidate(row) : null;
}

export async function getExtractedCandidates(
  artifactBlobId: string,
  options?: { includeSuperseded?: boolean }
): Promise<ExtractedCandidateSummary[]> {
  const sql = getDb();
  const includeSuperseded = options?.includeSuperseded ?? false;

  const rows = includeSuperseded
    ? await sql<CandidateRow[]>`
        select
          id,
          artifact_blob_id,
          candidate_type,
          field_name,
          value_type,
          candidate_value_json,
          confidence_score,
          extraction_method,
          extraction_method_detail,
          source_semantic_object_type,
          source_semantic_object_id,
          summary,
          review_ready,
          review_status,
          reviewed_value_json,
          review_note,
          reviewed_at,
          reviewed_by_actor_id,
          reviewed_by_actor_name,
          accepted_record_type,
          accepted_record_id,
          current_extraction,
          superseded_at,
          citation_packet_json,
          metadata_json,
          created_at,
          updated_at
        from extracted_candidates
        where artifact_blob_id = ${artifactBlobId}
        order by
          case review_status
            when 'pending_review' then 0
            when 'edited_and_accepted' then 1
            when 'accepted' then 2
            when 'rejected' then 3
            else 4
          end asc,
          current_extraction desc,
          confidence_score desc,
          candidate_type asc,
          created_at asc
      `
    : await sql<CandidateRow[]>`
        select
          id,
          artifact_blob_id,
          candidate_type,
          field_name,
          value_type,
          candidate_value_json,
          confidence_score,
          extraction_method,
          extraction_method_detail,
          source_semantic_object_type,
          source_semantic_object_id,
          summary,
          review_ready,
          review_status,
          reviewed_value_json,
          review_note,
          reviewed_at,
          reviewed_by_actor_id,
          reviewed_by_actor_name,
          accepted_record_type,
          accepted_record_id,
          current_extraction,
          superseded_at,
          citation_packet_json,
          metadata_json,
          created_at,
          updated_at
        from extracted_candidates
        where artifact_blob_id = ${artifactBlobId}
          and current_extraction = true
        order by
          case review_status
            when 'pending_review' then 0
            when 'edited_and_accepted' then 1
            when 'accepted' then 2
            when 'rejected' then 3
            else 4
          end asc,
          confidence_score desc,
          candidate_type asc,
          created_at asc
      `;

  return rows.map(mapCandidate);
}
