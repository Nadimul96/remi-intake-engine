import { createHash } from "node:crypto";
import type {
  AcceptedAssetOrganizationRelationshipLink,
  AcceptedRecordSummary,
  AssetOrganizationRelationshipDetail,
  AssetOrganizationRelationshipProposalSummary,
  AssetOrganizationRelationshipQueueFilters,
  AssetOrganizationRelationshipQueueItem,
  AssetOrganizationRelationshipQueueResponse,
  AssetOrganizationRelationshipType,
  CanonicalEntitySummary,
  RelationshipAcceptedRecordStatus,
  RelationshipEntityMatchCandidate,
  RelationshipResolutionDecisionAction,
  RelationshipResolutionHistoryEntry,
  RelationshipResolutionProposalState,
  RelationshipResolutionReadinessState,
  RelationshipResolutionSystemEvent,
  RelationshipResolutionSystemEventType
} from "@remi/domain";
import { createId } from "@remi/domain";
import type postgres from "postgres";

import { getDb } from "./client";
import { getCandidateReviewDetail } from "./reviews";
import { getAcceptedTruthDetail } from "./truth";

type DbTransaction = postgres.Sql;

interface JsonMap {
  [key: string]: unknown;
}

interface SupportedAcceptedRelationshipRow {
  accepted_record_id: string;
  accepted_value_json: unknown;
  artifact_blob_id: string;
  artifact_file_name: string;
  created_at: Date;
  field_name: string;
  source_candidate_id: string;
  tenant_id: string;
  updated_at: Date;
}

interface CanonicalEntityRow {
  created_at: Date;
  display_name: string;
  entity_type: "asset" | "organization";
  id: string;
  metadata_json: JsonMap | string;
  normalized_name: string;
  status: string;
  updated_at: Date;
}

interface CanonicalEntityAliasRow {
  alias_type: "observed_name" | "observed_domain";
  alias_value: string;
  canonical_entity_id: string;
  created_at: Date;
  entity_type: "asset" | "organization";
  id: string;
  normalized_alias_value: string;
  review_note: string | null;
  source_accepted_record_id: string | null;
  source_accepted_record_type: "fact" | "relationship" | "classification" | null;
  source_artifact_blob_id: string | null;
  source_candidate_id: string | null;
  updated_at: Date;
}

interface MatchCandidateRow {
  canonical_entity_display_name: string;
  canonical_entity_id: string;
  accepted_value_json: unknown;
}

interface RelationshipLinkRow {
  accepted_record_id: string;
  canonical_asset_display_name: string;
  canonical_asset_entity_id: string;
  canonical_organization_display_name: string;
  canonical_organization_entity_id: string;
  created_at: Date;
  id: string;
  link_reason: string;
  link_status: string;
  relationship_type: AssetOrganizationRelationshipType;
  resolution_proposal_id: string | null;
  review_note: string | null;
  reviewer_actor_id: string;
  reviewer_actor_name: string;
  source_candidate_id: string;
  tenant_id: string;
  updated_at: Date;
}

interface ProposalRow {
  accepted_record_id: string;
  asset_candidates_json: RelationshipEntityMatchCandidate[] | string;
  asset_entity_display_name: string | null;
  asset_entity_id: string | null;
  confidence_score: number | string;
  created_at: Date;
  current_proposal: boolean;
  id: string;
  joined_accepted_field_name?: string | null;
  joined_accepted_record_id?: string | null;
  metadata_json: JsonMap | string;
  organization_candidates_json: RelationshipEntityMatchCandidate[] | string;
  organization_entity_display_name: string | null;
  organization_entity_id: string | null;
  proposal_state: RelationshipResolutionProposalState;
  rationale: string;
  relationship_type: AssetOrganizationRelationshipType;
  resolution_readiness: RelationshipResolutionReadinessState;
  review_note: string | null;
  reviewed_at: Date | null;
  reviewed_by_actor_id: string | null;
  reviewed_by_actor_name: string | null;
  source_candidate_id: string;
  superseded_at: Date | null;
  tenant_id: string;
  updated_at: Date;
}

interface QueueRow extends ProposalRow {
  accepted_field_name: string | null;
  accepted_value_json: unknown;
  artifact_blob_id: string | null;
  artifact_file_name: string | null;
  joined_accepted_field_name: string | null;
  joined_accepted_record_id: string | null;
  current_link_accepted_record_id: string | null;
  current_link_asset_display_name: string | null;
  current_link_asset_entity_id: string | null;
  current_link_created_at: Date | null;
  current_link_id: string | null;
  current_link_link_reason: string | null;
  current_link_link_status: string | null;
  current_link_organization_display_name: string | null;
  current_link_organization_entity_id: string | null;
  current_link_relationship_type: AssetOrganizationRelationshipType | null;
  current_link_review_note: string | null;
  current_link_reviewer_actor_id: string | null;
  current_link_reviewer_actor_name: string | null;
  current_link_updated_at: Date | null;
}

interface AcceptedRelationshipDraft {
  assetName: string;
  normalizedAssetName: string;
  organizationDomain: string | null;
  organizationName: string | null;
  normalizedOrganizationName: string | null;
  relationshipType: AssetOrganizationRelationshipType;
}

interface RelationshipResolutionHistoryRow {
  accepted_record_id: string;
  action: RelationshipResolutionDecisionAction;
  chosen_canonical_asset_display_name: string | null;
  chosen_canonical_asset_entity_id: string | null;
  chosen_canonical_organization_display_name: string | null;
  chosen_canonical_organization_entity_id: string | null;
  created_at: Date;
  id: string;
  new_proposal_state: RelationshipResolutionProposalState;
  previous_proposal_state: RelationshipResolutionProposalState;
  proposal_id: string;
  review_note: string | null;
  reviewer_actor_id: string;
  reviewer_actor_name: string;
  source_candidate_id: string;
}

interface RelationshipResolutionSystemEventRow {
  accepted_record_id: string;
  canonical_asset_display_name: string | null;
  canonical_asset_entity_id: string | null;
  canonical_organization_display_name: string | null;
  canonical_organization_entity_id: string | null;
  created_at: Date;
  event_type: RelationshipResolutionSystemEventType;
  id: string;
  new_proposal_state: RelationshipResolutionProposalState | null;
  previous_proposal_state: RelationshipResolutionProposalState | null;
  proposal_id: string;
  source_candidate_id: string;
  summary: string;
}

interface RelationshipMatchOutcome {
  assetCandidates: RelationshipEntityMatchCandidate[];
  assetEntityId: string | null;
  confidence: number;
  organizationCandidates: RelationshipEntityMatchCandidate[];
  organizationEntityId: string | null;
  rationale: string;
  readiness: RelationshipResolutionReadinessState;
}

const acceptedRelationshipFieldNameByType: Record<AssetOrganizationRelationshipType, string> = {
  broker_organization_for_asset: "probable_broker_organization_for_asset",
  originating_organization_for_asset: "probable_originating_organization_for_asset"
};

const acceptedRelationshipTypeByFieldName = new Map<string, AssetOrganizationRelationshipType>(
  Object.entries(acceptedRelationshipFieldNameByType).map(([relationshipType, fieldName]) => [
    fieldName,
    relationshipType as AssetOrganizationRelationshipType
  ])
);

const supportedAcceptedRelationshipFieldNames = Object.values(acceptedRelationshipFieldNameByType);

export class AssetOrganizationRelationshipNotFoundError extends Error {
  constructor(proposalId: string) {
    super(`Asset-organization relationship proposal ${proposalId} was not found.`);
    this.name = "AssetOrganizationRelationshipNotFoundError";
  }
}

export class AssetOrganizationRelationshipConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetOrganizationRelationshipConflictError";
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

function normalizeEntityName(value: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomain(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    return null;
  }

  const stripped =
    trimmed
      .replace(/^@+/, "")
      .replace(/^https?:\/\//, "")
      .split("/")[0] ?? "";
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(stripped) ? stripped : null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function asNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function signalPriority(signalType: RelationshipEntityMatchCandidate["signalType"]): number {
  switch (signalType) {
    case "artifact_entity_link":
      return 0;
    case "exact_name_match":
    case "exact_domain_match":
      return 1;
    case "alias_match":
      return 2;
  }
}

function mapCanonicalEntityAlias(row: CanonicalEntityAliasRow) {
  return {
    id: row.id,
    canonicalEntityId: row.canonical_entity_id,
    canonicalEntityType: row.entity_type,
    aliasType: row.alias_type,
    aliasValue: row.alias_value,
    normalizedAliasValue: row.normalized_alias_value,
    sourceAcceptedRecordType: row.source_accepted_record_type,
    sourceAcceptedRecordId: row.source_accepted_record_id,
    sourceCandidateId: row.source_candidate_id,
    sourceArtifactBlobId: row.source_artifact_blob_id,
    reviewNote: row.review_note,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  } satisfies CanonicalEntitySummary["aliases"][number];
}

function mapCanonicalEntity(
  row: CanonicalEntityRow,
  aliases: CanonicalEntitySummary["aliases"]
): CanonicalEntitySummary {
  return {
    id: row.id,
    entityType: row.entity_type,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    status: row.status,
    metadata: normalizePayload<JsonMap>(row.metadata_json),
    aliases,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function mapRelationshipLink(row: RelationshipLinkRow): AcceptedAssetOrganizationRelationshipLink {
  return {
    id: row.id,
    sourceCandidateId: row.source_candidate_id,
    acceptedRecordId: row.accepted_record_id,
    relationshipType: row.relationship_type,
    canonicalAssetEntityId: row.canonical_asset_entity_id,
    canonicalAssetDisplayName: row.canonical_asset_display_name,
    canonicalOrganizationEntityId: row.canonical_organization_entity_id,
    canonicalOrganizationDisplayName: row.canonical_organization_display_name,
    linkStatus: row.link_status,
    linkReason: row.link_reason,
    reviewerActorId: row.reviewer_actor_id,
    reviewerActorName: row.reviewer_actor_name,
    reviewNote: row.review_note,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function buildStatusExplanation(row: ProposalRow): string {
  const metadata = proposalMetadata(row);

  if (!row.current_proposal && row.proposal_state === "superseded") {
    if (metadata.acceptedRecordStatus === "deleted") {
      return row.superseded_at
        ? `This relationship proposal is historical because its accepted relationship truth was deleted on or before ${iso(row.superseded_at)}.`
        : "This relationship proposal is historical because its accepted relationship truth was deleted.";
    }

    if (metadata.acceptedRecordStatus === "unsupported") {
      return row.superseded_at
        ? `This relationship proposal is historical because its accepted relationship truth became unsupported in this lane on ${iso(row.superseded_at)}.`
        : "This relationship proposal is historical because its accepted relationship truth became unsupported in this lane.";
    }

    return row.superseded_at
      ? `This relationship proposal is no longer current because newer accepted relationship context superseded it on ${iso(row.superseded_at)}.`
      : "This relationship proposal is no longer current because newer accepted relationship context superseded it.";
  }

  if (row.proposal_state === "accepted" && row.asset_entity_display_name && row.organization_entity_display_name) {
    return `This relationship is attached between asset "${row.asset_entity_display_name}" and organization "${row.organization_entity_display_name}".`;
  }

  if (row.proposal_state === "rejected") {
    return "This accepted relationship truth remains unattached because an operator rejected the current relationship reconciliation proposal.";
  }

  switch (row.resolution_readiness) {
    case "ready_to_attach":
      return "This proposal has enough canonical asset and organization context to be attached now.";
    case "multiple_candidates":
      return "This proposal has multiple candidate assets or organizations and needs operator selection.";
    case "missing_asset":
      return "This proposal is missing a canonical asset attachment candidate.";
    case "missing_organization":
      return "This proposal is missing a canonical organization attachment candidate.";
    case "missing_both":
      return "This proposal is missing both canonical asset and canonical organization attachment candidates.";
  }
}

function mapProposal(row: ProposalRow): AssetOrganizationRelationshipProposalSummary {
  return {
    id: row.id,
    sourceCandidateId: row.source_candidate_id,
    acceptedRecordId: row.accepted_record_id,
    relationshipType: row.relationship_type,
    proposalState: row.proposal_state,
    resolutionReadiness: row.resolution_readiness,
    confidence: asNumber(row.confidence_score),
    rationale: row.rationale,
    assetEntityId: row.asset_entity_id,
    assetEntityDisplayName: row.asset_entity_display_name,
    organizationEntityId: row.organization_entity_id,
    organizationEntityDisplayName: row.organization_entity_display_name,
    assetCandidates: normalizePayload<RelationshipEntityMatchCandidate[]>(row.asset_candidates_json),
    organizationCandidates: normalizePayload<RelationshipEntityMatchCandidate[]>(row.organization_candidates_json),
    currentProposal: row.current_proposal,
    supersededAt: iso(row.superseded_at),
    statusExplanation: buildStatusExplanation(row),
    reviewNote: row.review_note,
    reviewedAt: iso(row.reviewed_at),
    reviewedByActorId: row.reviewed_by_actor_id,
    reviewedByActorName: row.reviewed_by_actor_name,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function mapRelationshipResolutionHistoryEntry(
  row: RelationshipResolutionHistoryRow
): RelationshipResolutionHistoryEntry {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    sourceCandidateId: row.source_candidate_id,
    acceptedRecordId: row.accepted_record_id,
    previousProposalState: row.previous_proposal_state,
    newProposalState: row.new_proposal_state,
    action: row.action,
    chosenCanonicalAssetEntityId: row.chosen_canonical_asset_entity_id,
    chosenCanonicalAssetDisplayName: row.chosen_canonical_asset_display_name,
    chosenCanonicalOrganizationEntityId: row.chosen_canonical_organization_entity_id,
    chosenCanonicalOrganizationDisplayName: row.chosen_canonical_organization_display_name,
    reviewNote: row.review_note,
    reviewerActorId: row.reviewer_actor_id,
    reviewerActorName: row.reviewer_actor_name,
    createdAt: iso(row.created_at) ?? ""
  };
}

function mapRelationshipResolutionSystemEvent(
  row: RelationshipResolutionSystemEventRow
): RelationshipResolutionSystemEvent {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    sourceCandidateId: row.source_candidate_id,
    acceptedRecordId: row.accepted_record_id,
    eventType: row.event_type,
    previousProposalState: row.previous_proposal_state,
    newProposalState: row.new_proposal_state,
    canonicalAssetEntityId: row.canonical_asset_entity_id,
    canonicalAssetDisplayName: row.canonical_asset_display_name,
    canonicalOrganizationEntityId: row.canonical_organization_entity_id,
    canonicalOrganizationDisplayName: row.canonical_organization_display_name,
    summary: row.summary,
    createdAt: iso(row.created_at) ?? ""
  };
}

function proposalMetadata(row: ProposalRow): JsonMap {
  return normalizePayload<JsonMap>(row.metadata_json);
}

function relationshipTypeForAcceptedFieldName(fieldName: string | null): AssetOrganizationRelationshipType | null {
  if (!fieldName) {
    return null;
  }

  return acceptedRelationshipTypeByFieldName.get(fieldName) ?? null;
}

function acceptedFieldNameForRelationshipType(relationshipType: AssetOrganizationRelationshipType): string {
  return acceptedRelationshipFieldNameByType[relationshipType];
}

function acceptedRecordStatusFromRow(row: QueueRow): RelationshipAcceptedRecordStatus {
  if (row.joined_accepted_record_id) {
    return relationshipTypeForAcceptedFieldName(row.joined_accepted_field_name) ? "active" : "unsupported";
  }

  const metadata = proposalMetadata(row);
  const status = metadata.acceptedRecordStatus;
  if (status === "unsupported" || status === "deleted") {
    return status;
  }

  return "deleted";
}

function acceptedRecordStatusExplanation(status: RelationshipAcceptedRecordStatus, row: QueueRow): string {
  switch (status) {
    case "active":
      return "Accepted relationship truth is currently present and supported by the relationship lane.";
    case "unsupported":
      return row.current_proposal
        ? "Accepted relationship truth still exists, but it is no longer supported by the current relationship lane and remains visible for auditability."
        : "This proposal is historical because the accepted relationship truth still exists, but it is no longer supported by the current relationship lane.";
    case "deleted":
      return "Accepted relationship truth was removed from accepted records. This proposal remains visible through retained snapshot metadata and candidate review context.";
  }
}

function filterQueueItems(
  items: AssetOrganizationRelationshipQueueItem[],
  filters: AssetOrganizationRelationshipQueueFilters
): AssetOrganizationRelationshipQueueItem[] {
  return items.filter((item) => {
    if (filters.relationshipType !== "all" && item.proposal.relationshipType !== filters.relationshipType) {
      return false;
    }

    if (filters.lifecycle === "current" && !item.proposal.currentProposal) {
      return false;
    }

    if (filters.lifecycle === "historical" && item.proposal.currentProposal) {
      return false;
    }

    if (filters.linkState === "linked" && item.currentRelationshipLink === null) {
      return false;
    }

    if (filters.linkState === "unlinked" && item.currentRelationshipLink !== null) {
      return false;
    }

    if (filters.proposalState !== "all" && item.proposal.proposalState !== filters.proposalState) {
      return false;
    }

    return true;
  });
}

function mapQueueItem(row: QueueRow): AssetOrganizationRelationshipQueueItem {
  const metadata = proposalMetadata(row);
  const acceptedFieldName =
    row.accepted_field_name ??
    (typeof metadata.acceptedFieldName === "string"
      ? metadata.acceptedFieldName
      : acceptedFieldNameForRelationshipType(row.relationship_type));
  const artifactBlobId =
    row.artifact_blob_id ??
    (typeof metadata.artifactBlobId === "string" ? metadata.artifactBlobId : row.source_candidate_id);
  const artifactFileName =
    row.artifact_file_name ?? (typeof metadata.artifactFileName === "string" ? metadata.artifactFileName : "Unknown");
  const acceptedValue =
    row.accepted_value_json !== null && row.accepted_value_json !== undefined
      ? normalizeJsonValue(row.accepted_value_json)
      : metadata.acceptedValueSnapshot;
  const acceptedRecordStatus = acceptedRecordStatusFromRow(row);

  return {
    proposal: mapProposal(row),
    acceptedFieldName,
    acceptedValue,
    acceptedRecordStatus,
    artifactBlobId,
    artifactFileName,
    currentRelationshipLink:
      row.current_link_id &&
      row.current_link_asset_entity_id &&
      row.current_link_asset_display_name &&
      row.current_link_organization_entity_id &&
      row.current_link_organization_display_name &&
      row.current_link_relationship_type
        ? mapRelationshipLink({
            id: row.current_link_id,
            source_candidate_id: row.source_candidate_id,
            accepted_record_id: row.current_link_accepted_record_id ?? row.accepted_record_id,
            relationship_type: row.current_link_relationship_type,
            canonical_asset_entity_id: row.current_link_asset_entity_id,
            canonical_asset_display_name: row.current_link_asset_display_name,
            canonical_organization_entity_id: row.current_link_organization_entity_id,
            canonical_organization_display_name: row.current_link_organization_display_name,
            link_status: row.current_link_link_status ?? "active",
            link_reason: row.current_link_link_reason ?? "relationship_reconciliation_review",
            resolution_proposal_id: null,
            reviewer_actor_id: row.current_link_reviewer_actor_id ?? "unknown",
            reviewer_actor_name: row.current_link_reviewer_actor_name ?? "Unknown",
            review_note: row.current_link_review_note,
            tenant_id: row.tenant_id,
            created_at: row.current_link_created_at ?? row.created_at,
            updated_at: row.current_link_updated_at ?? row.updated_at
          })
        : null
  };
}

function parseAcceptedRelationshipDraft(row: SupportedAcceptedRelationshipRow): AcceptedRelationshipDraft | null {
  const expectedRelationshipType = relationshipTypeForAcceptedFieldName(row.field_name);
  if (!expectedRelationshipType) {
    return null;
  }

  const value = normalizeJsonValue(row.accepted_value_json);
  if (!value || typeof value !== "object") {
    return null;
  }

  const relationshipTypeValue = "relationshipType" in value ? (value.relationshipType as unknown) : null;
  const assetName = "assetName" in value ? (value.assetName as unknown) : null;
  const organizationName = "organizationName" in value ? (value.organizationName as unknown) : null;
  const organizationDomain = "organizationDomain" in value ? (value.organizationDomain as unknown) : null;

  if (relationshipTypeValue !== expectedRelationshipType || typeof assetName !== "string" || !assetName.trim()) {
    return null;
  }

  const normalizedDomain = typeof organizationDomain === "string" ? normalizeDomain(organizationDomain) : null;
  const trimmedOrganizationName =
    typeof organizationName === "string" && organizationName.trim() ? organizationName.trim() : null;

  if (!trimmedOrganizationName && !normalizedDomain) {
    return null;
  }

  return {
    relationshipType: expectedRelationshipType,
    assetName: assetName.trim(),
    normalizedAssetName: normalizeEntityName(assetName),
    organizationName: trimmedOrganizationName,
    normalizedOrganizationName: trimmedOrganizationName ? normalizeEntityName(trimmedOrganizationName) : null,
    organizationDomain: normalizedDomain
  };
}

function mergeCandidates(candidates: RelationshipEntityMatchCandidate[]): RelationshipEntityMatchCandidate[] {
  const bestByEntity = new Map<string, RelationshipEntityMatchCandidate>();

  for (const candidate of candidates) {
    const existing = bestByEntity.get(candidate.entityId);
    if (!existing) {
      bestByEntity.set(candidate.entityId, candidate);
      continue;
    }

    const existingPriority = signalPriority(existing.signalType);
    const nextPriority = signalPriority(candidate.signalType);
    if (
      nextPriority < existingPriority ||
      (nextPriority === existingPriority && candidate.confidence > existing.confidence)
    ) {
      bestByEntity.set(candidate.entityId, candidate);
    }
  }

  return [...bestByEntity.values()].sort((left, right) => {
    const priorityDelta = signalPriority(left.signalType) - signalPriority(right.signalType);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return left.entityDisplayName.localeCompare(right.entityDisplayName);
  });
}

async function loadCanonicalEntitiesWithAliasesTx(input: {
  entityIds?: string[];
  entityType?: "asset" | "organization";
  tenantId?: string;
  tx: DbTransaction;
}): Promise<CanonicalEntitySummary[]> {
  let entityRows: CanonicalEntityRow[];
  let aliasRows: CanonicalEntityAliasRow[];

  if (input.entityIds) {
    if (input.entityIds.length === 0) {
      return [];
    }

    entityRows = await input.tx<CanonicalEntityRow[]>`
      select id, entity_type, display_name, normalized_name, status, metadata_json, created_at, updated_at
      from canonical_entities
      where id in ${input.tx(input.entityIds)}
      order by updated_at desc, created_at asc
    `;

    aliasRows = await input.tx<CanonicalEntityAliasRow[]>`
      select
        id,
        canonical_entity_id,
        entity_type,
        alias_type,
        alias_value,
        normalized_alias_value,
        source_accepted_record_type,
        source_accepted_record_id,
        source_candidate_id,
        source_artifact_blob_id,
        review_note,
        created_at,
        updated_at
      from canonical_entity_aliases
      where canonical_entity_id in ${input.tx(input.entityIds)}
      order by updated_at desc, created_at asc
    `;
  } else if (input.tenantId && input.entityType) {
    entityRows = await input.tx<CanonicalEntityRow[]>`
      select id, entity_type, display_name, normalized_name, status, metadata_json, created_at, updated_at
      from canonical_entities
      where tenant_id = ${input.tenantId}
        and entity_type = ${input.entityType}
      order by updated_at desc, created_at asc
    `;

    aliasRows = entityRows.length
      ? await input.tx<CanonicalEntityAliasRow[]>`
          select
            id,
            canonical_entity_id,
            entity_type,
            alias_type,
            alias_value,
            normalized_alias_value,
            source_accepted_record_type,
            source_accepted_record_id,
            source_candidate_id,
            source_artifact_blob_id,
            review_note,
            created_at,
            updated_at
          from canonical_entity_aliases
          where tenant_id = ${input.tenantId}
            and entity_type = ${input.entityType}
          order by updated_at desc, created_at asc
        `
      : [];
  } else {
    return [];
  }

  const aliasesByEntityId = new Map<string, CanonicalEntitySummary["aliases"]>();
  for (const aliasRow of aliasRows) {
    const aliases = aliasesByEntityId.get(aliasRow.canonical_entity_id) ?? [];
    aliases.push(mapCanonicalEntityAlias(aliasRow));
    aliasesByEntityId.set(aliasRow.canonical_entity_id, aliases);
  }

  return entityRows.map((row) => mapCanonicalEntity(row, aliasesByEntityId.get(row.id) ?? []));
}

async function loadSupportedAcceptedRelationshipRows(): Promise<SupportedAcceptedRelationshipRow[]> {
  const sql = getDb();
  return sql<SupportedAcceptedRelationshipRow[]>`
    select
      record.id as accepted_record_id,
      record.tenant_id,
      record.source_candidate_id,
      record.artifact_blob_id,
      artifact.original_file_name as artifact_file_name,
      record.field_name,
      record.accepted_value_json,
      record.created_at,
      record.updated_at
    from accepted_relationship_records record
    join artifact_blobs artifact on artifact.id = record.artifact_blob_id
    where record.field_name in ${sql(supportedAcceptedRelationshipFieldNames)}
  `;
}

async function loadCurrentLinkTx(input: {
  sourceCandidateId: string;
  tx: DbTransaction;
}): Promise<AcceptedAssetOrganizationRelationshipLink | null> {
  const [row] = await input.tx<RelationshipLinkRow[]>`
    select
      link.id,
      link.tenant_id,
      link.source_candidate_id,
      link.accepted_record_id,
      link.relationship_type,
      link.resolution_proposal_id,
      link.canonical_asset_entity_id,
      asset_entity.display_name as canonical_asset_display_name,
      link.canonical_organization_entity_id,
      organization_entity.display_name as canonical_organization_display_name,
      link.link_status,
      link.link_reason,
      link.reviewer_actor_id,
      link.reviewer_actor_name,
      link.review_note,
      link.created_at,
      link.updated_at
    from accepted_asset_organization_relationship_links link
    join canonical_entities asset_entity on asset_entity.id = link.canonical_asset_entity_id
    join canonical_entities organization_entity on organization_entity.id = link.canonical_organization_entity_id
    where link.source_candidate_id = ${input.sourceCandidateId}
      and link.link_status = 'active'
    limit 1
  `;

  return row ? mapRelationshipLink(row) : null;
}

async function loadCurrentProposalTx(input: {
  sourceCandidateId: string;
  tx: DbTransaction;
}): Promise<ProposalRow | null> {
  const [row] = await input.tx<ProposalRow[]>`
    select
      proposal.id,
      proposal.tenant_id,
      proposal.source_candidate_id,
      proposal.accepted_record_id,
      proposal.relationship_type,
      proposal.proposal_state,
      proposal.resolution_readiness,
      proposal.confidence_score,
      proposal.rationale,
      proposal.asset_entity_id,
      asset_entity.display_name as asset_entity_display_name,
      proposal.organization_entity_id,
      organization_entity.display_name as organization_entity_display_name,
      proposal.asset_candidates_json,
      proposal.organization_candidates_json,
      proposal.current_proposal,
      proposal.superseded_at,
      proposal.metadata_json,
      proposal.review_note,
      proposal.reviewed_at,
      proposal.reviewed_by_actor_id,
      proposal.reviewed_by_actor_name,
      proposal.created_at,
      proposal.updated_at
    from asset_organization_relationship_proposals proposal
    left join canonical_entities asset_entity on asset_entity.id = proposal.asset_entity_id
    left join canonical_entities organization_entity on organization_entity.id = proposal.organization_entity_id
    where proposal.source_candidate_id = ${input.sourceCandidateId}
      and proposal.current_proposal = true
    order by proposal.updated_at desc
    limit 1
  `;

  return row ?? null;
}

async function loadProposalByKeyTx(input: {
  proposalKey: string;
  sourceCandidateId: string;
  tx: DbTransaction;
}): Promise<ProposalRow | null> {
  const [row] = await input.tx<ProposalRow[]>`
    select
      proposal.id,
      proposal.tenant_id,
      proposal.source_candidate_id,
      proposal.accepted_record_id,
      proposal.relationship_type,
      proposal.proposal_state,
      proposal.resolution_readiness,
      proposal.confidence_score,
      proposal.rationale,
      proposal.asset_entity_id,
      asset_entity.display_name as asset_entity_display_name,
      proposal.organization_entity_id,
      organization_entity.display_name as organization_entity_display_name,
      proposal.asset_candidates_json,
      proposal.organization_candidates_json,
      proposal.current_proposal,
      proposal.superseded_at,
      proposal.metadata_json,
      proposal.review_note,
      proposal.reviewed_at,
      proposal.reviewed_by_actor_id,
      proposal.reviewed_by_actor_name,
      proposal.created_at,
      proposal.updated_at
    from asset_organization_relationship_proposals proposal
    left join canonical_entities asset_entity on asset_entity.id = proposal.asset_entity_id
    left join canonical_entities organization_entity on organization_entity.id = proposal.organization_entity_id
    where proposal.source_candidate_id = ${input.sourceCandidateId}
      and proposal.proposal_key = ${input.proposalKey}
    limit 1
  `;

  return row ?? null;
}

async function loadRelationshipReconciliationHistoryByProposalId(
  proposalId: string
): Promise<RelationshipResolutionHistoryEntry[]> {
  const sql = getDb();
  const rows = await sql<RelationshipResolutionHistoryRow[]>`
    select
      id,
      proposal_id,
      source_candidate_id,
      accepted_record_id,
      previous_proposal_state,
      new_proposal_state,
      action,
      chosen_canonical_asset_entity_id,
      chosen_canonical_asset_display_name,
      chosen_canonical_organization_entity_id,
      chosen_canonical_organization_display_name,
      review_note,
      reviewer_actor_id,
      reviewer_actor_name,
      created_at
    from asset_organization_relationship_resolution_history
    where proposal_id = ${proposalId}
    order by created_at desc, id desc
  `;

  return rows.map(mapRelationshipResolutionHistoryEntry);
}

async function loadRelationshipSystemEventsByProposalId(
  proposalId: string
): Promise<RelationshipResolutionSystemEvent[]> {
  const sql = getDb();
  const rows = await sql<RelationshipResolutionSystemEventRow[]>`
    select
      id,
      proposal_id,
      source_candidate_id,
      accepted_record_id,
      event_type,
      previous_proposal_state,
      new_proposal_state,
      canonical_asset_entity_id,
      canonical_asset_display_name,
      canonical_organization_entity_id,
      canonical_organization_display_name,
      summary,
      created_at
    from asset_organization_relationship_system_events
    where proposal_id = ${proposalId}
    order by created_at desc, id desc
  `;

  return rows.map(mapRelationshipResolutionSystemEvent);
}

function buildAcceptedRelationshipRecordSnapshotFromCandidate(input: {
  candidateDetail: NonNullable<Awaited<ReturnType<typeof getCandidateReviewDetail>>>;
  proposal: ProposalRow;
}): AcceptedRecordSummary {
  const metadata = proposalMetadata(input.proposal);
  const acceptedValue =
    metadata.acceptedValueSnapshot !== undefined
      ? metadata.acceptedValueSnapshot
      : input.candidateDetail.candidate.reviewedValue !== null
        ? input.candidateDetail.candidate.reviewedValue
        : input.candidateDetail.candidate.candidateValue;

  return {
    id: input.proposal.accepted_record_id,
    acceptedRecordType: "relationship",
    sourceCandidateId: input.candidateDetail.candidate.id,
    artifactBlobId: input.candidateDetail.candidate.artifactBlobId,
    fieldName:
      typeof metadata.acceptedFieldName === "string"
        ? metadata.acceptedFieldName
        : input.candidateDetail.candidate.fieldName,
    valueType: input.candidateDetail.candidate.valueType,
    acceptedValue,
    sourceSemanticObjectType: input.candidateDetail.candidate.sourceSemanticObjectType,
    sourceSemanticObjectId: input.candidateDetail.candidate.sourceSemanticObjectId,
    provenanceAnchorIds: input.candidateDetail.candidate.citationPacket.provenanceAnchorIds,
    citationPacket: input.candidateDetail.candidate.citationPacket,
    reviewStatus: input.candidateDetail.candidate.reviewStatus,
    reviewNote: input.candidateDetail.candidate.reviewNote,
    reviewerActorId: input.candidateDetail.candidate.reviewedByActorId ?? "unknown",
    reviewerActorName: input.candidateDetail.candidate.reviewedByActorName ?? "Unknown",
    reviewedAt:
      input.candidateDetail.candidate.reviewedAt ??
      iso(input.proposal.reviewed_at) ??
      iso(input.proposal.updated_at) ??
      input.candidateDetail.candidate.updatedAt,
    metadata: {
      ...input.candidateDetail.candidate.metadata,
      acceptedRecordMissing: true,
      reconstructedFromCandidate: true,
      missingAcceptedRecordId: input.proposal.accepted_record_id
    },
    createdAt: iso(input.proposal.created_at) ?? input.candidateDetail.candidate.createdAt,
    updatedAt: iso(input.proposal.updated_at) ?? input.candidateDetail.candidate.updatedAt
  };
}

async function loadArtifactLinkedAssetCandidatesTx(input: {
  artifactBlobId: string;
  tx: DbTransaction;
}): Promise<RelationshipEntityMatchCandidate[]> {
  const rows = await input.tx<MatchCandidateRow[]>`
    select distinct
      link.canonical_entity_id,
      entity.display_name as canonical_entity_display_name,
      record.accepted_value_json
    from accepted_truth_entity_links link
    join accepted_classification_records record on record.source_candidate_id = link.source_candidate_id
    join canonical_entities entity on entity.id = link.canonical_entity_id
    where record.artifact_blob_id = ${input.artifactBlobId}
      and record.field_name = 'probable_asset_name_mention'
      and entity.entity_type = 'asset'
      and link.link_status = 'active'
    order by entity.display_name asc
  `;

  return rows.map((row) => {
    const matchedName = normalizeJsonValue(row.accepted_value_json);
    return {
      entityId: row.canonical_entity_id,
      entityDisplayName: row.canonical_entity_display_name,
      signalType: "artifact_entity_link",
      confidence: 0.99,
      rationale: `Reviewed asset truth from this artifact is already attached to canonical asset "${row.canonical_entity_display_name}".`,
      matchedName:
        typeof matchedName === "string" && matchedName.trim() ? matchedName : row.canonical_entity_display_name,
      matchedFrom: "reviewed asset truth from the same artifact"
    } satisfies RelationshipEntityMatchCandidate;
  });
}

async function loadArtifactLinkedOrganizationCandidatesTx(input: {
  artifactBlobId: string;
  tx: DbTransaction;
}): Promise<RelationshipEntityMatchCandidate[]> {
  const rows = await input.tx<MatchCandidateRow[]>`
    select distinct
      link.canonical_entity_id,
      entity.display_name as canonical_entity_display_name,
      record.accepted_value_json
    from accepted_truth_entity_links link
    join accepted_classification_records record on record.source_candidate_id = link.source_candidate_id
    join canonical_entities entity on entity.id = link.canonical_entity_id
    where record.artifact_blob_id = ${input.artifactBlobId}
      and record.field_name in ('probable_originating_organization_name', 'probable_originating_organization_domain')
      and entity.entity_type = 'organization'
      and link.link_status = 'active'
    order by entity.display_name asc
  `;

  return rows.map((row) => {
    const matchedName = normalizeJsonValue(row.accepted_value_json);
    return {
      entityId: row.canonical_entity_id,
      entityDisplayName: row.canonical_entity_display_name,
      signalType: "artifact_entity_link",
      confidence: 0.99,
      rationale: `Reviewed organization truth from this artifact is already attached to canonical organization "${row.canonical_entity_display_name}".`,
      matchedName:
        typeof matchedName === "string" && matchedName.trim() ? matchedName : row.canonical_entity_display_name,
      matchedFrom: "reviewed organization truth from the same artifact"
    } satisfies RelationshipEntityMatchCandidate;
  });
}

function buildExactAssetCandidates(
  canonicalAssets: CanonicalEntitySummary[],
  draft: AcceptedRelationshipDraft
): RelationshipEntityMatchCandidate[] {
  const candidates: RelationshipEntityMatchCandidate[] = [];

  for (const entity of canonicalAssets) {
    if (entity.normalizedName === draft.normalizedAssetName) {
      candidates.push({
        entityId: entity.id,
        entityDisplayName: entity.displayName,
        signalType: "exact_name_match",
        confidence: 0.95,
        rationale: `Accepted relationship asset name exactly matches canonical asset "${entity.displayName}".`,
        matchedName: draft.assetName,
        matchedFrom: "accepted relationship asset name"
      });
      continue;
    }

    const aliasMatch = entity.aliases.find(
      (alias) => alias.aliasType === "observed_name" && alias.normalizedAliasValue === draft.normalizedAssetName
    );
    if (aliasMatch) {
      candidates.push({
        entityId: entity.id,
        entityDisplayName: entity.displayName,
        signalType: "alias_match",
        confidence: 0.9,
        rationale: `Accepted relationship asset name matches observed alias "${aliasMatch.aliasValue}" for canonical asset "${entity.displayName}".`,
        matchedName: draft.assetName,
        matchedFrom: "accepted relationship asset name"
      });
    }
  }

  return candidates;
}

function buildExactOrganizationCandidates(
  canonicalOrganizations: CanonicalEntitySummary[],
  draft: AcceptedRelationshipDraft
): RelationshipEntityMatchCandidate[] {
  const candidates: RelationshipEntityMatchCandidate[] = [];

  for (const entity of canonicalOrganizations) {
    if (draft.normalizedOrganizationName && entity.normalizedName === draft.normalizedOrganizationName) {
      candidates.push({
        entityId: entity.id,
        entityDisplayName: entity.displayName,
        signalType: "exact_name_match",
        confidence: 0.95,
        rationale: `Accepted relationship organization name exactly matches canonical organization "${entity.displayName}".`,
        matchedName: draft.organizationName ?? entity.displayName,
        matchedFrom: "accepted relationship organization name"
      });
      continue;
    }

    if (draft.organizationDomain) {
      const domainAlias = entity.aliases.find(
        (alias) => alias.aliasType === "observed_domain" && alias.normalizedAliasValue === draft.organizationDomain
      );
      if (domainAlias) {
        candidates.push({
          entityId: entity.id,
          entityDisplayName: entity.displayName,
          signalType: "exact_domain_match",
          confidence: 0.97,
          rationale: `Accepted relationship organization domain exactly matches observed domain "${domainAlias.aliasValue}" for canonical organization "${entity.displayName}".`,
          matchedName: draft.organizationDomain,
          matchedFrom: "accepted relationship organization domain"
        });
        continue;
      }
    }

    if (draft.normalizedOrganizationName) {
      const nameAlias = entity.aliases.find(
        (alias) =>
          alias.aliasType === "observed_name" && alias.normalizedAliasValue === draft.normalizedOrganizationName
      );
      if (nameAlias) {
        candidates.push({
          entityId: entity.id,
          entityDisplayName: entity.displayName,
          signalType: "alias_match",
          confidence: 0.9,
          rationale: `Accepted relationship organization name matches observed alias "${nameAlias.aliasValue}" for canonical organization "${entity.displayName}".`,
          matchedName: draft.organizationName ?? entity.displayName,
          matchedFrom: "accepted relationship organization name"
        });
      }
    }
  }

  return candidates;
}

function buildRelationshipMatchOutcome(input: {
  assetCandidates: RelationshipEntityMatchCandidate[];
  draft: AcceptedRelationshipDraft;
  organizationCandidates: RelationshipEntityMatchCandidate[];
}): RelationshipMatchOutcome {
  const mergedAssetCandidates = mergeCandidates(input.assetCandidates);
  const mergedOrganizationCandidates = mergeCandidates(input.organizationCandidates);

  if (mergedAssetCandidates.length === 0 && mergedOrganizationCandidates.length === 0) {
    return {
      assetCandidates: mergedAssetCandidates,
      organizationCandidates: mergedOrganizationCandidates,
      assetEntityId: null,
      organizationEntityId: null,
      readiness: "missing_both",
      confidence: 0.46,
      rationale:
        "Accepted relationship truth is missing both canonical asset and canonical organization attachment context."
    };
  }

  if (mergedAssetCandidates.length === 0) {
    return {
      assetCandidates: mergedAssetCandidates,
      organizationCandidates: mergedOrganizationCandidates,
      assetEntityId: null,
      organizationEntityId: mergedOrganizationCandidates.length === 1 ? mergedOrganizationCandidates[0].entityId : null,
      readiness: "missing_asset",
      confidence: 0.58,
      rationale:
        "Accepted relationship truth has canonical organization context, but the related asset is not yet reconciled to a canonical entity."
    };
  }

  if (mergedOrganizationCandidates.length === 0) {
    return {
      assetCandidates: mergedAssetCandidates,
      organizationCandidates: mergedOrganizationCandidates,
      assetEntityId: mergedAssetCandidates.length === 1 ? mergedAssetCandidates[0].entityId : null,
      organizationEntityId: null,
      readiness: "missing_organization",
      confidence: 0.58,
      rationale:
        "Accepted relationship truth has canonical asset context, but the related organization is not yet reconciled to a canonical entity."
    };
  }

  if (mergedAssetCandidates.length === 1 && mergedOrganizationCandidates.length === 1) {
    return {
      assetCandidates: mergedAssetCandidates,
      organizationCandidates: mergedOrganizationCandidates,
      assetEntityId: mergedAssetCandidates[0].entityId,
      organizationEntityId: mergedOrganizationCandidates[0].entityId,
      readiness: "ready_to_attach",
      confidence: Math.min(
        0.97,
        (mergedAssetCandidates[0].confidence + mergedOrganizationCandidates[0].confidence) / 2
      ),
      rationale: `Accepted relationship truth can attach "${input.draft.assetName}" to "${input.draft.organizationName ?? input.draft.organizationDomain ?? "the reviewed organization"}" using current canonical asset and organization context.`
    };
  }

  return {
    assetCandidates: mergedAssetCandidates,
    organizationCandidates: mergedOrganizationCandidates,
    assetEntityId: null,
    organizationEntityId: null,
    readiness: "multiple_candidates",
    confidence: Math.min(
      0.84,
      ((mergedAssetCandidates[0]?.confidence ?? 0.7) + (mergedOrganizationCandidates[0]?.confidence ?? 0.7)) / 2
    ),
    rationale:
      "Accepted relationship truth has multiple canonical asset or organization candidates and needs operator selection."
  };
}

function buildProposalKey(input: {
  sourceCandidateId: string;
  relationshipType: AssetOrganizationRelationshipType;
  readiness: RelationshipResolutionReadinessState;
  assetCandidates: RelationshipEntityMatchCandidate[];
  organizationCandidates: RelationshipEntityMatchCandidate[];
}): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        sourceCandidateId: input.sourceCandidateId,
        relationshipType: input.relationshipType,
        readiness: input.readiness,
        assetCandidates: input.assetCandidates.map((candidate) => ({
          entityId: candidate.entityId,
          matchedName: normalizeEntityName(candidate.matchedName),
          signalType: candidate.signalType
        })),
        organizationCandidates: input.organizationCandidates.map((candidate) => ({
          entityId: candidate.entityId,
          matchedName:
            candidate.signalType === "exact_domain_match"
              ? normalizeDomain(candidate.matchedName)
              : normalizeEntityName(candidate.matchedName),
          signalType: candidate.signalType
        }))
      })
    )
    .digest("hex");
}

async function recordRelationshipResolutionHistoryTx(input: {
  acceptedRecordId: string;
  action: RelationshipResolutionDecisionAction;
  actorId: string;
  actorName: string;
  chosenCanonicalAssetDisplayName: string | null;
  chosenCanonicalAssetEntityId: string | null;
  chosenCanonicalOrganizationDisplayName: string | null;
  chosenCanonicalOrganizationEntityId: string | null;
  note: string | null;
  previousProposalState: RelationshipResolutionProposalState;
  proposalId: string;
  sourceCandidateId: string;
  tenantId: string;
  tx: DbTransaction;
}): Promise<void> {
  await input.tx`
    insert into asset_organization_relationship_resolution_history (
      id,
      tenant_id,
      proposal_id,
      source_candidate_id,
      accepted_record_id,
      previous_proposal_state,
      new_proposal_state,
      action,
      chosen_canonical_asset_entity_id,
      chosen_canonical_asset_display_name,
      chosen_canonical_organization_entity_id,
      chosen_canonical_organization_display_name,
      review_note,
      reviewer_actor_id,
      reviewer_actor_name,
      metadata_json
    ) values (
      ${createId("relhist")},
      ${input.tenantId},
      ${input.proposalId},
      ${input.sourceCandidateId},
      ${input.acceptedRecordId},
      ${input.previousProposalState},
      ${input.action === "accept" ? "accepted" : "rejected"},
      ${input.action},
      ${input.chosenCanonicalAssetEntityId},
      ${input.chosenCanonicalAssetDisplayName},
      ${input.chosenCanonicalOrganizationEntityId},
      ${input.chosenCanonicalOrganizationDisplayName},
      ${input.note},
      ${input.actorId},
      ${input.actorName},
      ${JSON.stringify({
        statusChange: `${input.previousProposalState}->${input.action === "accept" ? "accepted" : "rejected"}`
      })}::jsonb
    )
  `;
}

async function recordRelationshipSystemEventTx(input: {
  acceptedRecordId: string;
  canonicalAssetDisplayName?: string | null;
  canonicalAssetEntityId?: string | null;
  canonicalOrganizationDisplayName?: string | null;
  canonicalOrganizationEntityId?: string | null;
  eventKey: string;
  eventType: RelationshipResolutionSystemEventType;
  newProposalState?: RelationshipResolutionProposalState | null;
  previousProposalState?: RelationshipResolutionProposalState | null;
  proposalId: string;
  sourceCandidateId: string;
  summary: string;
  tenantId: string;
  tx: DbTransaction;
}): Promise<void> {
  await input.tx`
    insert into asset_organization_relationship_system_events (
      id,
      tenant_id,
      proposal_id,
      source_candidate_id,
      accepted_record_id,
      event_type,
      event_key,
      previous_proposal_state,
      new_proposal_state,
      canonical_asset_entity_id,
      canonical_asset_display_name,
      canonical_organization_entity_id,
      canonical_organization_display_name,
      summary
    ) values (
      ${createId("relevent")},
      ${input.tenantId},
      ${input.proposalId},
      ${input.sourceCandidateId},
      ${input.acceptedRecordId},
      ${input.eventType},
      ${input.eventKey},
      ${input.previousProposalState ?? null},
      ${input.newProposalState ?? null},
      ${input.canonicalAssetEntityId ?? null},
      ${input.canonicalAssetDisplayName ?? null},
      ${input.canonicalOrganizationEntityId ?? null},
      ${input.canonicalOrganizationDisplayName ?? null},
      ${input.summary}
    )
    on conflict (event_key) do nothing
  `;
}

async function syncRelationshipProposalTx(input: {
  acceptedRelationship: SupportedAcceptedRelationshipRow;
  tx: DbTransaction;
}): Promise<void> {
  const draft = parseAcceptedRelationshipDraft(input.acceptedRelationship);
  if (!draft) {
    return;
  }

  const currentLink = await loadCurrentLinkTx({
    tx: input.tx,
    sourceCandidateId: input.acceptedRelationship.source_candidate_id
  });
  const currentProposal = await loadCurrentProposalTx({
    tx: input.tx,
    sourceCandidateId: input.acceptedRelationship.source_candidate_id
  });

  let outcome: RelationshipMatchOutcome;
  if (currentLink) {
    outcome = {
      assetCandidates: [
        {
          entityId: currentLink.canonicalAssetEntityId,
          entityDisplayName: currentLink.canonicalAssetDisplayName,
          signalType: "artifact_entity_link",
          confidence: 0.99,
          rationale: `Accepted relationship is already attached to canonical asset "${currentLink.canonicalAssetDisplayName}".`,
          matchedName: draft.assetName,
          matchedFrom: "existing relationship attachment"
        }
      ],
      organizationCandidates: [
        {
          entityId: currentLink.canonicalOrganizationEntityId,
          entityDisplayName: currentLink.canonicalOrganizationDisplayName,
          signalType: "artifact_entity_link",
          confidence: 0.99,
          rationale: `Accepted relationship is already attached to canonical organization "${currentLink.canonicalOrganizationDisplayName}".`,
          matchedName:
            draft.organizationName ?? draft.organizationDomain ?? currentLink.canonicalOrganizationDisplayName,
          matchedFrom: "existing relationship attachment"
        }
      ],
      assetEntityId: currentLink.canonicalAssetEntityId,
      organizationEntityId: currentLink.canonicalOrganizationEntityId,
      readiness: "ready_to_attach",
      confidence: 0.99,
      rationale: `Accepted relationship is already attached between asset "${currentLink.canonicalAssetDisplayName}" and organization "${currentLink.canonicalOrganizationDisplayName}".`
    };
  } else {
    const [canonicalAssets, canonicalOrganizations] = await Promise.all([
      loadCanonicalEntitiesWithAliasesTx({
        tx: input.tx,
        tenantId: input.acceptedRelationship.tenant_id,
        entityType: "asset"
      }),
      loadCanonicalEntitiesWithAliasesTx({
        tx: input.tx,
        tenantId: input.acceptedRelationship.tenant_id,
        entityType: "organization"
      })
    ]);

    const [artifactAssetCandidates, artifactOrganizationCandidates] = await Promise.all([
      loadArtifactLinkedAssetCandidatesTx({
        tx: input.tx,
        artifactBlobId: input.acceptedRelationship.artifact_blob_id
      }),
      loadArtifactLinkedOrganizationCandidatesTx({
        tx: input.tx,
        artifactBlobId: input.acceptedRelationship.artifact_blob_id
      })
    ]);

    outcome = buildRelationshipMatchOutcome({
      draft,
      assetCandidates: [...artifactAssetCandidates, ...buildExactAssetCandidates(canonicalAssets, draft)],
      organizationCandidates: [
        ...artifactOrganizationCandidates,
        ...buildExactOrganizationCandidates(canonicalOrganizations, draft)
      ]
    });
  }

  const proposalKey = buildProposalKey({
    sourceCandidateId: input.acceptedRelationship.source_candidate_id,
    relationshipType: draft.relationshipType,
    readiness: outcome.readiness,
    assetCandidates: outcome.assetCandidates,
    organizationCandidates: outcome.organizationCandidates
  });
  const proposalMetadataJson = JSON.stringify({
    acceptedFieldName: input.acceptedRelationship.field_name,
    acceptedValueSnapshot: normalizeJsonValue(input.acceptedRelationship.accepted_value_json),
    artifactBlobId: input.acceptedRelationship.artifact_blob_id,
    artifactFileName: input.acceptedRelationship.artifact_file_name,
    acceptedRecordStatus: "active"
  });

  const matchingProposal = await loadProposalByKeyTx({
    tx: input.tx,
    sourceCandidateId: input.acceptedRelationship.source_candidate_id,
    proposalKey
  });

  if (currentLink) {
    const proposalId = matchingProposal?.id ?? createId("relprop");
    const previousProposalState = matchingProposal?.proposal_state ?? null;
    const reactivated = Boolean(matchingProposal && !matchingProposal.current_proposal);

    await input.tx`
      insert into asset_organization_relationship_proposals (
        id,
        tenant_id,
        source_candidate_id,
        accepted_record_id,
        proposal_key,
        relationship_type,
        proposal_state,
        resolution_readiness,
        confidence_score,
        rationale,
        asset_entity_id,
        organization_entity_id,
        asset_candidates_json,
        organization_candidates_json,
        current_proposal,
        review_note,
        reviewed_at,
        reviewed_by_actor_id,
        reviewed_by_actor_name,
        metadata_json
      ) values (
        ${proposalId},
        ${input.acceptedRelationship.tenant_id},
        ${input.acceptedRelationship.source_candidate_id},
        ${input.acceptedRelationship.accepted_record_id},
        ${proposalKey},
        ${draft.relationshipType},
        'accepted',
        ${outcome.readiness},
        ${outcome.confidence},
        ${outcome.rationale},
        ${currentLink.canonicalAssetEntityId},
        ${currentLink.canonicalOrganizationEntityId},
        ${JSON.stringify(outcome.assetCandidates)}::jsonb,
        ${JSON.stringify(outcome.organizationCandidates)}::jsonb,
        true,
        ${matchingProposal?.review_note ?? currentLink.reviewNote},
        ${matchingProposal?.reviewed_at ?? new Date(currentLink.updatedAt)},
        ${matchingProposal?.reviewed_by_actor_id ?? currentLink.reviewerActorId},
        ${matchingProposal?.reviewed_by_actor_name ?? currentLink.reviewerActorName},
        ${proposalMetadataJson}::jsonb
      )
      on conflict (source_candidate_id, proposal_key)
      do update set
        accepted_record_id = excluded.accepted_record_id,
        relationship_type = excluded.relationship_type,
        proposal_state = 'accepted',
        resolution_readiness = excluded.resolution_readiness,
        confidence_score = excluded.confidence_score,
        rationale = excluded.rationale,
        asset_entity_id = excluded.asset_entity_id,
        organization_entity_id = excluded.organization_entity_id,
        asset_candidates_json = excluded.asset_candidates_json,
        organization_candidates_json = excluded.organization_candidates_json,
        current_proposal = true,
        superseded_at = null,
        review_note = coalesce(asset_organization_relationship_proposals.review_note, excluded.review_note),
        reviewed_at = coalesce(asset_organization_relationship_proposals.reviewed_at, excluded.reviewed_at),
        reviewed_by_actor_id = coalesce(asset_organization_relationship_proposals.reviewed_by_actor_id, excluded.reviewed_by_actor_id),
        reviewed_by_actor_name = coalesce(asset_organization_relationship_proposals.reviewed_by_actor_name, excluded.reviewed_by_actor_name),
        metadata_json = excluded.metadata_json,
        updated_at = now()
    `;

    if (reactivated) {
      await recordRelationshipSystemEventTx({
        tx: input.tx,
        tenantId: input.acceptedRelationship.tenant_id,
        proposalId,
        sourceCandidateId: input.acceptedRelationship.source_candidate_id,
        acceptedRecordId: input.acceptedRelationship.accepted_record_id,
        eventType: "proposal_reactivated",
        eventKey: `rel-proposal-reactivated:${proposalId}:${matchingProposal?.superseded_at?.toISOString() ?? matchingProposal?.updated_at.toISOString()}`,
        previousProposalState,
        newProposalState: "accepted",
        canonicalAssetEntityId: currentLink.canonicalAssetEntityId,
        canonicalAssetDisplayName: currentLink.canonicalAssetDisplayName,
        canonicalOrganizationEntityId: currentLink.canonicalOrganizationEntityId,
        canonicalOrganizationDisplayName: currentLink.canonicalOrganizationDisplayName,
        summary: `Auto-sync reactivated this relationship proposal because the accepted relationship still resolves to asset "${currentLink.canonicalAssetDisplayName}" and organization "${currentLink.canonicalOrganizationDisplayName}".`
      });
    }

    if (currentProposal && currentProposal.id !== proposalId) {
      await input.tx`
        update asset_organization_relationship_proposals
        set
          current_proposal = false,
          proposal_state = 'superseded',
          superseded_at = now(),
          updated_at = now()
        where id = ${currentProposal.id}
      `;

      await recordRelationshipSystemEventTx({
        tx: input.tx,
        tenantId: currentProposal.tenant_id,
        proposalId: currentProposal.id,
        sourceCandidateId: currentProposal.source_candidate_id,
        acceptedRecordId: currentProposal.accepted_record_id,
        eventType: "proposal_superseded",
        eventKey: `rel-proposal-superseded:${currentProposal.id}:replacement:${proposalKey}`,
        previousProposalState: currentProposal.proposal_state,
        newProposalState: "superseded",
        canonicalAssetEntityId: currentProposal.asset_entity_id,
        canonicalAssetDisplayName: currentProposal.asset_entity_display_name,
        canonicalOrganizationEntityId: currentProposal.organization_entity_id,
        canonicalOrganizationDisplayName: currentProposal.organization_entity_display_name,
        summary:
          "Auto-sync superseded this relationship proposal because a newer current relationship context became authoritative for the same source candidate."
      });
    }

    await recordRelationshipSystemEventTx({
      tx: input.tx,
      tenantId: input.acceptedRelationship.tenant_id,
      proposalId,
      sourceCandidateId: input.acceptedRelationship.source_candidate_id,
      acceptedRecordId: input.acceptedRelationship.accepted_record_id,
      eventType: "active_link_preserved",
      eventKey: `rel-active-link-preserved:${proposalId}:${currentLink.id}:${input.acceptedRelationship.accepted_record_id}`,
      previousProposalState,
      newProposalState: "accepted",
      canonicalAssetEntityId: currentLink.canonicalAssetEntityId,
      canonicalAssetDisplayName: currentLink.canonicalAssetDisplayName,
      canonicalOrganizationEntityId: currentLink.canonicalOrganizationEntityId,
      canonicalOrganizationDisplayName: currentLink.canonicalOrganizationDisplayName,
      summary: `Auto-sync preserved the active relationship link between asset "${currentLink.canonicalAssetDisplayName}" and organization "${currentLink.canonicalOrganizationDisplayName}".`
    });

    return;
  }

  if (matchingProposal) {
    const nextProposalState: RelationshipResolutionProposalState =
      matchingProposal.proposal_state === "rejected" ? "rejected" : "pending_review";

    await input.tx`
      update asset_organization_relationship_proposals
      set
        accepted_record_id = ${input.acceptedRelationship.accepted_record_id},
        current_proposal = true,
        relationship_type = ${draft.relationshipType},
        proposal_state = ${nextProposalState},
        resolution_readiness = ${outcome.readiness},
        confidence_score = ${outcome.confidence},
        rationale = ${outcome.rationale},
        asset_entity_id = ${outcome.assetEntityId},
        organization_entity_id = ${outcome.organizationEntityId},
        asset_candidates_json = ${JSON.stringify(outcome.assetCandidates)}::jsonb,
        organization_candidates_json = ${JSON.stringify(outcome.organizationCandidates)}::jsonb,
        superseded_at = null,
        review_note = ${nextProposalState === "pending_review" ? null : matchingProposal.review_note},
        reviewed_at = ${nextProposalState === "pending_review" ? null : matchingProposal.reviewed_at},
        reviewed_by_actor_id = ${nextProposalState === "pending_review" ? null : matchingProposal.reviewed_by_actor_id},
        reviewed_by_actor_name = ${nextProposalState === "pending_review" ? null : matchingProposal.reviewed_by_actor_name},
        metadata_json = ${proposalMetadataJson}::jsonb,
        updated_at = now()
      where id = ${matchingProposal.id}
    `;

    if (!matchingProposal.current_proposal) {
      await recordRelationshipSystemEventTx({
        tx: input.tx,
        tenantId: input.acceptedRelationship.tenant_id,
        proposalId: matchingProposal.id,
        sourceCandidateId: input.acceptedRelationship.source_candidate_id,
        acceptedRecordId: input.acceptedRelationship.accepted_record_id,
        eventType: "proposal_reactivated",
        eventKey: `rel-proposal-reactivated:${matchingProposal.id}:${matchingProposal.superseded_at?.toISOString() ?? matchingProposal.updated_at.toISOString()}`,
        previousProposalState: matchingProposal.proposal_state,
        newProposalState: nextProposalState,
        canonicalAssetEntityId: outcome.assetEntityId,
        canonicalAssetDisplayName: outcome.assetCandidates[0]?.entityDisplayName ?? null,
        canonicalOrganizationEntityId: outcome.organizationEntityId,
        canonicalOrganizationDisplayName: outcome.organizationCandidates[0]?.entityDisplayName ?? null,
        summary:
          nextProposalState === "rejected"
            ? "Auto-sync reactivated this previously rejected relationship proposal because the same accepted relationship context became current again."
            : "Auto-sync reactivated this relationship proposal because the same accepted relationship context became current again."
      });
    }

    if (currentProposal && currentProposal.id !== matchingProposal.id) {
      await input.tx`
        update asset_organization_relationship_proposals
        set
          current_proposal = false,
          proposal_state = 'superseded',
          superseded_at = now(),
          updated_at = now()
        where id = ${currentProposal.id}
      `;

      await recordRelationshipSystemEventTx({
        tx: input.tx,
        tenantId: currentProposal.tenant_id,
        proposalId: currentProposal.id,
        sourceCandidateId: currentProposal.source_candidate_id,
        acceptedRecordId: currentProposal.accepted_record_id,
        eventType: "proposal_superseded",
        eventKey: `rel-proposal-superseded:${currentProposal.id}:replacement:${proposalKey}`,
        previousProposalState: currentProposal.proposal_state,
        newProposalState: "superseded",
        canonicalAssetEntityId: currentProposal.asset_entity_id,
        canonicalAssetDisplayName: currentProposal.asset_entity_display_name,
        canonicalOrganizationEntityId: currentProposal.organization_entity_id,
        canonicalOrganizationDisplayName: currentProposal.organization_entity_display_name,
        summary:
          "Auto-sync superseded this relationship proposal because a newer current relationship context became authoritative for the same source candidate."
      });
    }

    return;
  }

  if (currentProposal) {
    await input.tx`
      update asset_organization_relationship_proposals
      set
        current_proposal = false,
        proposal_state = 'superseded',
        superseded_at = now(),
        updated_at = now()
      where id = ${currentProposal.id}
    `;

    await recordRelationshipSystemEventTx({
      tx: input.tx,
      tenantId: currentProposal.tenant_id,
      proposalId: currentProposal.id,
      sourceCandidateId: currentProposal.source_candidate_id,
      acceptedRecordId: currentProposal.accepted_record_id,
      eventType: "proposal_superseded",
      eventKey: `rel-proposal-superseded:${currentProposal.id}:replacement:${proposalKey}`,
      previousProposalState: currentProposal.proposal_state,
      newProposalState: "superseded",
      canonicalAssetEntityId: currentProposal.asset_entity_id,
      canonicalAssetDisplayName: currentProposal.asset_entity_display_name,
      canonicalOrganizationEntityId: currentProposal.organization_entity_id,
      canonicalOrganizationDisplayName: currentProposal.organization_entity_display_name,
      summary:
        "Auto-sync superseded this relationship proposal because a newer current relationship context became authoritative for the same source candidate."
    });
  }

  await input.tx`
    insert into asset_organization_relationship_proposals (
      id,
      tenant_id,
      source_candidate_id,
      accepted_record_id,
      proposal_key,
      relationship_type,
      proposal_state,
      resolution_readiness,
      confidence_score,
      rationale,
      asset_entity_id,
      organization_entity_id,
      asset_candidates_json,
      organization_candidates_json,
      metadata_json
    ) values (
      ${createId("relprop")},
      ${input.acceptedRelationship.tenant_id},
      ${input.acceptedRelationship.source_candidate_id},
      ${input.acceptedRelationship.accepted_record_id},
      ${proposalKey},
      ${draft.relationshipType},
      'pending_review',
      ${outcome.readiness},
      ${outcome.confidence},
      ${outcome.rationale},
      ${outcome.assetEntityId},
      ${outcome.organizationEntityId},
      ${JSON.stringify(outcome.assetCandidates)}::jsonb,
      ${JSON.stringify(outcome.organizationCandidates)}::jsonb,
      ${proposalMetadataJson}::jsonb
    )
  `;
}

async function supersedeStaleRelationshipProposalsTx(input: {
  retainedSourceCandidateIds: string[];
  tx: DbTransaction;
}): Promise<void> {
  const staleProposals =
    input.retainedSourceCandidateIds.length === 0
      ? await input.tx<ProposalRow[]>`
          select
            proposal.id,
            proposal.tenant_id,
            proposal.source_candidate_id,
            proposal.accepted_record_id,
            accepted.id as joined_accepted_record_id,
            accepted.field_name as joined_accepted_field_name,
            proposal.relationship_type,
            proposal.proposal_state,
            proposal.resolution_readiness,
            proposal.confidence_score,
            proposal.rationale,
            proposal.asset_entity_id,
            asset_entity.display_name as asset_entity_display_name,
            proposal.organization_entity_id,
            organization_entity.display_name as organization_entity_display_name,
            proposal.asset_candidates_json,
            proposal.organization_candidates_json,
            proposal.current_proposal,
            proposal.superseded_at,
            proposal.metadata_json,
            proposal.review_note,
            proposal.reviewed_at,
            proposal.reviewed_by_actor_id,
            proposal.reviewed_by_actor_name,
            proposal.created_at,
            proposal.updated_at
          from asset_organization_relationship_proposals proposal
          left join accepted_relationship_records accepted on accepted.id = proposal.accepted_record_id
          left join canonical_entities asset_entity on asset_entity.id = proposal.asset_entity_id
          left join canonical_entities organization_entity on organization_entity.id = proposal.organization_entity_id
          where proposal.current_proposal = true
        `
      : await input.tx<ProposalRow[]>`
          select
            proposal.id,
            proposal.tenant_id,
            proposal.source_candidate_id,
            proposal.accepted_record_id,
            accepted.id as joined_accepted_record_id,
            accepted.field_name as joined_accepted_field_name,
            proposal.relationship_type,
            proposal.proposal_state,
            proposal.resolution_readiness,
            proposal.confidence_score,
            proposal.rationale,
            proposal.asset_entity_id,
            asset_entity.display_name as asset_entity_display_name,
            proposal.organization_entity_id,
            organization_entity.display_name as organization_entity_display_name,
            proposal.asset_candidates_json,
            proposal.organization_candidates_json,
            proposal.current_proposal,
            proposal.superseded_at,
            proposal.metadata_json,
            proposal.review_note,
            proposal.reviewed_at,
            proposal.reviewed_by_actor_id,
            proposal.reviewed_by_actor_name,
            proposal.created_at,
            proposal.updated_at
          from asset_organization_relationship_proposals proposal
          left join accepted_relationship_records accepted on accepted.id = proposal.accepted_record_id
          left join canonical_entities asset_entity on asset_entity.id = proposal.asset_entity_id
          left join canonical_entities organization_entity on organization_entity.id = proposal.organization_entity_id
          where proposal.current_proposal = true
            and proposal.source_candidate_id not in ${input.tx(input.retainedSourceCandidateIds)}
        `;

  const staleLinks =
    input.retainedSourceCandidateIds.length === 0
      ? await input.tx<RelationshipLinkRow[]>`
          select
            link.id,
            link.tenant_id,
            link.source_candidate_id,
            link.accepted_record_id,
            link.relationship_type,
            link.resolution_proposal_id,
            link.canonical_asset_entity_id,
            asset_entity.display_name as canonical_asset_display_name,
            link.canonical_organization_entity_id,
            organization_entity.display_name as canonical_organization_display_name,
            link.link_status,
            link.link_reason,
            link.reviewer_actor_id,
            link.reviewer_actor_name,
            link.review_note,
            link.created_at,
            link.updated_at
          from accepted_asset_organization_relationship_links link
          join canonical_entities asset_entity on asset_entity.id = link.canonical_asset_entity_id
          join canonical_entities organization_entity on organization_entity.id = link.canonical_organization_entity_id
          where link.link_status = 'active'
        `
      : await input.tx<RelationshipLinkRow[]>`
          select
            link.id,
            link.tenant_id,
            link.source_candidate_id,
            link.accepted_record_id,
            link.relationship_type,
            link.resolution_proposal_id,
            link.canonical_asset_entity_id,
            asset_entity.display_name as canonical_asset_display_name,
            link.canonical_organization_entity_id,
            organization_entity.display_name as canonical_organization_display_name,
            link.link_status,
            link.link_reason,
            link.reviewer_actor_id,
            link.reviewer_actor_name,
            link.review_note,
            link.created_at,
            link.updated_at
          from accepted_asset_organization_relationship_links link
          join canonical_entities asset_entity on asset_entity.id = link.canonical_asset_entity_id
          join canonical_entities organization_entity on organization_entity.id = link.canonical_organization_entity_id
          where link.link_status = 'active'
            and link.source_candidate_id not in ${input.tx(input.retainedSourceCandidateIds)}
        `;

  if (staleProposals.length === 0 && staleLinks.length === 0) {
    return;
  }

  const staleSourceCandidateIds = [
    ...new Set([...staleProposals, ...staleLinks].map((row) => row.source_candidate_id))
  ];

  if (staleProposals.length > 0) {
    await input.tx`
      update asset_organization_relationship_proposals
      set
        current_proposal = false,
        proposal_state = 'superseded',
        superseded_at = coalesce(superseded_at, now()),
        metadata_json = metadata_json || jsonb_build_object(
          'acceptedRecordStatus',
          case
            when exists (
              select 1
              from accepted_relationship_records accepted
              where accepted.id = asset_organization_relationship_proposals.accepted_record_id
            ) then 'unsupported'
            else 'deleted'
          end
        ),
        updated_at = now()
      where source_candidate_id in ${input.tx(staleSourceCandidateIds)}
        and current_proposal = true
    `;
  }

  if (staleLinks.length > 0) {
    await input.tx`
      delete from accepted_asset_organization_relationship_links
      where source_candidate_id in ${input.tx(staleSourceCandidateIds)}
    `;
  }

  const proposalBySourceCandidateId = new Map(staleProposals.map((row) => [row.source_candidate_id, row]));

  for (const proposal of staleProposals) {
    const acceptedRecordStatus: RelationshipAcceptedRecordStatus =
      proposal.joined_accepted_record_id && proposal.joined_accepted_field_name ? "unsupported" : "deleted";

    await recordRelationshipSystemEventTx({
      tx: input.tx,
      tenantId: proposal.tenant_id,
      proposalId: proposal.id,
      sourceCandidateId: proposal.source_candidate_id,
      acceptedRecordId: proposal.accepted_record_id,
      eventType: "proposal_superseded",
      eventKey: `rel-proposal-superseded:${proposal.id}:${acceptedRecordStatus}:${proposal.accepted_record_id}`,
      previousProposalState: proposal.proposal_state,
      newProposalState: "superseded",
      canonicalAssetEntityId: proposal.asset_entity_id,
      canonicalAssetDisplayName: proposal.asset_entity_display_name,
      canonicalOrganizationEntityId: proposal.organization_entity_id,
      canonicalOrganizationDisplayName: proposal.organization_entity_display_name,
      summary:
        acceptedRecordStatus === "deleted"
          ? "Auto-sync superseded this relationship proposal because its accepted relationship truth was deleted from accepted records."
          : "Auto-sync superseded this relationship proposal because its accepted relationship truth is no longer supported in the current relationship lane."
    });
  }

  for (const link of staleLinks) {
    const proposal = proposalBySourceCandidateId.get(link.source_candidate_id);
    const proposalId = proposal?.id ?? link.resolution_proposal_id;
    if (!proposalId) {
      continue;
    }

    await recordRelationshipSystemEventTx({
      tx: input.tx,
      tenantId: proposal?.tenant_id ?? link.tenant_id,
      proposalId,
      sourceCandidateId: link.source_candidate_id,
      acceptedRecordId: link.accepted_record_id,
      eventType: "stale_link_removed",
      eventKey: `rel-stale-link-removed:${proposalId}:${proposal?.joined_accepted_record_id ? "unsupported" : "deleted"}:${link.id}:${link.accepted_record_id}`,
      previousProposalState: proposal?.proposal_state ?? null,
      newProposalState: "superseded",
      canonicalAssetEntityId: link.canonical_asset_entity_id,
      canonicalAssetDisplayName: link.canonical_asset_display_name,
      canonicalOrganizationEntityId: link.canonical_organization_entity_id,
      canonicalOrganizationDisplayName: link.canonical_organization_display_name,
      summary:
        proposal?.joined_accepted_record_id || proposal?.joined_accepted_field_name
          ? `Auto-sync removed the stale relationship link between asset "${link.canonical_asset_display_name}" and organization "${link.canonical_organization_display_name}" because the accepted relationship truth is no longer supported.`
          : `Auto-sync removed the stale relationship link between asset "${link.canonical_asset_display_name}" and organization "${link.canonical_organization_display_name}" because the accepted relationship truth was deleted.`
    });
  }
}

export async function syncAssetOrganizationRelationshipProposals(): Promise<void> {
  const sql = getDb();
  const supportedRelationships = await loadSupportedAcceptedRelationshipRows();
  const retainedSourceCandidateIds = supportedRelationships.map((row) => row.source_candidate_id);

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    for (const acceptedRelationship of supportedRelationships) {
      await syncRelationshipProposalTx({
        tx,
        acceptedRelationship
      });
    }

    await supersedeStaleRelationshipProposalsTx({
      tx,
      retainedSourceCandidateIds
    });
  });
}

export async function listAssetOrganizationRelationshipQueue(
  filters: AssetOrganizationRelationshipQueueFilters = {
    relationshipType: "all",
    lifecycle: "all",
    linkState: "all",
    proposalState: "all"
  }
): Promise<AssetOrganizationRelationshipQueueResponse> {
  await syncAssetOrganizationRelationshipProposals();

  const sql = getDb();
  const rows = await sql<QueueRow[]>`
    select
      proposal.id,
      proposal.tenant_id,
      proposal.source_candidate_id,
      proposal.accepted_record_id,
      proposal.relationship_type,
      proposal.proposal_state,
      proposal.resolution_readiness,
      proposal.confidence_score,
      proposal.rationale,
      proposal.asset_entity_id,
      asset_entity.display_name as asset_entity_display_name,
      proposal.organization_entity_id,
      organization_entity.display_name as organization_entity_display_name,
      proposal.asset_candidates_json,
      proposal.organization_candidates_json,
      proposal.current_proposal,
      proposal.superseded_at,
      proposal.metadata_json,
      proposal.review_note,
      proposal.reviewed_at,
      proposal.reviewed_by_actor_id,
      proposal.reviewed_by_actor_name,
      proposal.created_at,
      proposal.updated_at,
      accepted.id as joined_accepted_record_id,
      accepted.field_name as joined_accepted_field_name,
      coalesce(accepted.field_name, proposal.metadata_json ->> 'acceptedFieldName') as accepted_field_name,
      coalesce(accepted.accepted_value_json, proposal.metadata_json -> 'acceptedValueSnapshot') as accepted_value_json,
      coalesce(accepted.artifact_blob_id, proposal.metadata_json ->> 'artifactBlobId') as artifact_blob_id,
      coalesce(artifact.original_file_name, proposal.metadata_json ->> 'artifactFileName') as artifact_file_name,
      link.id as current_link_id,
      link.accepted_record_id as current_link_accepted_record_id,
      link.relationship_type as current_link_relationship_type,
      link.canonical_asset_entity_id as current_link_asset_entity_id,
      current_asset.display_name as current_link_asset_display_name,
      link.canonical_organization_entity_id as current_link_organization_entity_id,
      current_organization.display_name as current_link_organization_display_name,
      link.link_status as current_link_link_status,
      link.link_reason as current_link_link_reason,
      link.reviewer_actor_id as current_link_reviewer_actor_id,
      link.reviewer_actor_name as current_link_reviewer_actor_name,
      link.review_note as current_link_review_note,
      link.created_at as current_link_created_at,
      link.updated_at as current_link_updated_at
    from asset_organization_relationship_proposals proposal
    left join accepted_relationship_records accepted on accepted.id = proposal.accepted_record_id
    left join artifact_blobs artifact on artifact.id = accepted.artifact_blob_id
    left join canonical_entities asset_entity on asset_entity.id = proposal.asset_entity_id
    left join canonical_entities organization_entity on organization_entity.id = proposal.organization_entity_id
    left join accepted_asset_organization_relationship_links link
      on link.source_candidate_id = proposal.source_candidate_id
      and link.link_status = 'active'
    left join canonical_entities current_asset on current_asset.id = link.canonical_asset_entity_id
    left join canonical_entities current_organization on current_organization.id = link.canonical_organization_entity_id
    order by
      case proposal.proposal_state
        when 'pending_review' then 0
        when 'accepted' then 1
        when 'rejected' then 2
        else 3
      end asc,
      proposal.updated_at desc
  `;

  const items = filterQueueItems(rows.map(mapQueueItem), filters);
  const currentItems = items.filter((item) => item.proposal.currentProposal);
  const [{ count: supportedCount }] = await sql<{ count: number | string }[]>`
    select count(*)::int as count
    from accepted_relationship_records
    where field_name in ${sql(supportedAcceptedRelationshipFieldNames)}
  `;
  const [{ count: allAcceptedRelationships }] = await sql<{ count: number | string }[]>`
    select count(*)::int as count
    from accepted_relationship_records
  `;

  return {
    counts: {
      pendingReview: currentItems.filter((item) => item.proposal.proposalState === "pending_review").length,
      accepted: currentItems.filter((item) => item.proposal.proposalState === "accepted").length,
      rejected: currentItems.filter((item) => item.proposal.proposalState === "rejected").length,
      superseded: items.filter((item) => item.proposal.proposalState === "superseded").length,
      attachedAcceptedRelationships: currentItems.filter((item) => item.currentRelationshipLink !== null).length,
      unattachedAcceptedRelationships: currentItems.filter((item) => item.currentRelationshipLink === null).length,
      unsupportedAcceptedRelationships: Number(allAcceptedRelationships) - Number(supportedCount)
    },
    items
  };
}

export async function getAssetOrganizationRelationshipDetail(
  proposalId: string
): Promise<AssetOrganizationRelationshipDetail | null> {
  await syncAssetOrganizationRelationshipProposals();

  const sql = getDb();
  const [row] = await sql<QueueRow[]>`
    select
      proposal.id,
      proposal.tenant_id,
      proposal.source_candidate_id,
      proposal.accepted_record_id,
      proposal.relationship_type,
      proposal.proposal_state,
      proposal.resolution_readiness,
      proposal.confidence_score,
      proposal.rationale,
      proposal.asset_entity_id,
      asset_entity.display_name as asset_entity_display_name,
      proposal.organization_entity_id,
      organization_entity.display_name as organization_entity_display_name,
      proposal.asset_candidates_json,
      proposal.organization_candidates_json,
      proposal.current_proposal,
      proposal.superseded_at,
      proposal.metadata_json,
      proposal.review_note,
      proposal.reviewed_at,
      proposal.reviewed_by_actor_id,
      proposal.reviewed_by_actor_name,
      proposal.created_at,
      proposal.updated_at,
      accepted.id as joined_accepted_record_id,
      accepted.field_name as joined_accepted_field_name,
      coalesce(accepted.field_name, proposal.metadata_json ->> 'acceptedFieldName') as accepted_field_name,
      coalesce(accepted.accepted_value_json, proposal.metadata_json -> 'acceptedValueSnapshot') as accepted_value_json,
      coalesce(accepted.artifact_blob_id, proposal.metadata_json ->> 'artifactBlobId') as artifact_blob_id,
      coalesce(artifact.original_file_name, proposal.metadata_json ->> 'artifactFileName') as artifact_file_name,
      link.id as current_link_id,
      link.accepted_record_id as current_link_accepted_record_id,
      link.relationship_type as current_link_relationship_type,
      link.canonical_asset_entity_id as current_link_asset_entity_id,
      current_asset.display_name as current_link_asset_display_name,
      link.canonical_organization_entity_id as current_link_organization_entity_id,
      current_organization.display_name as current_link_organization_display_name,
      link.link_status as current_link_link_status,
      link.link_reason as current_link_link_reason,
      link.reviewer_actor_id as current_link_reviewer_actor_id,
      link.reviewer_actor_name as current_link_reviewer_actor_name,
      link.review_note as current_link_review_note,
      link.created_at as current_link_created_at,
      link.updated_at as current_link_updated_at
    from asset_organization_relationship_proposals proposal
    left join accepted_relationship_records accepted on accepted.id = proposal.accepted_record_id
    left join artifact_blobs artifact on artifact.id = accepted.artifact_blob_id
    left join canonical_entities asset_entity on asset_entity.id = proposal.asset_entity_id
    left join canonical_entities organization_entity on organization_entity.id = proposal.organization_entity_id
    left join accepted_asset_organization_relationship_links link
      on link.source_candidate_id = proposal.source_candidate_id
      and link.link_status = 'active'
    left join canonical_entities current_asset on current_asset.id = link.canonical_asset_entity_id
    left join canonical_entities current_organization on current_organization.id = link.canonical_organization_entity_id
    where proposal.id = ${proposalId}
    limit 1
  `;

  if (!row) {
    return null;
  }

  const acceptedRecordStatus = acceptedRecordStatusFromRow(row);
  const acceptedRecordStatusSummary = acceptedRecordStatusExplanation(acceptedRecordStatus, row);

  const acceptedTruthDetail = await getAcceptedTruthDetail({
    acceptedRecordId: row.accepted_record_id,
    acceptedRecordType: "relationship"
  });

  const proposal = mapProposal(row);
  const matchingAssetEntityIds = new Set([
    ...proposal.assetCandidates.map((candidate) => candidate.entityId),
    ...(proposal.assetEntityId ? [proposal.assetEntityId] : []),
    ...(row.current_link_asset_entity_id ? [row.current_link_asset_entity_id] : [])
  ]);
  const matchingOrganizationEntityIds = new Set([
    ...proposal.organizationCandidates.map((candidate) => candidate.entityId),
    ...(proposal.organizationEntityId ? [proposal.organizationEntityId] : []),
    ...(row.current_link_organization_entity_id ? [row.current_link_organization_entity_id] : [])
  ]);

  const [matchingAssets, matchingOrganizations, reconciliationHistory, systemEvents] = await Promise.all([
    loadCanonicalEntitiesWithAliasesTx({
      tx: sql as unknown as DbTransaction,
      entityIds: [...matchingAssetEntityIds]
    }),
    loadCanonicalEntitiesWithAliasesTx({
      tx: sql as unknown as DbTransaction,
      entityIds: [...matchingOrganizationEntityIds]
    }),
    loadRelationshipReconciliationHistoryByProposalId(proposalId),
    loadRelationshipSystemEventsByProposalId(proposalId)
  ]);

  if (!acceptedTruthDetail) {
    const candidateReviewDetail = await getCandidateReviewDetail(row.source_candidate_id);
    if (!candidateReviewDetail) {
      return null;
    }

    return {
      proposal,
      acceptedRecord: buildAcceptedRelationshipRecordSnapshotFromCandidate({
        proposal: row,
        candidateDetail: candidateReviewDetail
      }),
      acceptedRecordStatus,
      acceptedRecordStatusExplanation: acceptedRecordStatusSummary,
      artifact: candidateReviewDetail.artifact,
      sourceCandidate: candidateReviewDetail.candidate,
      provenanceAnchors: candidateReviewDetail.provenanceAnchors,
      reviewHistory: candidateReviewDetail.reviewHistory,
      reconciliationHistory,
      systemEvents,
      currentRelationshipLink:
        row.current_link_id && row.current_link_asset_entity_id && row.current_link_organization_entity_id
          ? mapQueueItem(row).currentRelationshipLink
          : null,
      matchingAssets,
      matchingOrganizations
    };
  }

  return {
    proposal,
    acceptedRecord: acceptedTruthDetail.acceptedRecord,
    acceptedRecordStatus,
    acceptedRecordStatusExplanation: acceptedRecordStatusSummary,
    artifact: acceptedTruthDetail.artifact,
    sourceCandidate: acceptedTruthDetail.sourceCandidate,
    provenanceAnchors: acceptedTruthDetail.provenanceAnchors,
    reviewHistory: acceptedTruthDetail.reviewHistory,
    reconciliationHistory,
    systemEvents,
    currentRelationshipLink:
      row.current_link_id && row.current_link_asset_entity_id && row.current_link_organization_entity_id
        ? mapQueueItem(row).currentRelationshipLink
        : null,
    matchingAssets,
    matchingOrganizations
  };
}

export async function reviewAssetOrganizationRelationshipProposal(input: {
  action: RelationshipResolutionDecisionAction;
  actorId: string;
  actorName: string;
  canonicalAssetEntityId?: string;
  canonicalOrganizationEntityId?: string;
  note?: string | null;
  proposalId: string;
}): Promise<AssetOrganizationRelationshipDetail> {
  const sql = getDb();
  const note = input.note?.trim() ? input.note.trim() : null;

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    const [proposalRow] = await tx<ProposalRow[]>`
      select
        proposal.id,
        proposal.tenant_id,
        proposal.source_candidate_id,
        proposal.accepted_record_id,
        proposal.relationship_type,
        proposal.proposal_state,
        proposal.resolution_readiness,
        proposal.confidence_score,
        proposal.rationale,
        proposal.asset_entity_id,
        asset_entity.display_name as asset_entity_display_name,
        proposal.organization_entity_id,
        organization_entity.display_name as organization_entity_display_name,
        proposal.asset_candidates_json,
        proposal.organization_candidates_json,
        proposal.current_proposal,
        proposal.superseded_at,
        proposal.metadata_json,
        proposal.review_note,
        proposal.reviewed_at,
        proposal.reviewed_by_actor_id,
        proposal.reviewed_by_actor_name,
        proposal.created_at,
        proposal.updated_at
      from asset_organization_relationship_proposals proposal
      left join canonical_entities asset_entity on asset_entity.id = proposal.asset_entity_id
      left join canonical_entities organization_entity on organization_entity.id = proposal.organization_entity_id
      where proposal.id = ${input.proposalId}
      limit 1
    `;

    if (!proposalRow) {
      throw new AssetOrganizationRelationshipNotFoundError(input.proposalId);
    }

    if (!proposalRow.current_proposal) {
      throw new AssetOrganizationRelationshipConflictError("Only the current relationship proposal can be reviewed.");
    }

    if (input.action === "reject") {
      await tx`
        delete from accepted_asset_organization_relationship_links
        where source_candidate_id = ${proposalRow.source_candidate_id}
      `;

      await tx`
        update asset_organization_relationship_proposals
        set
          proposal_state = 'rejected',
          review_note = ${note},
          reviewed_at = now(),
          reviewed_by_actor_id = ${input.actorId},
          reviewed_by_actor_name = ${input.actorName},
          updated_at = now()
        where id = ${proposalRow.id}
      `;

      await recordRelationshipResolutionHistoryTx({
        tx,
        tenantId: proposalRow.tenant_id,
        proposalId: proposalRow.id,
        sourceCandidateId: proposalRow.source_candidate_id,
        acceptedRecordId: proposalRow.accepted_record_id,
        previousProposalState: proposalRow.proposal_state,
        action: "reject",
        actorId: input.actorId,
        actorName: input.actorName,
        chosenCanonicalAssetEntityId: null,
        chosenCanonicalAssetDisplayName: null,
        chosenCanonicalOrganizationEntityId: null,
        chosenCanonicalOrganizationDisplayName: null,
        note
      });

      return;
    }

    if (!input.canonicalAssetEntityId || !input.canonicalOrganizationEntityId) {
      throw new AssetOrganizationRelationshipConflictError(
        "Both canonical asset and organization entities are required to accept this proposal."
      );
    }

    const [assetEntity, organizationEntity] = await Promise.all([
      loadCanonicalEntitiesWithAliasesTx({
        tx,
        entityIds: [input.canonicalAssetEntityId]
      }),
      loadCanonicalEntitiesWithAliasesTx({
        tx,
        entityIds: [input.canonicalOrganizationEntityId]
      })
    ]);

    if (assetEntity[0]?.entityType !== "asset") {
      throw new AssetOrganizationRelationshipConflictError("Selected canonical asset entity was not found.");
    }

    if (organizationEntity[0]?.entityType !== "organization") {
      throw new AssetOrganizationRelationshipConflictError("Selected canonical organization entity was not found.");
    }

    await tx`
      insert into accepted_asset_organization_relationship_links (
        id,
        tenant_id,
        source_candidate_id,
        accepted_record_id,
        relationship_type,
        canonical_asset_entity_id,
        canonical_organization_entity_id,
        link_status,
        link_reason,
        resolution_proposal_id,
        reviewer_actor_id,
        reviewer_actor_name,
        review_note
      )
      select
        ${createId("rellink")},
        candidate.tenant_id,
        ${proposalRow.source_candidate_id},
        ${proposalRow.accepted_record_id},
        ${proposalRow.relationship_type},
        ${assetEntity[0].id},
        ${organizationEntity[0].id},
        'active',
        'relationship_reconciliation_review',
        ${proposalRow.id},
        ${input.actorId},
        ${input.actorName},
        ${note}
      from extracted_candidates candidate
      where candidate.id = ${proposalRow.source_candidate_id}
      limit 1
      on conflict (source_candidate_id)
      do update set
        accepted_record_id = excluded.accepted_record_id,
        relationship_type = excluded.relationship_type,
        canonical_asset_entity_id = excluded.canonical_asset_entity_id,
        canonical_organization_entity_id = excluded.canonical_organization_entity_id,
        link_status = excluded.link_status,
        link_reason = excluded.link_reason,
        resolution_proposal_id = excluded.resolution_proposal_id,
        reviewer_actor_id = excluded.reviewer_actor_id,
        reviewer_actor_name = excluded.reviewer_actor_name,
        review_note = excluded.review_note,
        updated_at = now()
    `;

    await tx`
      update asset_organization_relationship_proposals
      set
        proposal_state = 'accepted',
        asset_entity_id = ${assetEntity[0].id},
        organization_entity_id = ${organizationEntity[0].id},
        review_note = ${note},
        reviewed_at = now(),
        reviewed_by_actor_id = ${input.actorId},
        reviewed_by_actor_name = ${input.actorName},
        updated_at = now()
      where id = ${proposalRow.id}
    `;

    await recordRelationshipResolutionHistoryTx({
      tx,
      tenantId: proposalRow.tenant_id,
      proposalId: proposalRow.id,
      sourceCandidateId: proposalRow.source_candidate_id,
      acceptedRecordId: proposalRow.accepted_record_id,
      previousProposalState: proposalRow.proposal_state,
      action: "accept",
      actorId: input.actorId,
      actorName: input.actorName,
      chosenCanonicalAssetEntityId: assetEntity[0].id,
      chosenCanonicalAssetDisplayName: assetEntity[0].displayName,
      chosenCanonicalOrganizationEntityId: organizationEntity[0].id,
      chosenCanonicalOrganizationDisplayName: organizationEntity[0].displayName,
      note
    });
  });

  const detail = await getAssetOrganizationRelationshipDetail(input.proposalId);
  if (!detail) {
    throw new AssetOrganizationRelationshipNotFoundError(input.proposalId);
  }

  return detail;
}
