import type {
  AssetOrganizationRelationshipQueueFilters,
  AssetOrganizationRelationshipQueueItem,
  AssetOrganizationRelationshipType,
  RelationshipAcceptedRecordStatus,
  RelationshipEntityMatchCandidate,
  RelationshipResolutionProposalState,
  RelationshipResolutionReadinessState,
  RelationshipResolutionSystemEventType
} from "@remi/domain";

import type { Tone } from "../ui/badge";

export const TYPE_LABEL: Record<AssetOrganizationRelationshipType, string> = {
  originating_organization_for_asset: "Originator",
  broker_organization_for_asset: "Broker"
};

export const TYPE_TITLE: Record<AssetOrganizationRelationshipType, string> = {
  originating_organization_for_asset: "Originating organization for asset",
  broker_organization_for_asset: "Broker organization for asset"
};

export const STATE_LABEL: Record<RelationshipResolutionProposalState, string> = {
  pending_review: "Pending review",
  accepted: "Attached",
  rejected: "Rejected",
  superseded: "Superseded"
};

export const STATE_TONE: Record<RelationshipResolutionProposalState, Tone> = {
  pending_review: "warning",
  accepted: "success",
  rejected: "danger",
  superseded: "neutral"
};

export const READINESS_LABEL: Record<RelationshipResolutionReadinessState, string> = {
  ready_to_attach: "Ready to attach",
  multiple_candidates: "Multiple candidates",
  missing_asset: "No asset match",
  missing_organization: "No organization match",
  missing_both: "No matches"
};

export const READINESS_TONE: Record<RelationshipResolutionReadinessState, Tone> = {
  ready_to_attach: "success",
  multiple_candidates: "info",
  missing_asset: "warning",
  missing_organization: "warning",
  missing_both: "danger"
};

export const RECORD_STATUS_TONE: Record<RelationshipAcceptedRecordStatus, Tone> = {
  active: "success",
  unsupported: "warning",
  deleted: "danger"
};

export const SIGNAL_LABEL: Record<RelationshipEntityMatchCandidate["signalType"], string> = {
  artifact_entity_link: "Linked in document",
  exact_name_match: "Exact name",
  exact_domain_match: "Exact domain",
  alias_match: "Alias"
};

export const EVENT_LABEL: Record<RelationshipResolutionSystemEventType, string> = {
  proposal_superseded: "Proposal superseded",
  proposal_reactivated: "Proposal reactivated",
  stale_link_removed: "Stale link removed",
  active_link_preserved: "Active link preserved"
};

/** URL search params use short keys; the API takes the domain values. */
export const TYPE_PARAM = {
  all: "all",
  originator: "originating_organization_for_asset",
  broker: "broker_organization_for_asset"
} as const satisfies Record<string, AssetOrganizationRelationshipQueueFilters["relationshipType"]>;

export const LIFECYCLE_VALUES = ["all", "current", "historical"] as const;
export const LINK_VALUES = ["all", "linked", "unlinked"] as const;
export const STATE_VALUES = ["all", "pending_review", "accepted", "rejected", "superseded"] as const;

export type TypeParam = keyof typeof TYPE_PARAM;

export const TYPE_FILTER_LABEL: Record<TypeParam, string> = { all: "All", originator: "Originator", broker: "Broker" };

export interface RelationshipValue {
  assetName: string | null;
  organizationName: string | null;
  organizationDomain: string | null;
}

/** Accepted relationship values carry `{ assetName, organizationName, organizationDomain }`. */
export function readRelationshipValue(value: unknown): RelationshipValue {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (key: string): string | null => {
    const raw = record[key];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  };
  return {
    assetName: text("assetName"),
    organizationName: text("organizationName"),
    organizationDomain: text("organizationDomain")
  };
}

export function organizationLabel(value: RelationshipValue): string {
  return value.organizationName ?? value.organizationDomain ?? "Unnamed organization";
}

/** Mirrors the API's filter semantics so each filter option can show how many proposals it would leave. */
export function matchesFilters(
  item: AssetOrganizationRelationshipQueueItem,
  filters: AssetOrganizationRelationshipQueueFilters
): boolean {
  const { proposal } = item;
  if (filters.relationshipType !== "all" && proposal.relationshipType !== filters.relationshipType) {
    return false;
  }
  if (filters.lifecycle !== "all" && proposal.currentProposal !== (filters.lifecycle === "current")) {
    return false;
  }
  if (filters.linkState !== "all" && (item.currentRelationshipLink !== null) !== (filters.linkState === "linked")) {
    return false;
  }
  return filters.proposalState === "all" || proposal.proposalState === filters.proposalState;
}
