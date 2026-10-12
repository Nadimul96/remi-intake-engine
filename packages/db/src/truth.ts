import type {
  AcceptedRecordSummary,
  AcceptedTruthFilter,
  AcceptedRecordType,
  AcceptedTruthBrowserResponse,
  AcceptedTruthDetail,
  AcceptedTruthListItem,
  CandidateReviewStatus,
  ReviewCandidateActionType,
  ReviewHistoryEntry
} from "@remi/domain";

import { getDb } from "./client";
import { getCandidateReviewDetail } from "./reviews";

interface JsonMap {
  [key: string]: unknown;
}

interface AcceptedRecordRow {
  accepted_record_type: AcceptedRecordType;
  accepted_value_json: unknown;
  artifact_blob_id: string;
  citation_packet_json: AcceptedRecordSummary["citationPacket"] | string;
  created_at: Date;
  field_name: string;
  id: string;
  metadata_json: JsonMap | string;
  provenance_anchor_ids_json: string[] | string;
  review_note: string | null;
  review_status: CandidateReviewStatus;
  reviewed_at: Date;
  reviewer_actor_id: string;
  reviewer_actor_name: string;
  source_candidate_id: string;
  source_semantic_object_id: string | null;
  source_semantic_object_type: string | null;
  updated_at: Date;
  value_type: string;
}

interface AcceptedTruthListRow {
  accepted_record_id: string;
  accepted_record_type: AcceptedRecordType;
  accepted_value_json: unknown;
  artifact_blob_id: string;
  artifact_file_name: string;
  content_type: string | null;
  created_at: Date;
  field_name: string;
  latest_review_action: ReviewCandidateActionType | null;
  latest_review_at: Date | null;
  provenance_anchor_count: number | string;
  source_candidate_current_extraction: boolean;
  source_candidate_id: string;
  source_candidate_review_status: CandidateReviewStatus;
  source_candidate_superseded_at: Date | null;
  updated_at: Date;
  value_type: string;
}

interface RelatedCandidateRow {
  candidate_value_json: unknown;
  confidence_score: number | string;
  created_at: Date;
  field_name: string;
  id: string;
  review_status: CandidateReviewStatus;
  updated_at: Date;
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

function mapAcceptedRecord(row: AcceptedRecordRow): AcceptedRecordSummary {
  return {
    id: row.id,
    acceptedRecordType: row.accepted_record_type,
    sourceCandidateId: row.source_candidate_id,
    artifactBlobId: row.artifact_blob_id,
    fieldName: row.field_name,
    valueType: row.value_type,
    acceptedValue: normalizeJsonValue(row.accepted_value_json),
    sourceSemanticObjectType: row.source_semantic_object_type,
    sourceSemanticObjectId: row.source_semantic_object_id,
    provenanceAnchorIds: normalizePayload<string[]>(row.provenance_anchor_ids_json),
    citationPacket: normalizePayload<AcceptedRecordSummary["citationPacket"]>(row.citation_packet_json),
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewerActorId: row.reviewer_actor_id,
    reviewerActorName: row.reviewer_actor_name,
    reviewedAt: iso(row.reviewed_at) ?? "",
    metadata: normalizePayload<JsonMap>(row.metadata_json),
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function mapAcceptedTruthListItem(row: AcceptedTruthListRow): AcceptedTruthListItem {
  return {
    acceptedRecordId: row.accepted_record_id,
    acceptedRecordType: row.accepted_record_type,
    fieldName: row.field_name,
    valueType: row.value_type,
    acceptedValue: normalizeJsonValue(row.accepted_value_json),
    artifactBlobId: row.artifact_blob_id,
    artifactFileName: row.artifact_file_name,
    contentType: row.content_type,
    sourceCandidateId: row.source_candidate_id,
    sourceCandidateReviewStatus: row.source_candidate_review_status,
    sourceCandidateCurrentExtraction: row.source_candidate_current_extraction,
    sourceCandidateSupersededAt: iso(row.source_candidate_superseded_at),
    latestReviewAction: row.latest_review_action,
    latestReviewAt: iso(row.latest_review_at),
    provenanceAnchorCount:
      typeof row.provenance_anchor_count === "number" ? row.provenance_anchor_count : Number(row.provenance_anchor_count),
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function mapRelatedCandidate(row: RelatedCandidateRow) {
  return {
    id: row.id,
    fieldName: row.field_name,
    candidateValue: normalizeJsonValue(row.candidate_value_json),
    reviewStatus: row.review_status,
    confidence: typeof row.confidence_score === "number" ? row.confidence_score : Number(row.confidence_score),
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

async function loadAcceptedRecord(
  acceptedRecordType: AcceptedRecordType,
  acceptedRecordId: string
): Promise<AcceptedRecordSummary | null> {
  const sql = getDb();

  switch (acceptedRecordType) {
    case "fact": {
      const [row] = await sql<AcceptedRecordRow[]>`
        select
          id,
          'fact'::text as accepted_record_type,
          source_candidate_id,
          artifact_blob_id,
          field_name,
          value_type,
          accepted_value_json,
          source_semantic_object_type,
          source_semantic_object_id,
          provenance_anchor_ids_json,
          citation_packet_json,
          review_status,
          reviewer_actor_id,
          reviewer_actor_name,
          reviewed_at,
          review_note,
          metadata_json,
          created_at,
          updated_at
        from accepted_fact_records
        where id = ${acceptedRecordId}
        limit 1
      `;
      return row ? mapAcceptedRecord(row) : null;
    }
    case "relationship": {
      const [row] = await sql<AcceptedRecordRow[]>`
        select
          id,
          'relationship'::text as accepted_record_type,
          source_candidate_id,
          artifact_blob_id,
          field_name,
          value_type,
          accepted_value_json,
          source_semantic_object_type,
          source_semantic_object_id,
          provenance_anchor_ids_json,
          citation_packet_json,
          review_status,
          reviewer_actor_id,
          reviewer_actor_name,
          reviewed_at,
          review_note,
          metadata_json,
          created_at,
          updated_at
        from accepted_relationship_records
        where id = ${acceptedRecordId}
        limit 1
      `;
      return row ? mapAcceptedRecord(row) : null;
    }
    case "classification": {
      const [row] = await sql<AcceptedRecordRow[]>`
        select
          id,
          'classification'::text as accepted_record_type,
          source_candidate_id,
          artifact_blob_id,
          field_name,
          value_type,
          accepted_value_json,
          source_semantic_object_type,
          source_semantic_object_id,
          provenance_anchor_ids_json,
          citation_packet_json,
          review_status,
          reviewer_actor_id,
          reviewer_actor_name,
          reviewed_at,
          review_note,
          metadata_json,
          created_at,
          updated_at
        from accepted_classification_records
        where id = ${acceptedRecordId}
        limit 1
      `;
      return row ? mapAcceptedRecord(row) : null;
    }
  }
}

export async function listAcceptedTruthRecords(filter: AcceptedTruthFilter = "all"): Promise<AcceptedTruthBrowserResponse> {
  const sql = getDb();
  const rows = await sql<AcceptedTruthListRow[]>`
    select
      records.accepted_record_id,
      records.accepted_record_type,
      records.field_name,
      records.value_type,
      records.accepted_value_json,
      records.artifact_blob_id,
      ab.original_file_name as artifact_file_name,
      ab.content_type,
      records.source_candidate_id,
      ec.review_status as source_candidate_review_status,
      ec.current_extraction as source_candidate_current_extraction,
      ec.superseded_at as source_candidate_superseded_at,
      latest.action as latest_review_action,
      latest.created_at as latest_review_at,
      records.provenance_anchor_count,
      records.created_at,
      records.updated_at
    from (
      select
        id as accepted_record_id,
        'fact'::text as accepted_record_type,
        source_candidate_id,
        artifact_blob_id,
        field_name,
        value_type,
        accepted_value_json,
        case
          when jsonb_typeof(provenance_anchor_ids_json) = 'array' then jsonb_array_length(provenance_anchor_ids_json)
          else 0
        end as provenance_anchor_count,
        created_at,
        updated_at
      from accepted_fact_records
      union all
      select
        id as accepted_record_id,
        'relationship'::text as accepted_record_type,
        source_candidate_id,
        artifact_blob_id,
        field_name,
        value_type,
        accepted_value_json,
        case
          when jsonb_typeof(provenance_anchor_ids_json) = 'array' then jsonb_array_length(provenance_anchor_ids_json)
          else 0
        end as provenance_anchor_count,
        created_at,
        updated_at
      from accepted_relationship_records
      union all
      select
        id as accepted_record_id,
        'classification'::text as accepted_record_type,
        source_candidate_id,
        artifact_blob_id,
        field_name,
        value_type,
        accepted_value_json,
        case
          when jsonb_typeof(provenance_anchor_ids_json) = 'array' then jsonb_array_length(provenance_anchor_ids_json)
          else 0
        end as provenance_anchor_count,
        created_at,
        updated_at
      from accepted_classification_records
    ) records
    join extracted_candidates ec on ec.id = records.source_candidate_id
    join artifact_blobs ab on ab.id = records.artifact_blob_id
    left join lateral (
      select action, created_at
      from candidate_review_history
      where candidate_id = records.source_candidate_id
      order by created_at desc
      limit 1
    ) latest on true
    order by records.updated_at desc
  `;

  const items = rows.map(mapAcceptedTruthListItem);

  const counts = {
    all: items.length,
    fact: items.filter((item) => item.acceptedRecordType === "fact").length,
    relationship: items.filter((item) => item.acceptedRecordType === "relationship").length,
    classification: items.filter((item) => item.acceptedRecordType === "classification").length
  };

  return {
    counts,
    items: filter === "all" ? items : items.filter((item) => item.acceptedRecordType === filter)
  };
}

export async function getAcceptedTruthDetail(input: {
  acceptedRecordId: string;
  acceptedRecordType: AcceptedRecordType;
}): Promise<AcceptedTruthDetail | null> {
  const acceptedRecord = await loadAcceptedRecord(input.acceptedRecordType, input.acceptedRecordId);
  if (!acceptedRecord) {
    return null;
  }

  const candidateReviewDetail = await getCandidateReviewDetail(acceptedRecord.sourceCandidateId);
  if (!candidateReviewDetail) {
    return null;
  }

  const sql = getDb();
  const relatedRows = await sql<RelatedCandidateRow[]>`
    select
      id,
      field_name,
      candidate_value_json,
      review_status,
      confidence_score,
      created_at,
      updated_at
    from extracted_candidates
    where artifact_blob_id = ${candidateReviewDetail.candidate.artifactBlobId}
      and field_name = ${candidateReviewDetail.candidate.fieldName}
      and current_extraction = true
      and id <> ${candidateReviewDetail.candidate.id}
      and updated_at > ${candidateReviewDetail.candidate.updatedAt}::timestamptz
    order by updated_at desc, confidence_score desc
  `;

  return {
    acceptedRecord,
    artifact: candidateReviewDetail.artifact,
    sourceCandidate: candidateReviewDetail.candidate,
    provenanceAnchors: candidateReviewDetail.provenanceAnchors,
    reviewHistory: candidateReviewDetail.reviewHistory as ReviewHistoryEntry[],
    lineage: {
      sourceCandidateId: candidateReviewDetail.candidate.id,
      sourceCandidateCurrentExtraction: candidateReviewDetail.candidate.currentExtraction,
      sourceCandidateSupersededAt: candidateReviewDetail.candidate.supersededAt,
      newerCandidates: relatedRows.map(mapRelatedCandidate)
    }
  };
}
