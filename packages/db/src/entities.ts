import { createHash } from "node:crypto";

import { createId } from "@remi/domain";
import type {
  AcceptedRecordSummary,
  AcceptedRecordType,
  AcceptedTruthEntityLink,
  CanonicalEntityAliasSummary,
  CanonicalEntityType,
  CanonicalEntitySummary,
  EntityResolutionDecisionAction,
  EntityResolutionDetail,
  EntityResolutionHistoryEntry,
  EntityResolutionMatchCandidate,
  EntityResolutionMatchCategory,
  EntityResolutionProposalKind,
  EntityResolutionProposalState,
  EntityResolutionProposalSummary,
  EntityResolutionQueueItem,
  EntityResolutionQueueResponse,
  EntityResolutionSystemEvent,
  EntityResolutionSystemEventType
} from "@remi/domain";
import postgres from "postgres";

import { getDb } from "./client";
import { getCandidateReviewDetail } from "./reviews";
import { getAcceptedTruthDetail } from "./truth";

type DbTransaction = postgres.Sql;
type IdentityHintKind =
  | "accepted_truth_name"
  | "accepted_truth_domain"
  | "artifact_filename_hint"
  | "document_title_hint"
  | "organization_name_hint"
  | "organization_domain_hint";

interface JsonMap {
  [key: string]: unknown;
}

interface EntityIdentityHint {
  displayName: string;
  kind: IdentityHintKind;
  normalizedDisplayName: string;
}

interface EntityResolutionDraft {
  confidence: number;
  entityType: CanonicalEntityType;
  normalizedDisplayName: string;
  proposedDisplayName: string;
  sourceFieldName: string;
}

interface SupportedAcceptedTruthRow {
  accepted_record_id: string;
  accepted_record_type: AcceptedRecordType;
  accepted_value_json: unknown;
  artifact_blob_id: string;
  artifact_file_name: string;
  created_at: Date;
  field_name: string;
  source_candidate_id: string;
  source_semantic_object_id: string | null;
  source_semantic_object_type: string | null;
  tenant_id: string;
  updated_at: Date;
}

interface CanonicalEntityRow {
  created_at: Date;
  display_name: string;
  entity_type: CanonicalEntityType;
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
  entity_type: CanonicalEntityType;
  id: string;
  normalized_alias_value: string;
  review_note: string | null;
  source_accepted_record_id: string | null;
  source_accepted_record_type: AcceptedRecordType | null;
  source_artifact_blob_id: string | null;
  source_candidate_id: string | null;
  updated_at: Date;
}

interface LinkRow {
  accepted_record_id: string;
  accepted_record_type: string;
  canonical_entity_display_name: string;
  canonical_entity_id: string;
  canonical_entity_type: CanonicalEntityType;
  created_at: Date;
  id: string;
  link_reason: string;
  link_status: string;
  review_note: string | null;
  reviewer_actor_id: string;
  reviewer_actor_name: string;
  source_candidate_id: string;
  updated_at: Date;
}

interface ProposalRow {
  accepted_record_id: string;
  accepted_record_type: string;
  confidence_score: number | string;
  created_at: Date;
  current_proposal: boolean;
  entity_type: CanonicalEntityType;
  id: string;
  match_category: EntityResolutionMatchCategory;
  match_strategy: string;
  matching_candidates_json: EntityResolutionMatchCandidate[] | string;
  normalized_display_name: string;
  proposal_kind: EntityResolutionProposalKind;
  proposal_state: EntityResolutionProposalState;
  proposed_display_name: string;
  rationale: string;
  resolved_entity_display_name: string | null;
  resolved_entity_id: string | null;
  review_note: string | null;
  reviewed_at: Date | null;
  reviewed_by_actor_id: string | null;
  reviewed_by_actor_name: string | null;
  source_candidate_id: string;
  superseded_at: Date | null;
  tenant_id: string;
  target_entity_display_name: string | null;
  target_entity_id: string | null;
  updated_at: Date;
}

interface HistoryRow {
  accepted_record_id: string;
  accepted_record_type: string;
  action: EntityResolutionDecisionAction;
  chosen_entity_created: boolean;
  chosen_entity_display_name: string | null;
  chosen_entity_id: string | null;
  created_alias_values_json: string[] | string;
  created_at: Date;
  id: string;
  new_proposal_state: EntityResolutionProposalState;
  previous_proposal_state: EntityResolutionProposalState;
  proposal_id: string;
  review_note: string | null;
  reviewer_actor_id: string;
  reviewer_actor_name: string;
  source_candidate_id: string;
}

interface SystemEventRow {
  accepted_record_id: string;
  accepted_record_type: string;
  alias_values_json: string[] | string;
  canonical_entity_display_name: string | null;
  canonical_entity_id: string | null;
  created_at: Date;
  event_type: EntityResolutionSystemEventType;
  id: string;
  new_proposal_state: EntityResolutionProposalState | null;
  previous_proposal_state: EntityResolutionProposalState | null;
  proposal_id: string;
  source_candidate_id: string;
  summary: string;
}

interface AliasCleanupRow {
  alias_value: string;
  canonical_entity_display_name: string;
  canonical_entity_id: string;
  id: string;
  source_candidate_id: string | null;
}

interface QueueRow extends ProposalRow {
  accepted_field_name: string;
  accepted_value_json: unknown;
  artifact_blob_id: string;
  artifact_file_name: string;
  current_link_accepted_record_id: string | null;
  current_link_accepted_record_type: string | null;
  current_link_canonical_entity_display_name: string | null;
  current_link_canonical_entity_id: string | null;
  current_link_canonical_entity_type: CanonicalEntityType | null;
  current_link_created_at: Date | null;
  current_link_id: string | null;
  current_link_link_reason: string | null;
  current_link_link_status: string | null;
  current_link_review_note: string | null;
  current_link_reviewer_actor_id: string | null;
  current_link_reviewer_actor_name: string | null;
  current_link_updated_at: Date | null;
}

interface EntityMatchOutcome {
  confidence: number;
  matchCategory: EntityResolutionMatchCategory;
  matchStrategy: string;
  matchingCandidates: EntityResolutionMatchCandidate[];
  proposalKind: EntityResolutionProposalKind;
  rationale: string;
  targetEntityId: string | null;
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

function asNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeEntityName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferAssetName(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  const normalized = normalizeWhitespace(
    rawValue
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/[()[\]<>]/g, " ")
  );
  const stripped = normalizeWhitespace(
    normalized
      .split(/\b(?:rent roll|workbook|teaser|offering memorandum|om|summary|attached|attachment|updated|sample)\b/i)[0] ?? ""
  );

  if (!stripped || /^remi\b/i.test(stripped) || /^sample\b/i.test(stripped) || stripped.length < 5) {
    return null;
  }

  const titled = /[A-Z]/.test(stripped) ? stripped : toTitleCase(stripped);
  return titled.split(/\s+/).length >= 2 ? titled : null;
}

function inferOrganizationDisplayNameFromDomain(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  const normalized = normalizeDomain(rawValue);
  if (!normalized) {
    return null;
  }

  const labels = normalized.split(".");
  const root = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  const separated = normalizeWhitespace(root.replace(/[-_]+/g, " "));
  if (!separated) {
    return null;
  }

  return toTitleCase(separated);
}

function hintLabel(kind: IdentityHintKind): string {
  switch (kind) {
    case "accepted_truth_name":
      return "accepted truth name";
    case "accepted_truth_domain":
      return "accepted truth domain";
    case "artifact_filename_hint":
      return "artifact filename hint";
    case "document_title_hint":
      return "document title hint";
    case "organization_name_hint":
      return "organization name hint";
    case "organization_domain_hint":
      return "organization domain hint";
  }
}

function tokenizeNormalizedName(value: string): string[] {
  return value.split(" ").map((token) => token.trim()).filter(Boolean);
}

function overlapScore(leftNormalized: string, rightNormalized: string): number {
  const leftTokens = new Set(tokenizeNormalizedName(leftNormalized));
  const rightTokens = new Set(tokenizeNormalizedName(rightNormalized));

  if (leftTokens.size < 2 || rightTokens.size < 2) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (intersection < 2) {
    return 0;
  }

  const smallerCoverage = intersection / Math.min(leftTokens.size, rightTokens.size);
  const largerCoverage = intersection / Math.max(leftTokens.size, rightTokens.size);

  if (smallerCoverage === 1 && largerCoverage >= 0.5) {
    return 0.9;
  }

  if (smallerCoverage >= 0.67 && largerCoverage >= 0.4) {
    return 0.72;
  }

  return 0;
}

function signalPriority(signalType: EntityResolutionMatchCandidate["signalType"]): number {
  switch (signalType) {
    case "active_entity_link":
      return 0;
    case "exact_name_match":
    case "exact_domain_match":
      return 1;
    case "alias_match":
      return 2;
    case "possible_name_overlap":
      return 3;
  }
}

function buildIdentityHints(input: {
  acceptedTruthDomain?: string | null;
  acceptedTruthName: string;
  artifactFileName: string;
  companionOrganizationDomains?: string[];
  companionOrganizationNames?: string[];
  documentTitleHints: string[];
  entityType: CanonicalEntityType;
}): EntityIdentityHint[] {
  const hints: EntityIdentityHint[] = [];
  const seen = new Set<string>();

  const pushHint = (kind: IdentityHintKind, displayName: string | null, normalizedValue?: string | null): void => {
    if (!displayName) {
      return;
    }

    const trimmed = displayName.trim();
    if (!trimmed) {
      return;
    }

    const normalizedDisplayName = normalizedValue ?? normalizeEntityName(trimmed);
    if (!normalizedDisplayName || seen.has(normalizedDisplayName)) {
      return;
    }

    seen.add(normalizedDisplayName);
    hints.push({
      kind,
      displayName: trimmed,
      normalizedDisplayName
    });
  };

  if (input.entityType === "asset") {
    pushHint("accepted_truth_name", input.acceptedTruthName);

    for (const title of input.documentTitleHints) {
      pushHint("document_title_hint", inferAssetName(title));
    }

    pushHint("artifact_filename_hint", inferAssetName(input.artifactFileName));
    return hints;
  }

  pushHint("accepted_truth_name", input.acceptedTruthName);
  pushHint("accepted_truth_domain", input.acceptedTruthDomain ?? null, input.acceptedTruthDomain ?? null);

  for (const name of input.companionOrganizationNames ?? []) {
    pushHint("organization_name_hint", name);
  }

  for (const domain of input.companionOrganizationDomains ?? []) {
    pushHint("organization_domain_hint", domain, normalizeDomain(domain));
  }

  return hints;
}

function acceptedTruthToEntityDraft(input: {
  acceptedTruth: SupportedAcceptedTruthRow;
  companionOrganizationNames?: string[];
}): EntityResolutionDraft | null {
  const row = input.acceptedTruth;
  if (row.accepted_record_type !== "classification") {
    return null;
  }

  const acceptedValue = normalizeJsonValue(row.accepted_value_json);
  if (typeof acceptedValue !== "string") {
    return null;
  }

  const proposedDisplayName = acceptedValue.trim();
  if (!proposedDisplayName) {
    return null;
  }

  switch (row.field_name) {
    case "probable_asset_name_mention":
      return {
        confidence: 0.8,
        entityType: "asset",
        normalizedDisplayName: normalizeEntityName(proposedDisplayName),
        proposedDisplayName,
        sourceFieldName: row.field_name
      };
    case "probable_originating_organization_name":
      return {
        confidence: 0.88,
        entityType: "organization",
        normalizedDisplayName: normalizeEntityName(proposedDisplayName),
        proposedDisplayName,
        sourceFieldName: row.field_name
      };
    case "probable_originating_organization_domain": {
      const normalizedDomain = normalizeDomain(proposedDisplayName);
      if (!normalizedDomain) {
        return null;
      }

      return {
        confidence: 0.92,
        entityType: "organization",
        normalizedDisplayName: normalizeEntityName(
          input.companionOrganizationNames?.[0] ?? inferOrganizationDisplayNameFromDomain(normalizedDomain) ?? normalizedDomain
        ),
        proposedDisplayName:
          input.companionOrganizationNames?.[0] ?? inferOrganizationDisplayNameFromDomain(normalizedDomain) ?? normalizedDomain,
        sourceFieldName: row.field_name
      };
    }
    default:
      return null;
  }
}

function buildProposalKey(input: {
  entityType: CanonicalEntityType;
  matchCategory: EntityResolutionMatchCategory;
  matchingCandidates: EntityResolutionMatchCandidate[];
  normalizedDisplayName: string;
  sourceCandidateId: string;
}): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        entityType: input.entityType,
        matchCategory: input.matchCategory,
        matchingCandidates: input.matchingCandidates.map((candidate) => ({
          aliasId: candidate.aliasId,
          entityId: candidate.entityId,
          matchedName:
            candidate.signalType === "exact_domain_match" ? normalizeDomain(candidate.matchedName) : normalizeEntityName(candidate.matchedName),
          signalType: candidate.signalType
        })),
        normalizedDisplayName: input.normalizedDisplayName,
        sourceCandidateId: input.sourceCandidateId
      })
    )
    .digest("hex");
}

function mapCanonicalEntityAlias(row: CanonicalEntityAliasRow): CanonicalEntityAliasSummary {
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
  };
}

function mapCanonicalEntity(row: CanonicalEntityRow, aliases: CanonicalEntityAliasSummary[]): CanonicalEntitySummary {
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

function mapEntityLink(row: LinkRow): AcceptedTruthEntityLink {
  return {
    id: row.id,
    sourceCandidateId: row.source_candidate_id,
    acceptedRecordType: row.accepted_record_type,
    acceptedRecordId: row.accepted_record_id,
    canonicalEntityId: row.canonical_entity_id,
    canonicalEntityType: row.canonical_entity_type,
    canonicalEntityDisplayName: row.canonical_entity_display_name,
    linkStatus: row.link_status,
    linkReason: row.link_reason,
    reviewerActorId: row.reviewer_actor_id,
    reviewerActorName: row.reviewer_actor_name,
    reviewNote: row.review_note,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function buildProposalStatusExplanation(row: ProposalRow): string {
  if (!row.current_proposal && row.proposal_state === "superseded") {
    return row.superseded_at
      ? `This proposal is no longer current because newer accepted-truth reconciliation context superseded it on ${iso(row.superseded_at)}.`
      : "This proposal is no longer current because newer accepted-truth reconciliation context superseded it.";
  }

  if (!row.current_proposal && row.proposal_state === "accepted") {
    return row.resolved_entity_display_name
      ? `This proposal was previously accepted and attached to "${row.resolved_entity_display_name}", but it is no longer the current reconciliation proposal.`
      : "This proposal was previously accepted, but it is no longer the current reconciliation proposal.";
  }

  if (row.proposal_state === "accepted" && row.resolved_entity_display_name) {
    return `This proposal is resolved and attached to canonical entity "${row.resolved_entity_display_name}".`;
  }

  if (row.proposal_state === "rejected") {
    return "This proposal was rejected by an operator, so the accepted truth remains unattached until a later reconciliation decision.";
  }

  if (row.proposal_state === "pending_review") {
    return row.current_proposal
      ? "This proposal is current and awaiting operator reconciliation."
      : "This proposal is pending but is no longer the current reconciliation path.";
  }

  return row.current_proposal
    ? "This proposal remains current in the reconciliation lane."
    : "This proposal is no longer current in the reconciliation lane.";
}

function mapReconciliationHistoryEntry(row: HistoryRow): EntityResolutionHistoryEntry {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    sourceCandidateId: row.source_candidate_id,
    acceptedRecordType: row.accepted_record_type,
    acceptedRecordId: row.accepted_record_id,
    previousProposalState: row.previous_proposal_state,
    newProposalState: row.new_proposal_state,
    action: row.action,
    chosenEntityId: row.chosen_entity_id,
    chosenEntityDisplayName: row.chosen_entity_display_name,
    chosenEntityCreated: row.chosen_entity_created,
    createdAliasValues: normalizePayload<string[]>(row.created_alias_values_json),
    reviewNote: row.review_note,
    reviewerActorId: row.reviewer_actor_id,
    reviewerActorName: row.reviewer_actor_name,
    createdAt: iso(row.created_at) ?? ""
  };
}

function mapSystemEvent(row: SystemEventRow): EntityResolutionSystemEvent {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    sourceCandidateId: row.source_candidate_id,
    acceptedRecordType: row.accepted_record_type,
    acceptedRecordId: row.accepted_record_id,
    eventType: row.event_type,
    previousProposalState: row.previous_proposal_state,
    newProposalState: row.new_proposal_state,
    canonicalEntityId: row.canonical_entity_id,
    canonicalEntityDisplayName: row.canonical_entity_display_name,
    aliasValues: normalizePayload<string[]>(row.alias_values_json),
    summary: row.summary,
    createdAt: iso(row.created_at) ?? ""
  };
}

function mapProposal(row: ProposalRow): EntityResolutionProposalSummary {
  return {
    id: row.id,
    sourceCandidateId: row.source_candidate_id,
    acceptedRecordType: row.accepted_record_type,
    acceptedRecordId: row.accepted_record_id,
    entityType: row.entity_type,
    proposalKind: row.proposal_kind,
    proposalState: row.proposal_state,
    proposedDisplayName: row.proposed_display_name,
    normalizedDisplayName: row.normalized_display_name,
    targetEntityId: row.target_entity_id,
    targetEntityDisplayName: row.target_entity_display_name,
    resolvedEntityId: row.resolved_entity_id,
    resolvedEntityDisplayName: row.resolved_entity_display_name,
    confidence: asNumber(row.confidence_score),
    rationale: row.rationale,
    matchCategory: row.match_category,
    matchStrategy: row.match_strategy,
    matchingCandidates: normalizePayload<EntityResolutionMatchCandidate[]>(row.matching_candidates_json),
    currentProposal: row.current_proposal,
    supersededAt: iso(row.superseded_at),
    statusExplanation: buildProposalStatusExplanation(row),
    reviewNote: row.review_note,
    reviewedAt: iso(row.reviewed_at),
    reviewedByActorId: row.reviewed_by_actor_id,
    reviewedByActorName: row.reviewed_by_actor_name,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? ""
  };
}

function mapQueueItem(row: QueueRow): EntityResolutionQueueItem {
  return {
    proposal: mapProposal(row),
    acceptedFieldName: row.accepted_field_name,
    acceptedValue: normalizeJsonValue(row.accepted_value_json),
    artifactBlobId: row.artifact_blob_id,
    artifactFileName: row.artifact_file_name,
    currentEntityLink:
      row.current_link_id && row.current_link_canonical_entity_id && row.current_link_canonical_entity_type
        ? mapEntityLink({
            id: row.current_link_id,
            source_candidate_id: row.source_candidate_id,
            accepted_record_type: row.current_link_accepted_record_type ?? row.accepted_record_type,
            accepted_record_id: row.current_link_accepted_record_id ?? row.accepted_record_id,
            canonical_entity_id: row.current_link_canonical_entity_id,
            canonical_entity_type: row.current_link_canonical_entity_type,
            canonical_entity_display_name: row.current_link_canonical_entity_display_name ?? "Unknown entity",
            link_status: row.current_link_link_status ?? "active",
            link_reason: row.current_link_link_reason ?? "manual_reconciliation",
            reviewer_actor_id: row.current_link_reviewer_actor_id ?? "unknown",
            reviewer_actor_name: row.current_link_reviewer_actor_name ?? "Unknown",
            review_note: row.current_link_review_note,
            created_at: row.current_link_created_at ?? row.created_at,
            updated_at: row.current_link_updated_at ?? row.updated_at
          })
        : null
  };
}

function buildActiveLinkCandidate(currentLink: AcceptedTruthEntityLink): EntityResolutionMatchCandidate {
  return {
    entityId: currentLink.canonicalEntityId,
    entityDisplayName: currentLink.canonicalEntityDisplayName,
    signalType: "active_entity_link",
    confidence: 0.99,
    rationale: `Accepted truth is already attached to canonical entity "${currentLink.canonicalEntityDisplayName}".`,
    matchedName: currentLink.canonicalEntityDisplayName,
    matchedFrom: "existing accepted-truth attachment",
    aliasId: null,
    aliasValue: null
  };
}

function buildPossibleMatchCandidate(input: {
  entityType: CanonicalEntityType;
  entity: CanonicalEntitySummary;
  hint: EntityIdentityHint;
  targetAlias: CanonicalEntityAliasSummary | null;
  targetName: string;
  targetNormalizedName: string;
}): EntityResolutionMatchCandidate | null {
  const score = overlapScore(input.hint.normalizedDisplayName, input.targetNormalizedName);
  if (score === 0) {
    return null;
  }

  const confidence = Math.min(0.76, input.hint.kind === "accepted_truth_name" ? 0.58 + score * 0.18 : 0.54 + score * 0.16);
  const targetLabel = input.targetAlias
    ? `alias "${input.targetAlias.aliasValue}"`
    : `canonical ${input.entityType} "${input.entity.displayName}"`;

  return {
    entityId: input.entity.id,
    entityDisplayName: input.entity.displayName,
    signalType: "possible_name_overlap",
    confidence,
    rationale: `${hintLabel(input.hint.kind)} "${input.hint.displayName}" overlaps with ${targetLabel} and should be reviewed before attaching.`,
    matchedName: input.hint.displayName,
    matchedFrom: hintLabel(input.hint.kind),
    aliasId: input.targetAlias?.id ?? null,
    aliasValue: input.targetAlias?.aliasValue ?? null
  };
}

function buildMatchCandidates(input: {
  draft: EntityResolutionDraft;
  canonicalEntities: CanonicalEntitySummary[];
  hints: EntityIdentityHint[];
}): EntityResolutionMatchCandidate[] {
  if (input.hints.length === 0) {
    return [];
  }

  const primaryHint = input.hints[0];
  const secondaryHints = input.hints.slice(1);
  const candidates: EntityResolutionMatchCandidate[] = [];

  for (const entity of input.canonicalEntities) {
    let bestCandidate: EntityResolutionMatchCandidate | null = null;
    const canonicalLabel = input.draft.entityType === "organization" ? "canonical organization" : "canonical asset";

    if (input.draft.entityType === "organization" && primaryHint.kind === "accepted_truth_domain") {
      const domainAliasMatch = entity.aliases.find(
        (alias) => alias.aliasType === "observed_domain" && alias.normalizedAliasValue === primaryHint.normalizedDisplayName
      );

      if (domainAliasMatch) {
        bestCandidate = {
          entityId: entity.id,
          entityDisplayName: entity.displayName,
          signalType: "exact_domain_match",
          confidence: 0.97,
          rationale: `Accepted truth domain exactly matches observed domain "${domainAliasMatch.aliasValue}" for ${canonicalLabel} "${entity.displayName}".`,
          matchedName: primaryHint.displayName,
          matchedFrom: hintLabel(primaryHint.kind),
          aliasId: domainAliasMatch.id,
          aliasValue: domainAliasMatch.aliasValue
        };
      }
    }

    if (!bestCandidate && primaryHint.normalizedDisplayName === entity.normalizedName) {
      bestCandidate = {
        entityId: entity.id,
        entityDisplayName: entity.displayName,
        signalType: "exact_name_match",
        confidence: 0.96,
        rationale: `Accepted truth name exactly matches ${canonicalLabel} "${entity.displayName}".`,
        matchedName: primaryHint.displayName,
        matchedFrom: hintLabel(primaryHint.kind),
        aliasId: null,
        aliasValue: null
      };
    }

    if (!bestCandidate) {
      const primaryAliasMatch = entity.aliases.find(
        (alias) =>
          alias.normalizedAliasValue === primaryHint.normalizedDisplayName &&
          (primaryHint.kind === "accepted_truth_domain" || primaryHint.kind === "organization_domain_hint"
            ? alias.aliasType === "observed_domain"
            : alias.aliasType !== "observed_domain")
      );
      if (primaryAliasMatch) {
        bestCandidate = {
          entityId: entity.id,
          entityDisplayName: entity.displayName,
          signalType:
            primaryHint.kind === "accepted_truth_domain" || primaryHint.kind === "organization_domain_hint"
              ? "exact_domain_match"
              : "alias_match",
          confidence: primaryHint.kind === "accepted_truth_domain" || primaryHint.kind === "organization_domain_hint" ? 0.95 : 0.91,
          rationale:
            primaryHint.kind === "accepted_truth_domain" || primaryHint.kind === "organization_domain_hint"
              ? `Accepted truth domain exactly matches observed domain "${primaryAliasMatch.aliasValue}" for ${canonicalLabel} "${entity.displayName}".`
              : `Accepted truth name exactly matches observed alias "${primaryAliasMatch.aliasValue}" for ${canonicalLabel} "${entity.displayName}".`,
          matchedName: primaryHint.displayName,
          matchedFrom: hintLabel(primaryHint.kind),
          aliasId: primaryAliasMatch.id,
          aliasValue: primaryAliasMatch.aliasValue
        };
      }
    }

    if (!bestCandidate) {
      for (const hint of secondaryHints) {
        if (input.draft.entityType === "organization" && (hint.kind === "accepted_truth_domain" || hint.kind === "organization_domain_hint")) {
          const domainAliasMatch = entity.aliases.find(
            (alias) => alias.aliasType === "observed_domain" && alias.normalizedAliasValue === hint.normalizedDisplayName
          );
          if (domainAliasMatch) {
            bestCandidate = {
              entityId: entity.id,
              entityDisplayName: entity.displayName,
              signalType: "exact_domain_match",
              confidence: 0.94,
              rationale: `${hintLabel(hint.kind)} "${hint.displayName}" matches observed domain "${domainAliasMatch.aliasValue}" for ${canonicalLabel} "${entity.displayName}".`,
              matchedName: hint.displayName,
              matchedFrom: hintLabel(hint.kind),
              aliasId: domainAliasMatch.id,
              aliasValue: domainAliasMatch.aliasValue
            };
            break;
          }
        }

        if (hint.normalizedDisplayName === entity.normalizedName) {
          bestCandidate = {
            entityId: entity.id,
            entityDisplayName: entity.displayName,
            signalType: "alias_match",
            confidence: 0.84,
            rationale: `${hintLabel(hint.kind)} "${hint.displayName}" exactly matches ${canonicalLabel} "${entity.displayName}" even though the accepted truth uses a shorter or alternate name.`,
            matchedName: hint.displayName,
            matchedFrom: hintLabel(hint.kind),
            aliasId: null,
            aliasValue: null
          };
          break;
        }

        const aliasMatch = entity.aliases.find(
          (alias) =>
            alias.normalizedAliasValue === hint.normalizedDisplayName &&
            (hint.kind === "accepted_truth_domain" || hint.kind === "organization_domain_hint"
              ? alias.aliasType === "observed_domain"
              : alias.aliasType !== "observed_domain")
        );
        if (aliasMatch) {
          bestCandidate = {
            entityId: entity.id,
            entityDisplayName: entity.displayName,
            signalType:
              hint.kind === "accepted_truth_domain" || hint.kind === "organization_domain_hint"
                ? "exact_domain_match"
                : "alias_match",
            confidence: hint.kind === "accepted_truth_domain" || hint.kind === "organization_domain_hint" ? 0.92 : 0.82,
            rationale:
              hint.kind === "accepted_truth_domain" || hint.kind === "organization_domain_hint"
                ? `${hintLabel(hint.kind)} "${hint.displayName}" matches observed domain "${aliasMatch.aliasValue}" for ${canonicalLabel} "${entity.displayName}".`
                : `${hintLabel(hint.kind)} "${hint.displayName}" matches observed alias "${aliasMatch.aliasValue}" for ${canonicalLabel} "${entity.displayName}".`,
            matchedName: hint.displayName,
            matchedFrom: hintLabel(hint.kind),
            aliasId: aliasMatch.id,
            aliasValue: aliasMatch.aliasValue
          };
          break;
        }
      }
    }

    if (!bestCandidate && input.draft.entityType === "asset") {
      const possibleCandidates = [
        ...input.hints.map((hint) =>
          buildPossibleMatchCandidate({
            entityType: input.draft.entityType,
            entity,
            hint,
            targetAlias: null,
            targetName: entity.displayName,
            targetNormalizedName: entity.normalizedName
          })
        ),
        ...entity.aliases.flatMap((alias) =>
          input.hints.map((hint) =>
            buildPossibleMatchCandidate({
              entityType: input.draft.entityType,
              entity,
              hint,
              targetAlias: alias,
              targetName: alias.aliasValue,
              targetNormalizedName: alias.normalizedAliasValue
            })
          )
        )
      ].filter((candidate): candidate is EntityResolutionMatchCandidate => Boolean(candidate));

      if (possibleCandidates.length > 0) {
        possibleCandidates.sort((left, right) => right.confidence - left.confidence);
        bestCandidate = possibleCandidates[0];
      }
    }

    if (bestCandidate) {
      candidates.push(bestCandidate);
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  const topPriority = Math.min(...candidates.map((candidate) => signalPriority(candidate.signalType)));
  return candidates
    .filter((candidate) => signalPriority(candidate.signalType) === topPriority)
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return left.entityDisplayName.localeCompare(right.entityDisplayName);
    });
}

function buildMatchOutcome(input: {
  draft: EntityResolutionDraft;
  hints: EntityIdentityHint[];
  matchingCandidates: EntityResolutionMatchCandidate[];
}): EntityMatchOutcome {
  if (input.matchingCandidates.length === 0) {
    return {
      confidence: input.draft.confidence,
      matchCategory: "create_new",
      matchStrategy: "no_supported_entity_match",
      matchingCandidates: [],
      proposalKind: "create_entity",
      rationale:
        input.draft.entityType === "organization"
          ? input.hints.length > 1
            ? "Accepted organization truth and its reviewed sender hints do not match any existing canonical organization or observed domain."
            : "Accepted organization truth does not match any existing canonical organization or observed domain."
          : input.hints.length > 1
            ? "Accepted asset truth and related title or filename hints do not match any existing canonical asset or observed alias."
            : "Accepted asset truth does not match any existing canonical asset or observed alias.",
      targetEntityId: null
    };
  }

  const topCandidate = input.matchingCandidates[0];
  const matchCategory: EntityResolutionMatchCategory =
    topCandidate.signalType === "exact_name_match" || topCandidate.signalType === "exact_domain_match"
      ? "exact_match"
      : topCandidate.signalType === "alias_match"
        ? "alias_match"
        : "possible_match";

  if (input.matchingCandidates.length === 1) {
    return {
      confidence: topCandidate.confidence,
      matchCategory,
      matchStrategy: topCandidate.signalType,
      matchingCandidates: input.matchingCandidates,
      proposalKind: "attach_to_existing",
      rationale: topCandidate.rationale,
      targetEntityId: topCandidate.entityId
    };
  }

  return {
    confidence: topCandidate.confidence,
    matchCategory,
    matchStrategy: `multiple_${topCandidate.signalType}`,
    matchingCandidates: input.matchingCandidates,
    proposalKind: "attach_to_existing",
    rationale:
      matchCategory === "exact_match"
        ? input.draft.entityType === "organization"
          ? `Accepted organization truth exactly matches ${input.matchingCandidates.length} canonical organizations and needs operator selection.`
          : `Accepted asset truth exactly matches ${input.matchingCandidates.length} canonical assets and needs operator selection.`
        : matchCategory === "alias_match"
          ? input.draft.entityType === "organization"
            ? `Accepted organization truth or its reviewed hints match ${input.matchingCandidates.length} canonical organizations or observed aliases and need operator selection.`
            : `Accepted asset truth or its contextual hints match ${input.matchingCandidates.length} canonical assets or observed aliases and need operator selection.`
          : `Accepted asset truth overlaps with ${input.matchingCandidates.length} canonical assets or observed aliases and needs operator review.`,
    targetEntityId: null
  };
}

async function loadCanonicalEntitiesWithAliasesTx(input: {
  entityIds?: string[];
  entityType?: CanonicalEntityType;
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
      select
        id,
        entity_type,
        display_name,
        normalized_name,
        status,
        metadata_json,
        created_at,
        updated_at
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
      select
        id,
        entity_type,
        display_name,
        normalized_name,
        status,
        metadata_json,
        created_at,
        updated_at
      from canonical_entities
      where tenant_id = ${input.tenantId}
        and entity_type = ${input.entityType}
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
      where tenant_id = ${input.tenantId}
        and entity_type = ${input.entityType}
      order by updated_at desc, created_at asc
    `;
  } else {
    entityRows = await input.tx<CanonicalEntityRow[]>`
      select
        id,
        entity_type,
        display_name,
        normalized_name,
        status,
        metadata_json,
        created_at,
        updated_at
      from canonical_entities
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
      order by updated_at desc, created_at asc
    `;
  }

  const aliasesByEntityId = new Map<string, CanonicalEntityAliasSummary[]>();
  for (const row of aliasRows) {
    const aliases = aliasesByEntityId.get(row.canonical_entity_id) ?? [];
    aliases.push(mapCanonicalEntityAlias(row));
    aliasesByEntityId.set(row.canonical_entity_id, aliases);
  }

  return entityRows.map((row) => mapCanonicalEntity(row, aliasesByEntityId.get(row.id) ?? []));
}

async function loadCurrentLinkTx(input: {
  sourceCandidateId: string;
  tx: DbTransaction;
}): Promise<AcceptedTruthEntityLink | null> {
  const [row] = await input.tx<LinkRow[]>`
    select
      link.id,
      link.source_candidate_id,
      link.accepted_record_type,
      link.accepted_record_id,
      link.canonical_entity_id,
      entity.entity_type as canonical_entity_type,
      entity.display_name as canonical_entity_display_name,
      link.link_status,
      link.link_reason,
      link.reviewer_actor_id,
      link.reviewer_actor_name,
      link.review_note,
      link.created_at,
      link.updated_at
    from accepted_truth_entity_links link
    join canonical_entities entity on entity.id = link.canonical_entity_id
    where link.source_candidate_id = ${input.sourceCandidateId}
      and link.link_status = 'active'
    limit 1
  `;

  return row ? mapEntityLink(row) : null;
}

async function loadCurrentProposalTx(input: {
  sourceCandidateId: string;
  tx: DbTransaction;
}): Promise<{ id: string; proposalState: EntityResolutionProposalState } | null> {
  const [row] = await input.tx<{ id: string; proposal_state: EntityResolutionProposalState }[]>`
    select id, proposal_state
    from entity_resolution_proposals
    where source_candidate_id = ${input.sourceCandidateId}
      and current_proposal = true
    order by updated_at desc
    limit 1
  `;

  return row
    ? {
        id: row.id,
        proposalState: row.proposal_state
      }
    : null;
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
      proposal.accepted_record_type,
      proposal.accepted_record_id,
      proposal.entity_type,
      proposal.proposal_kind,
      proposal.proposal_state,
      proposal.proposed_display_name,
      proposal.normalized_display_name,
      proposal.target_entity_id,
      target_entity.display_name as target_entity_display_name,
      proposal.resolved_entity_id,
      resolved_entity.display_name as resolved_entity_display_name,
      proposal.confidence_score,
      proposal.rationale,
      proposal.match_category,
      proposal.match_strategy,
      proposal.matching_candidates_json,
      proposal.current_proposal,
      proposal.superseded_at,
      proposal.review_note,
      proposal.reviewed_at,
      proposal.reviewed_by_actor_id,
      proposal.reviewed_by_actor_name,
      proposal.created_at,
      proposal.updated_at
    from entity_resolution_proposals proposal
    left join canonical_entities target_entity on target_entity.id = proposal.target_entity_id
    left join canonical_entities resolved_entity on resolved_entity.id = proposal.resolved_entity_id
    where proposal.source_candidate_id = ${input.sourceCandidateId}
      and proposal.proposal_key = ${input.proposalKey}
    limit 1
  `;

  return row ?? null;
}

async function loadCurrentLinkBySourceCandidateId(sourceCandidateId: string): Promise<AcceptedTruthEntityLink | null> {
  const sql = getDb();
  const [row] = await sql<LinkRow[]>`
    select
      link.id,
      link.source_candidate_id,
      link.accepted_record_type,
      link.accepted_record_id,
      link.canonical_entity_id,
      entity.entity_type as canonical_entity_type,
      entity.display_name as canonical_entity_display_name,
      link.link_status,
      link.link_reason,
      link.reviewer_actor_id,
      link.reviewer_actor_name,
      link.review_note,
      link.created_at,
      link.updated_at
    from accepted_truth_entity_links link
    join canonical_entities entity on entity.id = link.canonical_entity_id
    where link.source_candidate_id = ${sourceCandidateId}
      and link.link_status = 'active'
    limit 1
  `;

  return row ? mapEntityLink(row) : null;
}

async function loadSupportedAcceptedTruthRows(): Promise<SupportedAcceptedTruthRow[]> {
  const sql = getDb();
  return sql<SupportedAcceptedTruthRow[]>`
    select
      record.id as accepted_record_id,
      'classification'::text as accepted_record_type,
      record.tenant_id,
      record.source_candidate_id,
      record.artifact_blob_id,
      artifact.original_file_name as artifact_file_name,
      record.field_name,
      record.accepted_value_json,
      record.source_semantic_object_type,
      record.source_semantic_object_id,
      record.created_at,
      record.updated_at
    from accepted_classification_records record
    join artifact_blobs artifact on artifact.id = record.artifact_blob_id
    where record.field_name in (
      'probable_asset_name_mention',
      'probable_originating_organization_name',
      'probable_originating_organization_domain'
    )
      and jsonb_typeof(record.accepted_value_json) = 'string'
  `;
}

async function loadDocumentTitleHintsTx(input: {
  acceptedRecordId: string;
  artifactBlobId: string;
  tx: DbTransaction;
}): Promise<string[]> {
  const rows = await input.tx<{ accepted_value_json: unknown }[]>`
    select accepted_value_json
    from accepted_classification_records
    where artifact_blob_id = ${input.artifactBlobId}
      and field_name = 'probable_document_title'
      and jsonb_typeof(accepted_value_json) = 'string'
      and id <> ${input.acceptedRecordId}
    order by updated_at desc, created_at asc
  `;

  return rows
    .map((row) => normalizeJsonValue(row.accepted_value_json))
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function loadAcceptedClassificationValuesTx(input: {
  acceptedRecordId: string;
  artifactBlobId: string;
  fieldName: string;
  tx: DbTransaction;
}): Promise<string[]> {
  const rows = await input.tx<{ accepted_value_json: unknown }[]>`
    select accepted_value_json
    from accepted_classification_records
    where artifact_blob_id = ${input.artifactBlobId}
      and field_name = ${input.fieldName}
      and jsonb_typeof(accepted_value_json) = 'string'
      and id <> ${input.acceptedRecordId}
    order by updated_at desc, created_at asc
  `;

  return rows
    .map((row) => normalizeJsonValue(row.accepted_value_json))
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function loadCanonicalEntityByIdTx(input: {
  entityId: string;
  tx: DbTransaction;
}): Promise<CanonicalEntitySummary | null> {
  const entities = await loadCanonicalEntitiesWithAliasesTx({
    entityIds: [input.entityId],
    tx: input.tx
  });

  return entities[0] ?? null;
}

async function syncEntityResolutionProposalTx(input: {
  acceptedTruth: SupportedAcceptedTruthRow;
  tx: DbTransaction;
}): Promise<void> {
  const companionOrganizationNames = await loadAcceptedClassificationValuesTx({
    tx: input.tx,
    acceptedRecordId: input.acceptedTruth.accepted_record_id,
    artifactBlobId: input.acceptedTruth.artifact_blob_id,
    fieldName: "probable_originating_organization_name"
  });
  const companionOrganizationDomains = await loadAcceptedClassificationValuesTx({
    tx: input.tx,
    acceptedRecordId: input.acceptedTruth.accepted_record_id,
    artifactBlobId: input.acceptedTruth.artifact_blob_id,
    fieldName: "probable_originating_organization_domain"
  });
  const draft = acceptedTruthToEntityDraft({
    acceptedTruth: input.acceptedTruth,
    companionOrganizationNames
  });
  if (!draft) {
    return;
  }

  const documentTitleHints = await loadDocumentTitleHintsTx({
    acceptedRecordId: input.acceptedTruth.accepted_record_id,
    artifactBlobId: input.acceptedTruth.artifact_blob_id,
    tx: input.tx
  });
  const identityHints = buildIdentityHints({
    entityType: draft.entityType,
    acceptedTruthDomain:
      input.acceptedTruth.field_name === "probable_originating_organization_domain"
        ? normalizeJsonValue(input.acceptedTruth.accepted_value_json) as string
        : null,
    acceptedTruthName: draft.proposedDisplayName,
    artifactFileName: input.acceptedTruth.artifact_file_name,
    companionOrganizationDomains,
    companionOrganizationNames,
    documentTitleHints
  });
  const canonicalEntities = await loadCanonicalEntitiesWithAliasesTx({
    tx: input.tx,
    tenantId: input.acceptedTruth.tenant_id,
    entityType: draft.entityType
  });
  const matchOutcome = buildMatchOutcome({
    draft,
    hints: identityHints,
    matchingCandidates: buildMatchCandidates({
      draft,
      canonicalEntities,
      hints: identityHints
    })
  });
  const currentLink = await loadCurrentLinkTx({
    tx: input.tx,
    sourceCandidateId: input.acceptedTruth.source_candidate_id
  });
  const currentProposal = await loadCurrentProposalTx({
    tx: input.tx,
    sourceCandidateId: input.acceptedTruth.source_candidate_id
  });
  const proposalKey = buildProposalKey({
    sourceCandidateId: input.acceptedTruth.source_candidate_id,
    entityType: draft.entityType,
    matchCategory: matchOutcome.matchCategory,
    matchingCandidates: matchOutcome.matchingCandidates,
    normalizedDisplayName: draft.normalizedDisplayName
  });
  const matchingProposal = await loadProposalByKeyTx({
    tx: input.tx,
    sourceCandidateId: input.acceptedTruth.source_candidate_id,
    proposalKey
  });

  if (currentLink) {
    const matchingCandidates = [buildActiveLinkCandidate(currentLink)];
    const linkedProposalKey = buildProposalKey({
      sourceCandidateId: input.acceptedTruth.source_candidate_id,
      entityType: draft.entityType,
      matchCategory: "active_link",
      matchingCandidates,
      normalizedDisplayName: draft.normalizedDisplayName
    });
    const linkedProposal = await loadProposalByKeyTx({
      tx: input.tx,
      sourceCandidateId: input.acceptedTruth.source_candidate_id,
      proposalKey: linkedProposalKey
    });

    if (currentProposal) {
      await input.tx`
        update entity_resolution_proposals
        set
          accepted_record_type = ${input.acceptedTruth.accepted_record_type},
          accepted_record_id = ${input.acceptedTruth.accepted_record_id},
          entity_type = ${draft.entityType},
          proposal_kind = 'attach_to_existing',
          proposal_state = 'accepted',
          proposed_display_name = ${draft.proposedDisplayName},
          normalized_display_name = ${draft.normalizedDisplayName},
          target_entity_id = ${currentLink.canonicalEntityId},
          resolved_entity_id = ${currentLink.canonicalEntityId},
          confidence_score = 0.99,
          rationale = ${`Accepted truth is already attached to canonical entity "${currentLink.canonicalEntityDisplayName}".`},
          match_category = 'active_link',
          match_strategy = 'active_entity_link',
          matching_candidates_json = ${JSON.stringify(matchingCandidates)}::jsonb,
          current_proposal = true,
          superseded_at = null,
          updated_at = now()
        where id = ${currentProposal.id}
      `;

      await recordEntityResolutionSystemEventTx({
        tx: input.tx,
        tenantId: input.acceptedTruth.tenant_id,
        proposalId: currentProposal.id,
        sourceCandidateId: input.acceptedTruth.source_candidate_id,
        acceptedRecordType: input.acceptedTruth.accepted_record_type,
        acceptedRecordId: input.acceptedTruth.accepted_record_id,
        eventType: "active_link_preserved",
        eventKey: `active-link-preserved:${currentProposal.id}:${currentLink.id}:${input.acceptedTruth.accepted_record_id}`,
        previousProposalState: currentProposal.proposalState,
        newProposalState: "accepted",
        canonicalEntityId: currentLink.canonicalEntityId,
        canonicalEntityDisplayName: currentLink.canonicalEntityDisplayName,
        summary: `Auto-sync preserved the active entity link to "${currentLink.canonicalEntityDisplayName}" while refreshing the current reconciliation context.`
      });

      return;
    }
    const proposalId = linkedProposal?.id ?? createId("entityprop");

    await input.tx`
      insert into entity_resolution_proposals (
        id,
        tenant_id,
        source_candidate_id,
        accepted_record_type,
        accepted_record_id,
        proposal_key,
        entity_type,
        proposal_kind,
        proposal_state,
        proposed_display_name,
        normalized_display_name,
        target_entity_id,
        resolved_entity_id,
        confidence_score,
        rationale,
        match_category,
        match_strategy,
        matching_candidates_json,
        current_proposal,
        reviewed_at,
        reviewed_by_actor_id,
        reviewed_by_actor_name,
        metadata_json
      ) values (
        ${proposalId},
        ${input.acceptedTruth.tenant_id},
        ${input.acceptedTruth.source_candidate_id},
        ${input.acceptedTruth.accepted_record_type},
        ${input.acceptedTruth.accepted_record_id},
        ${linkedProposalKey},
        ${draft.entityType},
        'attach_to_existing',
        'accepted',
        ${draft.proposedDisplayName},
        ${draft.normalizedDisplayName},
        ${currentLink.canonicalEntityId},
        ${currentLink.canonicalEntityId},
        0.99,
        ${`Accepted truth is already attached to canonical entity "${currentLink.canonicalEntityDisplayName}".`},
        'active_link',
        'active_entity_link',
        ${JSON.stringify(matchingCandidates)}::jsonb,
        true,
        now(),
        ${currentLink.reviewerActorId},
        ${currentLink.reviewerActorName},
        ${JSON.stringify({
          artifactBlobId: input.acceptedTruth.artifact_blob_id,
          artifactFileName: input.acceptedTruth.artifact_file_name,
          documentTitleHints,
          sourceSemanticObjectId: input.acceptedTruth.source_semantic_object_id,
          sourceSemanticObjectType: input.acceptedTruth.source_semantic_object_type
        })}::jsonb
      )
      on conflict (source_candidate_id, proposal_key)
      do update set
        current_proposal = true,
        proposal_state = 'accepted',
        target_entity_id = excluded.target_entity_id,
        resolved_entity_id = excluded.resolved_entity_id,
        match_category = excluded.match_category,
        match_strategy = excluded.match_strategy,
        matching_candidates_json = excluded.matching_candidates_json,
        superseded_at = null,
        updated_at = now()
    `;

    if (linkedProposal && !linkedProposal.current_proposal) {
      await recordEntityResolutionSystemEventTx({
        tx: input.tx,
        tenantId: input.acceptedTruth.tenant_id,
        proposalId,
        sourceCandidateId: input.acceptedTruth.source_candidate_id,
        acceptedRecordType: input.acceptedTruth.accepted_record_type,
        acceptedRecordId: input.acceptedTruth.accepted_record_id,
        eventType: "proposal_reactivated",
        eventKey: `proposal-reactivated:${proposalId}:${linkedProposal.superseded_at?.toISOString() ?? linkedProposal.updated_at.toISOString()}`,
        previousProposalState: linkedProposal.proposal_state,
        newProposalState: "accepted",
        canonicalEntityId: currentLink.canonicalEntityId,
        canonicalEntityDisplayName: currentLink.canonicalEntityDisplayName,
        summary: `Auto-sync reactivated this proposal because the accepted truth still resolves to the preserved canonical entity link "${currentLink.canonicalEntityDisplayName}".`
      });
    }

    await recordEntityResolutionSystemEventTx({
      tx: input.tx,
      tenantId: input.acceptedTruth.tenant_id,
      proposalId,
      sourceCandidateId: input.acceptedTruth.source_candidate_id,
      acceptedRecordType: input.acceptedTruth.accepted_record_type,
      acceptedRecordId: input.acceptedTruth.accepted_record_id,
      eventType: "active_link_preserved",
      eventKey: `active-link-preserved:${proposalId}:${currentLink.id}:${input.acceptedTruth.accepted_record_id}`,
      previousProposalState: linkedProposal?.proposal_state ?? null,
      newProposalState: "accepted",
      canonicalEntityId: currentLink.canonicalEntityId,
      canonicalEntityDisplayName: currentLink.canonicalEntityDisplayName,
      summary: `Auto-sync preserved the active entity link to "${currentLink.canonicalEntityDisplayName}" while restoring the current reconciliation context.`
    });

    return;
  }
  const supersededRows = await input.tx<ProposalRow[]>`
    select
      proposal.id,
      proposal.tenant_id,
      proposal.source_candidate_id,
      proposal.accepted_record_type,
      proposal.accepted_record_id,
      proposal.entity_type,
      proposal.proposal_kind,
      proposal.proposal_state,
      proposal.proposed_display_name,
      proposal.normalized_display_name,
      proposal.target_entity_id,
      target_entity.display_name as target_entity_display_name,
      proposal.resolved_entity_id,
      resolved_entity.display_name as resolved_entity_display_name,
      proposal.confidence_score,
      proposal.rationale,
      proposal.match_category,
      proposal.match_strategy,
      proposal.matching_candidates_json,
      proposal.current_proposal,
      proposal.superseded_at,
      proposal.review_note,
      proposal.reviewed_at,
      proposal.reviewed_by_actor_id,
      proposal.reviewed_by_actor_name,
      proposal.created_at,
      proposal.updated_at
    from entity_resolution_proposals proposal
    left join canonical_entities target_entity on target_entity.id = proposal.target_entity_id
    left join canonical_entities resolved_entity on resolved_entity.id = proposal.resolved_entity_id
    where proposal.source_candidate_id = ${input.acceptedTruth.source_candidate_id}
      and proposal.current_proposal = true
      and proposal.proposal_key <> ${proposalKey}
  `;
  const proposalId = matchingProposal?.id ?? createId("entityprop");

  await input.tx`
    insert into entity_resolution_proposals (
      id,
      tenant_id,
      source_candidate_id,
      accepted_record_type,
      accepted_record_id,
      proposal_key,
      entity_type,
      proposal_kind,
      proposal_state,
      proposed_display_name,
      normalized_display_name,
      target_entity_id,
      resolved_entity_id,
      confidence_score,
      rationale,
      match_category,
      match_strategy,
      matching_candidates_json,
      current_proposal,
      metadata_json
    ) values (
      ${proposalId},
      ${input.acceptedTruth.tenant_id},
      ${input.acceptedTruth.source_candidate_id},
      ${input.acceptedTruth.accepted_record_type},
      ${input.acceptedTruth.accepted_record_id},
      ${proposalKey},
      ${draft.entityType},
      ${matchOutcome.proposalKind},
      'pending_review',
      ${draft.proposedDisplayName},
      ${draft.normalizedDisplayName},
      ${matchOutcome.targetEntityId},
      null,
      ${matchOutcome.confidence},
      ${matchOutcome.rationale},
      ${matchOutcome.matchCategory},
      ${matchOutcome.matchStrategy},
      ${JSON.stringify(matchOutcome.matchingCandidates)}::jsonb,
      true,
      ${JSON.stringify({
        artifactBlobId: input.acceptedTruth.artifact_blob_id,
        artifactFileName: input.acceptedTruth.artifact_file_name,
        documentTitleHints,
        identityHints,
        sourceSemanticObjectId: input.acceptedTruth.source_semantic_object_id,
        sourceSemanticObjectType: input.acceptedTruth.source_semantic_object_type
      })}::jsonb
    )
    on conflict (source_candidate_id, proposal_key)
    do update set
      accepted_record_type = excluded.accepted_record_type,
      accepted_record_id = excluded.accepted_record_id,
      entity_type = excluded.entity_type,
      proposal_kind = excluded.proposal_kind,
      proposed_display_name = excluded.proposed_display_name,
      normalized_display_name = excluded.normalized_display_name,
      target_entity_id = excluded.target_entity_id,
      confidence_score = excluded.confidence_score,
      rationale = excluded.rationale,
      match_category = excluded.match_category,
      match_strategy = excluded.match_strategy,
      matching_candidates_json = excluded.matching_candidates_json,
      current_proposal = true,
      superseded_at = null,
      metadata_json = excluded.metadata_json,
      updated_at = now()
  `;

  if (matchingProposal && !matchingProposal.current_proposal) {
    await recordEntityResolutionSystemEventTx({
      tx: input.tx,
      tenantId: input.acceptedTruth.tenant_id,
      proposalId,
      sourceCandidateId: input.acceptedTruth.source_candidate_id,
      acceptedRecordType: input.acceptedTruth.accepted_record_type,
      acceptedRecordId: input.acceptedTruth.accepted_record_id,
      eventType: "proposal_reactivated",
      eventKey: `proposal-reactivated:${proposalId}:${matchingProposal.superseded_at?.toISOString() ?? matchingProposal.updated_at.toISOString()}`,
      previousProposalState: matchingProposal.proposal_state,
      newProposalState: "pending_review",
      summary: "Auto-sync reactivated this proposal because the same accepted-truth reconciliation context became current again."
    });
  }

  await input.tx`
    update entity_resolution_proposals
    set
      current_proposal = false,
      superseded_at = coalesce(superseded_at, now()),
      updated_at = now()
    where source_candidate_id = ${input.acceptedTruth.source_candidate_id}
      and current_proposal = true
      and proposal_key <> ${proposalKey}
  `;

  for (const row of supersededRows) {
    const newProposalState: EntityResolutionProposalState = row.proposal_state === "accepted" ? "accepted" : "superseded";
    await recordEntityResolutionSystemEventTx({
      tx: input.tx,
      tenantId: row.tenant_id,
      proposalId: row.id,
      sourceCandidateId: row.source_candidate_id,
      acceptedRecordType: row.accepted_record_type,
      acceptedRecordId: row.accepted_record_id,
      eventType: "proposal_superseded",
      eventKey: `proposal-superseded:${row.id}:replacement:${proposalKey}`,
      previousProposalState: row.proposal_state,
      newProposalState,
      canonicalEntityId: row.resolved_entity_id,
      canonicalEntityDisplayName: row.resolved_entity_display_name,
      summary:
        row.proposal_state === "accepted" && row.resolved_entity_display_name
          ? `Auto-sync moved this previously accepted proposal for "${row.resolved_entity_display_name}" out of the current lane because a newer reconciliation context became current for the same source candidate.`
          : "Auto-sync superseded this proposal because a newer reconciliation context became current for the same source candidate."
    });
  }
}

async function supersedeStaleProposalsTx(input: { retainedSourceCandidateIds: string[]; tx: DbTransaction }): Promise<void> {
  const staleProposals =
    input.retainedSourceCandidateIds.length === 0
      ? await input.tx<ProposalRow[]>`
          select
            proposal.id,
            proposal.tenant_id,
            proposal.source_candidate_id,
            proposal.accepted_record_type,
            proposal.accepted_record_id,
            proposal.entity_type,
            proposal.proposal_kind,
            proposal.proposal_state,
            proposal.proposed_display_name,
            proposal.normalized_display_name,
            proposal.target_entity_id,
            target_entity.display_name as target_entity_display_name,
            proposal.resolved_entity_id,
            resolved_entity.display_name as resolved_entity_display_name,
            proposal.confidence_score,
            proposal.rationale,
            proposal.match_category,
            proposal.match_strategy,
            proposal.matching_candidates_json,
            proposal.current_proposal,
            proposal.superseded_at,
            proposal.review_note,
            proposal.reviewed_at,
            proposal.reviewed_by_actor_id,
            proposal.reviewed_by_actor_name,
            proposal.created_at,
            proposal.updated_at
          from entity_resolution_proposals proposal
          left join canonical_entities target_entity on target_entity.id = proposal.target_entity_id
          left join canonical_entities resolved_entity on resolved_entity.id = proposal.resolved_entity_id
          where proposal.current_proposal = true
        `
      : await input.tx<ProposalRow[]>`
          select
            proposal.id,
            proposal.tenant_id,
            proposal.source_candidate_id,
            proposal.accepted_record_type,
            proposal.accepted_record_id,
            proposal.entity_type,
            proposal.proposal_kind,
            proposal.proposal_state,
            proposal.proposed_display_name,
            proposal.normalized_display_name,
            proposal.target_entity_id,
            target_entity.display_name as target_entity_display_name,
            proposal.resolved_entity_id,
            resolved_entity.display_name as resolved_entity_display_name,
            proposal.confidence_score,
            proposal.rationale,
            proposal.match_category,
            proposal.match_strategy,
            proposal.matching_candidates_json,
            proposal.current_proposal,
            proposal.superseded_at,
            proposal.review_note,
            proposal.reviewed_at,
            proposal.reviewed_by_actor_id,
            proposal.reviewed_by_actor_name,
            proposal.created_at,
            proposal.updated_at
          from entity_resolution_proposals proposal
          left join canonical_entities target_entity on target_entity.id = proposal.target_entity_id
          left join canonical_entities resolved_entity on resolved_entity.id = proposal.resolved_entity_id
          where proposal.current_proposal = true
            and proposal.source_candidate_id not in ${input.tx(input.retainedSourceCandidateIds)}
        `;

  if (staleProposals.length === 0) {
    return;
  }

  const staleSourceCandidateIds = Array.from(new Set(staleProposals.map((proposal) => proposal.source_candidate_id)));
  const staleLinks = await input.tx<LinkRow[]>`
    select
      link.id,
      link.source_candidate_id,
      link.accepted_record_type,
      link.accepted_record_id,
      link.canonical_entity_id,
      entity.entity_type as canonical_entity_type,
      entity.display_name as canonical_entity_display_name,
      link.link_status,
      link.link_reason,
      link.reviewer_actor_id,
      link.reviewer_actor_name,
      link.review_note,
      link.created_at,
      link.updated_at
    from accepted_truth_entity_links link
    join canonical_entities entity on entity.id = link.canonical_entity_id
    where link.source_candidate_id in ${input.tx(staleSourceCandidateIds)}
  `;
  const staleAliases = await input.tx<AliasCleanupRow[]>`
    select
      alias.id,
      alias.source_candidate_id,
      alias.canonical_entity_id,
      entity.display_name as canonical_entity_display_name,
      alias.alias_value
    from canonical_entity_aliases alias
    join canonical_entities entity on entity.id = alias.canonical_entity_id
    where alias.source_candidate_id in ${input.tx(staleSourceCandidateIds)}
  `;
  const linkBySourceCandidateId = new Map(staleLinks.map((row) => [row.source_candidate_id, row]));
  const aliasesBySourceCandidateId = new Map<string, AliasCleanupRow[]>();
  for (const row of staleAliases) {
    const aliases = aliasesBySourceCandidateId.get(row.source_candidate_id ?? "") ?? [];
    aliases.push(row);
    aliasesBySourceCandidateId.set(row.source_candidate_id ?? "", aliases);
  }
  const eventAt = new Date();

  if (input.retainedSourceCandidateIds.length === 0) {
    await input.tx`
      update entity_resolution_proposals
      set
        current_proposal = false,
        proposal_state = case
          when proposal_state = 'accepted' then proposal_state
          else 'superseded'
        end,
        superseded_at = coalesce(superseded_at, ${eventAt}),
        updated_at = now()
      where current_proposal = true
    `;

    await input.tx`delete from accepted_truth_entity_links`;
    await input.tx`delete from canonical_entity_aliases`;
  } else {
    await input.tx`
      update entity_resolution_proposals
      set
        current_proposal = false,
        proposal_state = case
          when proposal_state = 'accepted' then proposal_state
          else 'superseded'
        end,
        superseded_at = coalesce(superseded_at, ${eventAt}),
        updated_at = now()
      where current_proposal = true
        and source_candidate_id not in ${input.tx(input.retainedSourceCandidateIds)}
    `;

    await input.tx`
      delete from accepted_truth_entity_links
      where source_candidate_id not in ${input.tx(input.retainedSourceCandidateIds)}
    `;

    await input.tx`
      delete from canonical_entity_aliases
      where source_candidate_id is not null
        and source_candidate_id not in ${input.tx(input.retainedSourceCandidateIds)}
    `;
  }

  for (const proposal of staleProposals) {
    const newProposalState: EntityResolutionProposalState = proposal.proposal_state === "accepted" ? "accepted" : "superseded";
    await recordEntityResolutionSystemEventTx({
      tx: input.tx,
      tenantId: proposal.tenant_id,
      proposalId: proposal.id,
      sourceCandidateId: proposal.source_candidate_id,
      acceptedRecordType: proposal.accepted_record_type,
      acceptedRecordId: proposal.accepted_record_id,
      eventType: "proposal_superseded",
      eventKey: `proposal-superseded:${proposal.id}:missing-source:${eventAt.toISOString()}`,
      previousProposalState: proposal.proposal_state,
      newProposalState,
      canonicalEntityId: proposal.resolved_entity_id,
      canonicalEntityDisplayName: proposal.resolved_entity_display_name,
      summary:
        proposal.proposal_state === "accepted" && proposal.resolved_entity_display_name
          ? `Auto-sync removed this proposal from the current lane because its source accepted truth disappeared; the latest accepted attachment to "${proposal.resolved_entity_display_name}" is now only historical.`
          : "Auto-sync marked this proposal non-current because its source accepted truth disappeared from the supported reconciliation set."
    });

    const staleLink = linkBySourceCandidateId.get(proposal.source_candidate_id);
    if (staleLink) {
      await recordEntityResolutionSystemEventTx({
        tx: input.tx,
        tenantId: proposal.tenant_id,
        proposalId: proposal.id,
        sourceCandidateId: proposal.source_candidate_id,
        acceptedRecordType: proposal.accepted_record_type,
        acceptedRecordId: proposal.accepted_record_id,
        eventType: "stale_link_removed",
        eventKey: `stale-link-removed:${proposal.id}:${staleLink.id}`,
        previousProposalState: proposal.proposal_state,
        newProposalState,
        canonicalEntityId: staleLink.canonical_entity_id,
        canonicalEntityDisplayName: staleLink.canonical_entity_display_name,
        summary: `Auto-sync removed the stale entity link to "${staleLink.canonical_entity_display_name}" because the source accepted truth is no longer available for reconciliation.`
      });
    }

    const removedAliases = aliasesBySourceCandidateId.get(proposal.source_candidate_id) ?? [];
    if (removedAliases.length > 0) {
      const aliasValues = removedAliases.map((alias) => alias.alias_value);
      const aliasHash = createHash("sha1")
        .update(removedAliases.map((alias) => alias.id).sort().join("|"))
        .digest("hex");
      await recordEntityResolutionSystemEventTx({
        tx: input.tx,
        tenantId: proposal.tenant_id,
        proposalId: proposal.id,
        sourceCandidateId: proposal.source_candidate_id,
        acceptedRecordType: proposal.accepted_record_type,
        acceptedRecordId: proposal.accepted_record_id,
        eventType: "alias_removed",
        eventKey: `alias-removed:${proposal.id}:${aliasHash}`,
        previousProposalState: proposal.proposal_state,
        newProposalState,
        canonicalEntityId: removedAliases[0]?.canonical_entity_id ?? null,
        canonicalEntityDisplayName: removedAliases[0]?.canonical_entity_display_name ?? null,
        aliasValues,
        summary:
          aliasValues.length === 1
            ? `Auto-sync removed observed alias "${aliasValues[0]}" because the source accepted truth is no longer available for reconciliation.`
            : `Auto-sync removed ${aliasValues.length} source-observed aliases because the source accepted truth is no longer available for reconciliation.`
      });
    }
  }
}

async function loadProposalRow(proposalId: string): Promise<ProposalRow | null> {
  const sql = getDb();
  const [row] = await sql<ProposalRow[]>`
    select
      proposal.id,
      proposal.tenant_id,
      proposal.source_candidate_id,
      proposal.accepted_record_type,
      proposal.accepted_record_id,
      proposal.entity_type,
      proposal.proposal_kind,
      proposal.proposal_state,
      proposal.proposed_display_name,
      proposal.normalized_display_name,
      proposal.target_entity_id,
      target_entity.display_name as target_entity_display_name,
      proposal.resolved_entity_id,
      resolved_entity.display_name as resolved_entity_display_name,
      proposal.confidence_score,
      proposal.rationale,
      proposal.match_category,
      proposal.match_strategy,
      proposal.matching_candidates_json,
      proposal.current_proposal,
      proposal.superseded_at,
      proposal.review_note,
      proposal.reviewed_at,
      proposal.reviewed_by_actor_id,
      proposal.reviewed_by_actor_name,
      proposal.created_at,
      proposal.updated_at
    from entity_resolution_proposals proposal
    left join canonical_entities target_entity on target_entity.id = proposal.target_entity_id
    left join canonical_entities resolved_entity on resolved_entity.id = proposal.resolved_entity_id
    where proposal.id = ${proposalId}
    limit 1
  `;

  return row ?? null;
}

async function loadReconciliationHistoryByProposalId(proposalId: string): Promise<EntityResolutionHistoryEntry[]> {
  const sql = getDb();
  const rows = await sql<HistoryRow[]>`
    select
      id,
      proposal_id,
      source_candidate_id,
      accepted_record_type,
      accepted_record_id,
      previous_proposal_state,
      new_proposal_state,
      action,
      chosen_entity_id,
      chosen_entity_display_name,
      chosen_entity_created,
      created_alias_values_json,
      review_note,
      reviewer_actor_id,
      reviewer_actor_name,
      created_at
    from entity_resolution_history
    where proposal_id = ${proposalId}
    order by created_at desc, id desc
  `;

  return rows.map(mapReconciliationHistoryEntry);
}

async function loadSystemEventsByProposalId(proposalId: string): Promise<EntityResolutionSystemEvent[]> {
  const sql = getDb();
  const rows = await sql<SystemEventRow[]>`
    select
      id,
      proposal_id,
      source_candidate_id,
      accepted_record_type,
      accepted_record_id,
      event_type,
      previous_proposal_state,
      new_proposal_state,
      canonical_entity_id,
      canonical_entity_display_name,
      alias_values_json,
      summary,
      created_at
    from entity_resolution_system_events
    where proposal_id = ${proposalId}
    order by created_at desc, id desc
  `;

  return rows.map(mapSystemEvent);
}

async function loadMatchingEntities(entityIds: string[]): Promise<CanonicalEntitySummary[]> {
  const sql = getDb();
  return loadCanonicalEntitiesWithAliasesTx({
    entityIds,
    tx: sql as unknown as DbTransaction
  });
}

async function clearSourceCandidateEntityArtifactsTx(input: {
  sourceCandidateId: string;
  tx: DbTransaction;
}): Promise<void> {
  await input.tx`
    delete from accepted_truth_entity_links
    where source_candidate_id = ${input.sourceCandidateId}
  `;
  await input.tx`
    delete from canonical_entity_aliases
    where source_candidate_id = ${input.sourceCandidateId}
  `;
}

async function recordEntityResolutionSystemEventTx(input: {
  acceptedRecordId: string;
  acceptedRecordType: string;
  aliasValues?: string[];
  canonicalEntityDisplayName?: string | null;
  canonicalEntityId?: string | null;
  eventKey: string;
  eventType: EntityResolutionSystemEventType;
  newProposalState?: EntityResolutionProposalState | null;
  previousProposalState?: EntityResolutionProposalState | null;
  proposalId: string;
  sourceCandidateId: string;
  summary: string;
  tenantId: string;
  tx: DbTransaction;
}): Promise<void> {
  await input.tx`
    insert into entity_resolution_system_events (
      id,
      tenant_id,
      proposal_id,
      source_candidate_id,
      accepted_record_type,
      accepted_record_id,
      event_type,
      event_key,
      previous_proposal_state,
      new_proposal_state,
      canonical_entity_id,
      canonical_entity_display_name,
      alias_values_json,
      summary
    ) values (
      ${createId("entityevent")},
      ${input.tenantId},
      ${input.proposalId},
      ${input.sourceCandidateId},
      ${input.acceptedRecordType},
      ${input.acceptedRecordId},
      ${input.eventType},
      ${input.eventKey},
      ${input.previousProposalState ?? null},
      ${input.newProposalState ?? null},
      ${input.canonicalEntityId ?? null},
      ${input.canonicalEntityDisplayName ?? null},
      ${JSON.stringify(input.aliasValues ?? [])}::jsonb,
      ${input.summary}
    )
    on conflict (event_key) do nothing
  `;
}

async function recordEntityResolutionHistoryTx(input: {
  acceptedRecordId: string;
  acceptedRecordType: string;
  action: EntityResolutionDecisionAction;
  actorId: string;
  actorName: string;
  chosenEntityCreated: boolean;
  chosenEntityDisplayName: string | null;
  chosenEntityId: string | null;
  createdAliasValues: string[];
  note: string | null;
  previousProposalState: EntityResolutionProposalState;
  proposalId: string;
  sourceCandidateId: string;
  tenantId: string;
  tx: DbTransaction;
}): Promise<void> {
  await input.tx`
    insert into entity_resolution_history (
      id,
      tenant_id,
      proposal_id,
      source_candidate_id,
      accepted_record_type,
      accepted_record_id,
      previous_proposal_state,
      new_proposal_state,
      action,
      chosen_entity_id,
      chosen_entity_display_name,
      chosen_entity_created,
      created_alias_values_json,
      review_note,
      reviewer_actor_id,
      reviewer_actor_name,
      metadata_json
    ) values (
      ${createId("entityhist")},
      ${input.tenantId},
      ${input.proposalId},
      ${input.sourceCandidateId},
      ${input.acceptedRecordType},
      ${input.acceptedRecordId},
      ${input.previousProposalState},
      ${input.action === "accept" ? "accepted" : "rejected"},
      ${input.action},
      ${input.chosenEntityId},
      ${input.chosenEntityDisplayName},
      ${input.chosenEntityCreated},
      ${JSON.stringify(input.createdAliasValues)}::jsonb,
      ${input.note},
      ${input.actorId},
      ${input.actorName},
      ${JSON.stringify({
        statusChange: `${input.previousProposalState}->${input.action === "accept" ? "accepted" : "rejected"}`
      })}::jsonb
    )
  `;
}

function buildAcceptedRecordSnapshotFromCandidate(input: {
  candidateDetail: NonNullable<Awaited<ReturnType<typeof getCandidateReviewDetail>>>;
  proposal: ProposalRow;
}): AcceptedRecordSummary {
  const acceptedValue =
    input.candidateDetail.candidate.reviewedValue !== null
      ? input.candidateDetail.candidate.reviewedValue
      : input.candidateDetail.candidate.candidateValue;

  return {
    id: input.proposal.accepted_record_id,
    acceptedRecordType: input.proposal.accepted_record_type as AcceptedRecordType,
    sourceCandidateId: input.candidateDetail.candidate.id,
    artifactBlobId: input.candidateDetail.candidate.artifactBlobId,
    fieldName: input.candidateDetail.candidate.fieldName,
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

async function upsertObservedAliasTx(input: {
  actorId: string;
  actorName: string;
  note: string | null;
  proposal: ProposalRow;
  resolvedEntity: CanonicalEntitySummary;
  tx: DbTransaction;
}): Promise<string[]> {
  await input.tx`
    delete from canonical_entity_aliases
    where source_candidate_id = ${input.proposal.source_candidate_id}
  `;

  const [sourceCandidate] = await input.tx<{
    artifact_blob_id: string;
    candidate_value_json: unknown;
    field_name: string;
    reviewed_value_json: unknown | null;
    tenant_id: string;
  }[]>`
    select
      tenant_id,
      artifact_blob_id,
      field_name,
      candidate_value_json,
      reviewed_value_json
    from extracted_candidates
    where id = ${input.proposal.source_candidate_id}
    limit 1
  `;

  if (!sourceCandidate) {
    return [];
  }

  const aliasInputs: Array<{
    aliasType: CanonicalEntityAliasSummary["aliasType"];
    aliasValue: string;
    normalizedAliasValue: string;
  }> = [];
  const reviewedSourceValue = normalizeJsonValue(sourceCandidate.reviewed_value_json ?? sourceCandidate.candidate_value_json);

  if (input.proposal.entity_type === "organization" && sourceCandidate.field_name === "probable_originating_organization_domain") {
    if (typeof reviewedSourceValue === "string") {
      const normalizedDomain = normalizeDomain(reviewedSourceValue);
      if (normalizedDomain) {
        aliasInputs.push({
          aliasType: "observed_domain",
          aliasValue: normalizedDomain,
          normalizedAliasValue: normalizedDomain
        });
      }
    }
  } else if (input.proposal.normalized_display_name !== input.resolvedEntity.normalizedName) {
    aliasInputs.push({
      aliasType: "observed_name",
      aliasValue: input.proposal.proposed_display_name,
      normalizedAliasValue: input.proposal.normalized_display_name
    });
  }

  for (const aliasInput of aliasInputs) {
    await input.tx`
      insert into canonical_entity_aliases (
        id,
        tenant_id,
        canonical_entity_id,
        entity_type,
        alias_type,
        alias_value,
        normalized_alias_value,
        source_candidate_id,
        source_accepted_record_type,
        source_accepted_record_id,
        source_artifact_blob_id,
        reviewer_actor_id,
        reviewer_actor_name,
        review_note,
        metadata_json
      ) values (
        ${createId("entityalias")},
        ${sourceCandidate.tenant_id},
        ${input.resolvedEntity.id},
        ${input.proposal.entity_type},
        ${aliasInput.aliasType},
        ${aliasInput.aliasValue},
        ${aliasInput.normalizedAliasValue},
        ${input.proposal.source_candidate_id},
        ${input.proposal.accepted_record_type},
        ${input.proposal.accepted_record_id},
        ${sourceCandidate.artifact_blob_id},
        ${input.actorId},
        ${input.actorName},
        ${input.note},
        ${JSON.stringify({
          resolutionProposalId: input.proposal.id,
          resolvedEntityDisplayName: input.resolvedEntity.displayName
        })}::jsonb
      )
      on conflict (canonical_entity_id, normalized_alias_value, source_candidate_id)
      do update set
        reviewer_actor_id = excluded.reviewer_actor_id,
        reviewer_actor_name = excluded.reviewer_actor_name,
        review_note = excluded.review_note,
        metadata_json = excluded.metadata_json,
        updated_at = now()
    `;
  }

  return aliasInputs.map((alias) => alias.aliasValue);
}

export class EntityResolutionNotFoundError extends Error {
  constructor(proposalId: string) {
    super(`Entity resolution proposal ${proposalId} was not found.`);
    this.name = "EntityResolutionNotFoundError";
  }
}

export class EntityResolutionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityResolutionConflictError";
  }
}

export async function syncEntityResolutionProposalsFromAcceptedTruth(): Promise<void> {
  const sql = getDb();
  const supportedTruths = await loadSupportedAcceptedTruthRows();
  const retainedSourceCandidateIds = supportedTruths.map((row) => row.source_candidate_id);

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    for (const truth of supportedTruths) {
      await syncEntityResolutionProposalTx({
        tx,
        acceptedTruth: truth
      });
    }

    await supersedeStaleProposalsTx({
      tx,
      retainedSourceCandidateIds
    });
  });
}

export async function listCanonicalEntities(): Promise<CanonicalEntitySummary[]> {
  const sql = getDb();
  return loadCanonicalEntitiesWithAliasesTx({
    tx: sql as unknown as DbTransaction
  });
}

export async function listEntityResolutionQueue(): Promise<EntityResolutionQueueResponse> {
  await syncEntityResolutionProposalsFromAcceptedTruth();

  const sql = getDb();
  const rows = await sql<QueueRow[]>`
    select
      proposal.id,
      proposal.tenant_id,
      proposal.source_candidate_id,
      proposal.accepted_record_type,
      proposal.accepted_record_id,
      proposal.entity_type,
      proposal.proposal_kind,
      proposal.proposal_state,
      proposal.proposed_display_name,
      proposal.normalized_display_name,
      proposal.target_entity_id,
      target_entity.display_name as target_entity_display_name,
      proposal.resolved_entity_id,
      resolved_entity.display_name as resolved_entity_display_name,
      proposal.confidence_score,
      proposal.rationale,
      proposal.match_category,
      proposal.match_strategy,
      proposal.matching_candidates_json,
      proposal.current_proposal,
      proposal.superseded_at,
      proposal.review_note,
      proposal.reviewed_at,
      proposal.reviewed_by_actor_id,
      proposal.reviewed_by_actor_name,
      proposal.created_at,
      proposal.updated_at,
      coalesce(record.field_name, candidate.field_name) as accepted_field_name,
      coalesce(record.accepted_value_json, candidate.reviewed_value_json, candidate.candidate_value_json) as accepted_value_json,
      candidate.artifact_blob_id,
      artifact.original_file_name as artifact_file_name,
      link.id as current_link_id,
      link.accepted_record_type as current_link_accepted_record_type,
      link.accepted_record_id as current_link_accepted_record_id,
      link.canonical_entity_id as current_link_canonical_entity_id,
      linked_entity.entity_type as current_link_canonical_entity_type,
      linked_entity.display_name as current_link_canonical_entity_display_name,
      link.link_status as current_link_link_status,
      link.link_reason as current_link_link_reason,
      link.reviewer_actor_id as current_link_reviewer_actor_id,
      link.reviewer_actor_name as current_link_reviewer_actor_name,
      link.review_note as current_link_review_note,
      link.created_at as current_link_created_at,
      link.updated_at as current_link_updated_at
    from entity_resolution_proposals proposal
    join extracted_candidates candidate on candidate.id = proposal.source_candidate_id
    join artifact_blobs artifact on artifact.id = candidate.artifact_blob_id
    left join accepted_classification_records record on record.id = proposal.accepted_record_id
    left join accepted_truth_entity_links link on link.source_candidate_id = proposal.source_candidate_id
      and link.link_status = 'active'
    left join canonical_entities linked_entity on linked_entity.id = link.canonical_entity_id
    left join canonical_entities target_entity on target_entity.id = proposal.target_entity_id
    left join canonical_entities resolved_entity on resolved_entity.id = proposal.resolved_entity_id
    where proposal.current_proposal = true
       or proposal.superseded_at is not null
    order by
      case
        when proposal.current_proposal then 0
        else 1
      end asc,
      case proposal.proposal_state
        when 'pending_review' then 0
        when 'accepted' then 1
        when 'rejected' then 2
        when 'superseded' then 3
        else 4
      end asc,
      case proposal.match_category
        when 'exact_match' then 0
        when 'alias_match' then 1
        when 'possible_match' then 2
        when 'create_new' then 3
        when 'active_link' then 4
        else 5
      end asc,
      proposal.updated_at desc
  `;

  const items = rows.map(mapQueueItem);
  const currentItems = items.filter((item) => item.proposal.currentProposal);
  const [{ count: canonicalEntityCount }] = await sql<{ count: number | string }[]>`
    select count(*)::int as count
    from canonical_entities
  `;
  const [{ count: unsupportedAcceptedTruthCount }] = await sql<{ count: number | string }[]>`
    with all_records as (
      select id, 'fact'::text as accepted_record_type from accepted_fact_records
      union all
      select id, 'relationship'::text as accepted_record_type from accepted_relationship_records
      union all
      select id, 'classification'::text as accepted_record_type from accepted_classification_records
    ),
    supported_records as (
      select id
      from accepted_classification_records
      where field_name in (
        'probable_asset_name_mention',
        'probable_originating_organization_name',
        'probable_originating_organization_domain'
      )
        and jsonb_typeof(accepted_value_json) = 'string'
    )
    select count(*)::int as count
    from all_records
    where accepted_record_type <> 'classification'
       or id not in (select id from supported_records)
  `;

  return {
    counts: {
      pendingReview: currentItems.filter((item) => item.proposal.proposalState === "pending_review").length,
      accepted: currentItems.filter((item) => item.proposal.proposalState === "accepted").length,
      rejected: currentItems.filter((item) => item.proposal.proposalState === "rejected").length,
      superseded: items.filter((item) => item.proposal.proposalState === "superseded").length,
      attachedAcceptedTruths: currentItems.filter((item) => item.currentEntityLink !== null).length,
      unattachedAcceptedTruths: currentItems.filter((item) => item.currentEntityLink === null).length,
      unsupportedAcceptedTruths: asNumber(unsupportedAcceptedTruthCount),
      canonicalEntities: asNumber(canonicalEntityCount)
    },
    items
  };
}

export async function getEntityResolutionDetail(proposalId: string): Promise<EntityResolutionDetail | null> {
  await syncEntityResolutionProposalsFromAcceptedTruth();

  const proposalRow = await loadProposalRow(proposalId);
  if (!proposalRow) {
    return null;
  }

  const acceptedTruthDetail = await getAcceptedTruthDetail({
    acceptedRecordId: proposalRow.accepted_record_id,
    acceptedRecordType: proposalRow.accepted_record_type as AcceptedRecordType
  });
  const proposal = mapProposal(proposalRow);
  const currentEntityLink = await loadCurrentLinkBySourceCandidateId(proposalRow.source_candidate_id);
  const matchingEntityIds = Array.from(new Set(proposal.matchingCandidates.map((candidate) => candidate.entityId)));
  const matchingEntities = await loadMatchingEntities(matchingEntityIds);
  const reconciliationHistory = await loadReconciliationHistoryByProposalId(proposalId);
  const systemEvents = await loadSystemEventsByProposalId(proposalId);

  if (!acceptedTruthDetail) {
    const candidateReviewDetail = await getCandidateReviewDetail(proposalRow.source_candidate_id);
    if (!candidateReviewDetail) {
      return null;
    }

    return {
      proposal,
      acceptedRecord: buildAcceptedRecordSnapshotFromCandidate({
        proposal: proposalRow,
        candidateDetail: candidateReviewDetail
      }),
      artifact: candidateReviewDetail.artifact,
      sourceCandidate: candidateReviewDetail.candidate,
      provenanceAnchors: candidateReviewDetail.provenanceAnchors,
      reviewHistory: candidateReviewDetail.reviewHistory,
      reconciliationHistory,
      systemEvents,
      currentEntityLink,
      matchingEntities
    };
  }

  return {
    proposal,
    acceptedRecord: acceptedTruthDetail.acceptedRecord,
    artifact: acceptedTruthDetail.artifact,
    sourceCandidate: acceptedTruthDetail.sourceCandidate,
    provenanceAnchors: acceptedTruthDetail.provenanceAnchors,
    reviewHistory: acceptedTruthDetail.reviewHistory,
    reconciliationHistory,
    systemEvents,
    currentEntityLink,
    matchingEntities
  };
}

export async function reviewEntityResolutionProposal(input: {
  action: EntityResolutionDecisionAction;
  actorId: string;
  actorName: string;
  displayName?: string;
  entityType?: CanonicalEntityType;
  note?: string | null;
  proposalId: string;
  targetEntityId?: string;
}): Promise<EntityResolutionDetail> {
  await syncEntityResolutionProposalsFromAcceptedTruth();

  const sql = getDb();
  const note = input.note?.trim() ? input.note.trim() : null;

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;
    const [proposal] = await tx<ProposalRow[]>`
    select
      proposal.id,
      proposal.tenant_id,
      proposal.source_candidate_id,
        proposal.accepted_record_type,
        proposal.accepted_record_id,
        proposal.entity_type,
        proposal.proposal_kind,
        proposal.proposal_state,
        proposal.proposed_display_name,
        proposal.normalized_display_name,
        proposal.target_entity_id,
        null::text as target_entity_display_name,
        proposal.resolved_entity_id,
        null::text as resolved_entity_display_name,
        proposal.confidence_score,
        proposal.rationale,
        proposal.match_category,
        proposal.match_strategy,
        proposal.matching_candidates_json,
        proposal.current_proposal,
        proposal.superseded_at,
        proposal.review_note,
        proposal.reviewed_at,
        proposal.reviewed_by_actor_id,
        proposal.reviewed_by_actor_name,
        proposal.created_at,
        proposal.updated_at
      from entity_resolution_proposals proposal
      where proposal.id = ${input.proposalId}
      limit 1
      for update
    `;

    if (!proposal) {
      throw new EntityResolutionNotFoundError(input.proposalId);
    }

    if (!proposal.current_proposal) {
      throw new EntityResolutionConflictError("Proposal is no longer current and cannot be reviewed.");
    }

    if (proposal.proposal_state === "superseded") {
      throw new EntityResolutionConflictError("Proposal was superseded and cannot be reviewed.");
    }

    if (input.action === "reject") {
      await clearSourceCandidateEntityArtifactsTx({
        tx,
        sourceCandidateId: proposal.source_candidate_id
      });

      await tx`
        update entity_resolution_proposals
        set
          proposal_state = 'rejected',
          resolved_entity_id = null,
          review_note = ${note},
          reviewed_at = now(),
          reviewed_by_actor_id = ${input.actorId},
          reviewed_by_actor_name = ${input.actorName},
          updated_at = now()
        where id = ${proposal.id}
      `;

      await recordEntityResolutionHistoryTx({
        tx,
        tenantId: proposal.tenant_id,
        proposalId: proposal.id,
        sourceCandidateId: proposal.source_candidate_id,
        acceptedRecordType: proposal.accepted_record_type,
        acceptedRecordId: proposal.accepted_record_id,
        previousProposalState: proposal.proposal_state,
        action: "reject",
        chosenEntityId: null,
        chosenEntityDisplayName: null,
        chosenEntityCreated: false,
        createdAliasValues: [],
        actorId: input.actorId,
        actorName: input.actorName,
        note
      });
      return;
    }

    const intendedEntityType = input.entityType ?? proposal.entity_type;
    const matchingCandidates = normalizePayload<EntityResolutionMatchCandidate[]>(proposal.matching_candidates_json);
    const wantsCreateNewEntity = !input.targetEntityId && Boolean(input.displayName?.trim());
    let createdEntity = false;
    let resolvedEntity: CanonicalEntitySummary | null = null;

    if (input.targetEntityId) {
      const existingEntity = await loadCanonicalEntityByIdTx({
        entityId: input.targetEntityId,
        tx
      });

      if (!existingEntity) {
        throw new EntityResolutionConflictError("Selected canonical entity does not exist.");
      }

      if (existingEntity.entityType !== intendedEntityType) {
        throw new EntityResolutionConflictError("Selected canonical entity has the wrong type for this proposal.");
      }

      resolvedEntity = existingEntity;
    } else if (!wantsCreateNewEntity && proposal.target_entity_id) {
      const targetEntity = await loadCanonicalEntityByIdTx({
        entityId: proposal.target_entity_id,
        tx
      });

      if (!targetEntity) {
        throw new EntityResolutionConflictError("Suggested canonical entity no longer exists.");
      }

      resolvedEntity = targetEntity;
    } else if (!wantsCreateNewEntity && proposal.proposal_kind === "attach_to_existing" && matchingCandidates.length > 1) {
      throw new EntityResolutionConflictError(
        "Proposal matches multiple canonical entities. Select a specific entity or clear the selection to create a new entity."
      );
    } else {
      const displayName = (input.displayName ?? proposal.proposed_display_name).trim();
      if (!displayName) {
        throw new EntityResolutionConflictError("Display name is required when creating a canonical entity.");
      }

      const [createdEntityRow] = await tx<CanonicalEntityRow[]>`
        insert into canonical_entities (
          id,
          tenant_id,
          entity_type,
          display_name,
          normalized_name,
          status,
          metadata_json
        )
        select
          ${createId("entity")},
          candidate.tenant_id,
          ${intendedEntityType},
          ${displayName},
          ${normalizeEntityName(displayName)},
          'active',
          ${JSON.stringify({
            createdFromAcceptedRecordId: proposal.accepted_record_id,
            sourceCandidateId: proposal.source_candidate_id
          })}::jsonb
        from extracted_candidates candidate
        where candidate.id = ${proposal.source_candidate_id}
        limit 1
        returning
          id,
          entity_type,
          display_name,
          normalized_name,
          status,
          metadata_json,
          created_at,
          updated_at
      `;

      resolvedEntity = mapCanonicalEntity(createdEntityRow, []);
      createdEntity = true;
    }

    if (!resolvedEntity) {
      throw new EntityResolutionConflictError("Resolved canonical entity could not be determined for this proposal.");
    }

    await tx`
      insert into accepted_truth_entity_links (
        id,
        tenant_id,
        source_candidate_id,
        accepted_record_type,
        accepted_record_id,
        canonical_entity_id,
        entity_type,
        link_status,
        link_reason,
        resolution_proposal_id,
        reviewer_actor_id,
        reviewer_actor_name,
        review_note
      )
      select
        ${createId("entitylink")},
        candidate.tenant_id,
        ${proposal.source_candidate_id},
        ${proposal.accepted_record_type},
        ${proposal.accepted_record_id},
        ${resolvedEntity.id},
        ${intendedEntityType},
        'active',
        'entity_resolution_review',
        ${proposal.id},
        ${input.actorId},
        ${input.actorName},
        ${note}
      from extracted_candidates candidate
      where candidate.id = ${proposal.source_candidate_id}
      limit 1
      on conflict (source_candidate_id)
      do update set
        accepted_record_type = excluded.accepted_record_type,
        accepted_record_id = excluded.accepted_record_id,
        canonical_entity_id = excluded.canonical_entity_id,
        entity_type = excluded.entity_type,
        link_status = excluded.link_status,
        link_reason = excluded.link_reason,
        resolution_proposal_id = excluded.resolution_proposal_id,
        reviewer_actor_id = excluded.reviewer_actor_id,
        reviewer_actor_name = excluded.reviewer_actor_name,
        review_note = excluded.review_note,
        updated_at = now()
    `;

    const createdAliasValues = await upsertObservedAliasTx({
      tx,
      proposal,
      resolvedEntity,
      actorId: input.actorId,
      actorName: input.actorName,
      note
    });

    await tx`
      update entity_resolution_proposals
      set
        proposal_state = 'accepted',
        target_entity_id = ${resolvedEntity.id},
        resolved_entity_id = ${resolvedEntity.id},
        review_note = ${note},
        reviewed_at = now(),
        reviewed_by_actor_id = ${input.actorId},
        reviewed_by_actor_name = ${input.actorName},
        updated_at = now()
      where id = ${proposal.id}
    `;

    await recordEntityResolutionHistoryTx({
      tx,
      tenantId: proposal.tenant_id,
      proposalId: proposal.id,
      sourceCandidateId: proposal.source_candidate_id,
      acceptedRecordType: proposal.accepted_record_type,
      acceptedRecordId: proposal.accepted_record_id,
      previousProposalState: proposal.proposal_state,
      action: "accept",
      chosenEntityId: resolvedEntity.id,
      chosenEntityDisplayName: resolvedEntity.displayName,
      chosenEntityCreated: createdEntity,
      createdAliasValues,
      actorId: input.actorId,
      actorName: input.actorName,
      note
    });
  });

  const detail = await getEntityResolutionDetail(input.proposalId);
  if (!detail) {
    throw new EntityResolutionNotFoundError(input.proposalId);
  }

  return detail;
}
