import type {
  AcceptedRecordSummary,
  AcceptedRecordType,
  CandidateCitationPacket,
  CandidateReviewDetail,
  CandidateReviewQueueItem,
  CandidateReviewQueueResponse,
  CandidateReviewStatus,
  ExtractedCandidateSummary,
  ExtractedCandidateType,
  RemiIdPrefix,
  ReviewCandidateActionType,
  ReviewHistoryEntry
} from "@remi/domain";
import { createId } from "@remi/domain";
import type postgres from "postgres";

import { getExtractedCandidate } from "./candidates";
import { getDb } from "./client";

type DbTransaction = postgres.Sql;

interface JsonMap {
  [key: string]: unknown;
}

interface AcceptedRecordRow {
  accepted_value_json: unknown;
  artifact_blob_id: string;
  citation_packet_json: CandidateCitationPacket | string;
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

interface ArtifactRow {
  content_type: string | null;
  id: string;
  original_file_name: string;
  sha256: string;
  size_bytes: bigint | number | string;
  source_item_file_name: string | null;
  source_item_id: string | null;
  source_uri: string | null;
}

interface QueueRow {
  accepted_record_id: string | null;
  accepted_record_type: AcceptedRecordType | null;
  artifact_blob_id: string;
  artifact_file_name: string;
  candidate_type: ExtractedCandidateType;
  candidate_value_json: unknown;
  confidence_score: number | string;
  content_type: string | null;
  created_at: Date;
  current_extraction: boolean;
  extraction_method: ExtractedCandidateSummary["extractionMethod"];
  extraction_method_detail: string;
  field_name: string;
  id: string;
  review_status: CandidateReviewStatus;
  reviewed_at: Date | null;
  reviewed_by_actor_name: string | null;
  source_item_file_name: string | null;
  source_item_id: string | null;
  source_uri: string | null;
  summary: string;
  updated_at: Date;
  value_type: string;
}

interface ReviewMutationRow {
  accepted_record_id: string | null;
  accepted_record_type: AcceptedRecordType | null;
  artifact_blob_id: string;
  candidate_type: ExtractedCandidateType;
  candidate_value_json: unknown;
  citation_packet_json: CandidateCitationPacket | string;
  current_extraction: boolean;
  field_name: string;
  id: string;
  review_ready: boolean;
  review_status: CandidateReviewStatus;
  source_semantic_object_id: string | null;
  source_semantic_object_type: string | null;
  tenant_id: string;
  value_type: string;
}

interface ReviewHistoryRow {
  action: ReviewCandidateActionType;
  artifact_blob_id: string;
  candidate_id: string;
  created_at: Date;
  edited_value_json: unknown | null;
  id: string;
  new_review_status: CandidateReviewStatus;
  previous_review_status: CandidateReviewStatus;
  review_note: string | null;
  reviewer_actor_id: string;
  reviewer_actor_name: string;
}

interface ProvenanceAnchorRow {
  anchor_key: string;
  anchor_kind: string;
  id: string;
  locator_json: JsonMap | string;
  metadata_json: JsonMap | string;
  owner_id: string;
  owner_type: string;
  summary: string;
  title: string;
}

type ReviewProvenanceAnchor = CandidateReviewDetail["provenanceAnchors"][number];

export class CandidateReviewNotFoundError extends Error {
  constructor(candidateId: string) {
    super(`Candidate ${candidateId} was not found.`);
    this.name = "CandidateReviewNotFoundError";
  }
}

export class CandidateReviewConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateReviewConflictError";
  }
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

function normalizeReviewNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function asNumber(value: bigint | number | string): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return Number(value);
}

function acceptedRecordTypeForCandidateType(candidateType: ExtractedCandidateType): AcceptedRecordType {
  switch (candidateType) {
    case "metric_fact_candidate":
      return "fact";
    case "relationship_assertion_candidate":
      return "relationship";
    case "classification_candidate":
      return "classification";
  }
}

function acceptedRecordPrefix(type: AcceptedRecordType): RemiIdPrefix {
  switch (type) {
    case "fact":
      return "accfact";
    case "relationship":
      return "accrel";
    case "classification":
      return "accclass";
  }
}

function mapQueueItem(row: QueueRow): CandidateReviewQueueItem {
  return {
    candidateId: row.id,
    artifactBlobId: row.artifact_blob_id,
    artifactFileName: row.artifact_file_name,
    contentType: row.content_type,
    candidateType: row.candidate_type,
    fieldName: row.field_name,
    valueType: row.value_type,
    candidateValue: normalizeJsonValue(row.candidate_value_json),
    confidence: typeof row.confidence_score === "number" ? row.confidence_score : Number(row.confidence_score),
    extractionMethod: row.extraction_method,
    extractionMethodDetail: row.extraction_method_detail,
    summary: row.summary,
    reviewStatus: row.review_status,
    reviewedAt: iso(row.reviewed_at),
    reviewedByActorName: row.reviewed_by_actor_name,
    acceptedRecordType: row.accepted_record_type,
    acceptedRecordId: row.accepted_record_id,
    currentExtraction: row.current_extraction,
    sourceItemId: row.source_item_id,
    sourceItemFileName: row.source_item_file_name,
    sourceUri: row.source_uri,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function mapAcceptedRecord(type: AcceptedRecordType, row: AcceptedRecordRow): AcceptedRecordSummary {
  return {
    id: row.id,
    acceptedRecordType: type,
    sourceCandidateId: row.source_candidate_id,
    artifactBlobId: row.artifact_blob_id,
    fieldName: row.field_name,
    valueType: row.value_type,
    acceptedValue: normalizeJsonValue(row.accepted_value_json),
    sourceSemanticObjectType: row.source_semantic_object_type,
    sourceSemanticObjectId: row.source_semantic_object_id,
    provenanceAnchorIds: normalizePayload<string[]>(row.provenance_anchor_ids_json),
    citationPacket: normalizePayload<CandidateCitationPacket>(row.citation_packet_json),
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

function mapReviewHistoryEntry(row: ReviewHistoryRow): ReviewHistoryEntry {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    artifactBlobId: row.artifact_blob_id,
    previousReviewStatus: row.previous_review_status,
    newReviewStatus: row.new_review_status,
    action: row.action,
    reviewNote: row.review_note,
    editedValue: normalizeJsonValue(row.edited_value_json),
    reviewerActorId: row.reviewer_actor_id,
    reviewerActorName: row.reviewer_actor_name,
    createdAt: iso(row.created_at) ?? ""
  };
}

async function getArtifactSummary(artifactBlobId: string): Promise<CandidateReviewDetail["artifact"] | null> {
  const sql = getDb();
  const [row] = await sql<ArtifactRow[]>`
    select
      ab.id,
      ab.original_file_name,
      ab.content_type,
      ab.size_bytes,
      ab.sha256,
      source_item.id as source_item_id,
      source_item.file_name as source_item_file_name,
      source_item.source_uri
    from artifact_blobs ab
    left join lateral (
      select id, file_name, source_uri
      from source_items
      where artifact_blob_id = ab.id
      order by created_at asc
      limit 1
    ) source_item on true
    where ab.id = ${artifactBlobId}
    limit 1
  `;

  if (!row) {
    return null;
  }

  return {
    artifactBlobId: row.id,
    originalFileName: row.original_file_name,
    contentType: row.content_type,
    sizeBytes: asNumber(row.size_bytes),
    sha256: row.sha256,
    sourceItemId: row.source_item_id,
    sourceItemFileName: row.source_item_file_name,
    sourceUri: row.source_uri
  };
}

async function loadAcceptedRecord(
  candidate: Pick<ExtractedCandidateSummary, "acceptedRecordType" | "id">
): Promise<AcceptedRecordSummary | null> {
  const sql = getDb();

  if (!candidate.acceptedRecordType) {
    return null;
  }

  switch (candidate.acceptedRecordType) {
    case "fact": {
      const [row] = await sql<AcceptedRecordRow[]>`
        select *
        from accepted_fact_records
        where source_candidate_id = ${candidate.id}
        limit 1
      `;
      return row ? mapAcceptedRecord("fact", row) : null;
    }
    case "relationship": {
      const [row] = await sql<AcceptedRecordRow[]>`
        select *
        from accepted_relationship_records
        where source_candidate_id = ${candidate.id}
        limit 1
      `;
      return row ? mapAcceptedRecord("relationship", row) : null;
    }
    case "classification": {
      const [row] = await sql<AcceptedRecordRow[]>`
        select *
        from accepted_classification_records
        where source_candidate_id = ${candidate.id}
        limit 1
      `;
      return row ? mapAcceptedRecord("classification", row) : null;
    }
  }
}

async function loadAcceptedRecordTx(
  tx: DbTransaction,
  candidateId: string,
  acceptedRecordType: AcceptedRecordType
): Promise<AcceptedRecordSummary | null> {
  switch (acceptedRecordType) {
    case "fact": {
      const [row] = await tx<AcceptedRecordRow[]>`
        select *
        from accepted_fact_records
        where source_candidate_id = ${candidateId}
        limit 1
      `;
      return row ? mapAcceptedRecord("fact", row) : null;
    }
    case "relationship": {
      const [row] = await tx<AcceptedRecordRow[]>`
        select *
        from accepted_relationship_records
        where source_candidate_id = ${candidateId}
        limit 1
      `;
      return row ? mapAcceptedRecord("relationship", row) : null;
    }
    case "classification": {
      const [row] = await tx<AcceptedRecordRow[]>`
        select *
        from accepted_classification_records
        where source_candidate_id = ${candidateId}
        limit 1
      `;
      return row ? mapAcceptedRecord("classification", row) : null;
    }
  }
}

async function loadProvenanceAnchors(anchorIds: string[]) {
  if (anchorIds.length === 0) {
    return [];
  }

  const sql = getDb();
  const rows = await sql<ProvenanceAnchorRow[]>`
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
    where id in ${sql(anchorIds)}
  `;

  const byId = new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        anchorKind: row.anchor_kind,
        anchorKey: row.anchor_key,
        title: row.title,
        summary: row.summary,
        locator: normalizePayload<JsonMap>(row.locator_json),
        metadata: normalizePayload<JsonMap>(row.metadata_json)
      } satisfies ReviewProvenanceAnchor
    ])
  );

  return anchorIds
    .map((anchorId) => byId.get(anchorId))
    .filter((value): value is ReviewProvenanceAnchor => Boolean(value));
}

async function insertReviewHistoryTx(input: {
  action: ReviewCandidateActionType;
  actorId: string;
  actorName: string;
  artifactBlobId: string;
  candidateId: string;
  editedValue?: unknown;
  newReviewStatus: CandidateReviewStatus;
  previousReviewStatus: CandidateReviewStatus;
  reviewNote: string | null;
  tx: DbTransaction;
}): Promise<void> {
  await input.tx`
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
      reviewer_actor_name
    ) values (
      ${createId("review")},
      ${input.candidateId},
      ${input.artifactBlobId},
      ${input.previousReviewStatus},
      ${input.newReviewStatus},
      ${input.action},
      ${input.reviewNote},
      ${input.editedValue === undefined ? null : JSON.stringify(input.editedValue)}::jsonb,
      ${input.actorId},
      ${input.actorName}
    )
  `;
}

async function deleteAcceptedRecordTx(
  tx: DbTransaction,
  candidateId: string,
  acceptedRecordType: AcceptedRecordType
): Promise<void> {
  switch (acceptedRecordType) {
    case "fact":
      await tx`
        delete from accepted_fact_records
        where source_candidate_id = ${candidateId}
      `;
      return;
    case "relationship":
      await tx`
        delete from accepted_relationship_records
        where source_candidate_id = ${candidateId}
      `;
      return;
    case "classification":
      await tx`
        delete from accepted_classification_records
        where source_candidate_id = ${candidateId}
      `;
      return;
  }
}

async function upsertAcceptedRecordTx(input: {
  acceptedRecordType: AcceptedRecordType;
  actorId: string;
  actorName: string;
  acceptedValue: unknown;
  candidate: ReviewMutationRow;
  citationPacket: CandidateCitationPacket;
  note: string | null;
  reviewStatus: CandidateReviewStatus;
  tx: DbTransaction;
}): Promise<AcceptedRecordSummary> {
  const metadata =
    input.reviewStatus === "edited_and_accepted"
      ? {
          originalCandidateValue: normalizeJsonValue(input.candidate.candidate_value_json)
        }
      : {};

  const existing = await loadAcceptedRecordTx(input.tx, input.candidate.id, input.acceptedRecordType);
  const acceptedRecordId = existing?.id ?? createId(acceptedRecordPrefix(input.acceptedRecordType));
  const provenanceAnchorIds = input.citationPacket.provenanceAnchorIds;

  switch (input.acceptedRecordType) {
    case "fact": {
      const [row] = await input.tx<AcceptedRecordRow[]>`
        insert into accepted_fact_records (
          id,
          tenant_id,
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
          metadata_json
        ) values (
          ${acceptedRecordId},
          ${input.candidate.tenant_id},
          ${input.candidate.id},
          ${input.candidate.artifact_blob_id},
          ${input.candidate.field_name},
          ${input.candidate.value_type},
          ${JSON.stringify(input.acceptedValue)}::jsonb,
          ${input.candidate.source_semantic_object_type},
          ${input.candidate.source_semantic_object_id},
          ${JSON.stringify(provenanceAnchorIds)}::jsonb,
          ${JSON.stringify(input.citationPacket)}::jsonb,
          ${input.reviewStatus},
          ${input.actorId},
          ${input.actorName},
          now(),
          ${input.note},
          ${JSON.stringify(metadata)}::jsonb
        )
        on conflict (source_candidate_id)
        do update set
          accepted_value_json = excluded.accepted_value_json,
          source_semantic_object_type = excluded.source_semantic_object_type,
          source_semantic_object_id = excluded.source_semantic_object_id,
          provenance_anchor_ids_json = excluded.provenance_anchor_ids_json,
          citation_packet_json = excluded.citation_packet_json,
          review_status = excluded.review_status,
          reviewer_actor_id = excluded.reviewer_actor_id,
          reviewer_actor_name = excluded.reviewer_actor_name,
          reviewed_at = excluded.reviewed_at,
          review_note = excluded.review_note,
          metadata_json = excluded.metadata_json,
          updated_at = now()
        returning *
      `;
      return mapAcceptedRecord("fact", row);
    }
    case "relationship": {
      const [row] = await input.tx<AcceptedRecordRow[]>`
        insert into accepted_relationship_records (
          id,
          tenant_id,
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
          metadata_json
        ) values (
          ${acceptedRecordId},
          ${input.candidate.tenant_id},
          ${input.candidate.id},
          ${input.candidate.artifact_blob_id},
          ${input.candidate.field_name},
          ${input.candidate.value_type},
          ${JSON.stringify(input.acceptedValue)}::jsonb,
          ${input.candidate.source_semantic_object_type},
          ${input.candidate.source_semantic_object_id},
          ${JSON.stringify(provenanceAnchorIds)}::jsonb,
          ${JSON.stringify(input.citationPacket)}::jsonb,
          ${input.reviewStatus},
          ${input.actorId},
          ${input.actorName},
          now(),
          ${input.note},
          ${JSON.stringify(metadata)}::jsonb
        )
        on conflict (source_candidate_id)
        do update set
          accepted_value_json = excluded.accepted_value_json,
          source_semantic_object_type = excluded.source_semantic_object_type,
          source_semantic_object_id = excluded.source_semantic_object_id,
          provenance_anchor_ids_json = excluded.provenance_anchor_ids_json,
          citation_packet_json = excluded.citation_packet_json,
          review_status = excluded.review_status,
          reviewer_actor_id = excluded.reviewer_actor_id,
          reviewer_actor_name = excluded.reviewer_actor_name,
          reviewed_at = excluded.reviewed_at,
          review_note = excluded.review_note,
          metadata_json = excluded.metadata_json,
          updated_at = now()
        returning *
      `;
      return mapAcceptedRecord("relationship", row);
    }
    case "classification": {
      const [row] = await input.tx<AcceptedRecordRow[]>`
        insert into accepted_classification_records (
          id,
          tenant_id,
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
          metadata_json
        ) values (
          ${acceptedRecordId},
          ${input.candidate.tenant_id},
          ${input.candidate.id},
          ${input.candidate.artifact_blob_id},
          ${input.candidate.field_name},
          ${input.candidate.value_type},
          ${JSON.stringify(input.acceptedValue)}::jsonb,
          ${input.candidate.source_semantic_object_type},
          ${input.candidate.source_semantic_object_id},
          ${JSON.stringify(provenanceAnchorIds)}::jsonb,
          ${JSON.stringify(input.citationPacket)}::jsonb,
          ${input.reviewStatus},
          ${input.actorId},
          ${input.actorName},
          now(),
          ${input.note},
          ${JSON.stringify(metadata)}::jsonb
        )
        on conflict (source_candidate_id)
        do update set
          accepted_value_json = excluded.accepted_value_json,
          source_semantic_object_type = excluded.source_semantic_object_type,
          source_semantic_object_id = excluded.source_semantic_object_id,
          provenance_anchor_ids_json = excluded.provenance_anchor_ids_json,
          citation_packet_json = excluded.citation_packet_json,
          review_status = excluded.review_status,
          reviewer_actor_id = excluded.reviewer_actor_id,
          reviewer_actor_name = excluded.reviewer_actor_name,
          reviewed_at = excluded.reviewed_at,
          review_note = excluded.review_note,
          metadata_json = excluded.metadata_json,
          updated_at = now()
        returning *
      `;
      return mapAcceptedRecord("classification", row);
    }
  }
}

export async function listCandidateReviewQueue(): Promise<CandidateReviewQueueResponse> {
  const sql = getDb();
  const rows = await sql<QueueRow[]>`
    select
      ec.id,
      ec.artifact_blob_id,
      ab.original_file_name as artifact_file_name,
      ab.content_type,
      ec.candidate_type,
      ec.field_name,
      ec.value_type,
      ec.candidate_value_json,
      ec.confidence_score,
      ec.extraction_method,
      ec.extraction_method_detail,
      ec.summary,
      ec.review_status,
      ec.reviewed_at,
      ec.reviewed_by_actor_name,
      ec.accepted_record_type,
      ec.accepted_record_id,
      ec.current_extraction,
      source_item.id as source_item_id,
      source_item.file_name as source_item_file_name,
      source_item.source_uri,
      ec.created_at,
      ec.updated_at
    from extracted_candidates ec
    join artifact_blobs ab on ab.id = ec.artifact_blob_id
    left join lateral (
      select id, file_name, source_uri
      from source_items
      where artifact_blob_id = ec.artifact_blob_id
      order by created_at asc
      limit 1
    ) source_item on true
    where ec.review_ready = true
      and ec.current_extraction = true
    order by
      case ec.review_status
        when 'pending_review' then 0
        when 'edited_and_accepted' then 1
        when 'accepted' then 2
        when 'rejected' then 3
        else 4
      end asc,
      ec.updated_at desc,
      ec.confidence_score desc
  `;

  const items = rows.map(mapQueueItem);
  const counts = {
    pendingReview: items.filter((item) => item.reviewStatus === "pending_review").length,
    accepted: items.filter((item) => item.reviewStatus === "accepted").length,
    rejected: items.filter((item) => item.reviewStatus === "rejected").length,
    editedAndAccepted: items.filter((item) => item.reviewStatus === "edited_and_accepted").length
  };

  return {
    counts,
    items
  };
}

export async function getCandidateReviewHistory(candidateId: string): Promise<ReviewHistoryEntry[]> {
  const sql = getDb();
  const rows = await sql<ReviewHistoryRow[]>`
    select
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
    from candidate_review_history
    where candidate_id = ${candidateId}
    order by created_at desc
  `;

  return rows.map(mapReviewHistoryEntry);
}

export async function getCandidateReviewDetail(candidateId: string): Promise<CandidateReviewDetail | null> {
  const candidate = await getExtractedCandidate(candidateId, {
    includeSuperseded: true
  });

  if (!candidate) {
    return null;
  }

  const artifact = await getArtifactSummary(candidate.artifactBlobId);
  if (!artifact) {
    return null;
  }

  const provenanceAnchors = await loadProvenanceAnchors(candidate.citationPacket.provenanceAnchorIds);
  const acceptedRecord = await loadAcceptedRecord(candidate);
  const reviewHistory = await getCandidateReviewHistory(candidate.id);

  return {
    artifact,
    candidate,
    provenanceAnchors,
    acceptedRecord,
    reviewHistory
  };
}

export async function reviewCandidate(input: {
  action: ReviewCandidateActionType;
  actorId: string;
  actorName: string;
  candidateId: string;
  note?: string | null;
  reviewedValue?: unknown;
}): Promise<CandidateReviewDetail> {
  const sql = getDb();
  const note = normalizeReviewNote(input.note);

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    const [candidate] = await tx<ReviewMutationRow[]>`
      select
        id,
        tenant_id,
        artifact_blob_id,
        candidate_type,
        field_name,
        value_type,
        candidate_value_json,
        citation_packet_json,
        source_semantic_object_type,
        source_semantic_object_id,
        review_ready,
        current_extraction,
        review_status,
        accepted_record_type,
        accepted_record_id
      from extracted_candidates
      where id = ${input.candidateId}
      limit 1
      for update
    `;

    if (!candidate) {
      throw new CandidateReviewNotFoundError(input.candidateId);
    }

    if (!candidate.review_ready) {
      throw new CandidateReviewConflictError(
        "Candidate is not review-ready because provenance evidence is incomplete."
      );
    }

    if (!candidate.current_extraction) {
      throw new CandidateReviewConflictError(
        "Candidate is no longer part of the current extraction set and cannot be reviewed."
      );
    }

    const citationPacket = normalizePayload<CandidateCitationPacket>(candidate.citation_packet_json);

    if (input.action === "reject") {
      if (candidate.accepted_record_type) {
        await deleteAcceptedRecordTx(tx, candidate.id, candidate.accepted_record_type);
      }

      await tx`
        update extracted_candidates
        set
          review_status = 'rejected',
          reviewed_value_json = null,
          review_note = ${note},
          reviewed_by_actor_id = ${input.actorId},
          reviewed_by_actor_name = ${input.actorName},
          reviewed_at = now(),
          accepted_record_type = null,
          accepted_record_id = null,
          updated_at = now()
        where id = ${candidate.id}
      `;

      await insertReviewHistoryTx({
        tx,
        action: "reject",
        actorId: input.actorId,
        actorName: input.actorName,
        artifactBlobId: candidate.artifact_blob_id,
        candidateId: candidate.id,
        newReviewStatus: "rejected",
        previousReviewStatus: candidate.review_status,
        reviewNote: note
      });

      return;
    }

    const reviewStatus: CandidateReviewStatus = input.action === "edit_and_accept" ? "edited_and_accepted" : "accepted";
    const acceptedRecordType = acceptedRecordTypeForCandidateType(candidate.candidate_type);
    const acceptedValue =
      input.action === "edit_and_accept" ? input.reviewedValue : normalizeJsonValue(candidate.candidate_value_json);

    if (candidate.accepted_record_type && candidate.accepted_record_type !== acceptedRecordType) {
      await deleteAcceptedRecordTx(tx, candidate.id, candidate.accepted_record_type);
    }

    const acceptedRecord = await upsertAcceptedRecordTx({
      tx,
      acceptedRecordType,
      actorId: input.actorId,
      actorName: input.actorName,
      acceptedValue,
      candidate,
      citationPacket,
      note,
      reviewStatus
    });

    await tx`
      update extracted_candidates
      set
        review_status = ${reviewStatus},
        reviewed_value_json = ${input.action === "edit_and_accept" ? JSON.stringify(input.reviewedValue ?? null) : null}::jsonb,
        review_note = ${note},
        reviewed_by_actor_id = ${input.actorId},
        reviewed_by_actor_name = ${input.actorName},
        reviewed_at = now(),
        accepted_record_type = ${acceptedRecord.acceptedRecordType},
        accepted_record_id = ${acceptedRecord.id},
        updated_at = now()
      where id = ${candidate.id}
    `;

    await insertReviewHistoryTx({
      tx,
      action: input.action,
      actorId: input.actorId,
      actorName: input.actorName,
      artifactBlobId: candidate.artifact_blob_id,
      candidateId: candidate.id,
      editedValue: input.action === "edit_and_accept" ? input.reviewedValue : undefined,
      newReviewStatus: reviewStatus,
      previousReviewStatus: candidate.review_status,
      reviewNote: note
    });
  });

  const detail = await getCandidateReviewDetail(input.candidateId);
  if (!detail) {
    throw new CandidateReviewNotFoundError(input.candidateId);
  }

  return detail;
}
