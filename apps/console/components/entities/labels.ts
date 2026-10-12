import type {
  EntityResolutionMatchCategory,
  EntityResolutionMatchSignalType,
  EntityResolutionProposalKind,
  EntityResolutionProposalState,
  EntityResolutionProposalSummary,
  EntityResolutionSystemEventType
} from "@remi/domain";

import type { Tone } from "../ui/badge";

export const STATE_FILTERS = ["pending_review", "accepted", "rejected", "superseded", "all"] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];

export const CATEGORY_FILTERS = [
  "all",
  "exact_match",
  "alias_match",
  "possible_match",
  "create_new",
  "active_link"
] as const;
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

export const STATE_LABEL: Record<EntityResolutionProposalState, string> = {
  pending_review: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded"
};

export const STATE_TONE: Record<EntityResolutionProposalState, Tone> = {
  pending_review: "warning",
  accepted: "success",
  rejected: "danger",
  superseded: "neutral"
};

export const CATEGORY_LABEL: Record<EntityResolutionMatchCategory, string> = {
  active_link: "Active link",
  exact_match: "Exact match",
  alias_match: "Alias match",
  possible_match: "Possible match",
  create_new: "New entity"
};

export const CATEGORY_TONE: Record<EntityResolutionMatchCategory, Tone> = {
  active_link: "success",
  exact_match: "accent",
  alias_match: "info",
  possible_match: "warning",
  create_new: "neutral"
};

export const CATEGORY_DESCRIPTION: Record<EntityResolutionMatchCategory, string> = {
  active_link: "This accepted truth is already linked to a canonical entity.",
  exact_match: "The observed name equals an existing canonical entity name.",
  alias_match: "The observed name equals an alias already recorded on an entity.",
  possible_match: "The observed name overlaps one or more entities. Pick the right one.",
  create_new: "No canonical entity matches this name yet."
};

export const KIND_LABEL: Record<EntityResolutionProposalKind, string> = {
  create_entity: "Create entity",
  attach_to_existing: "Attach to existing"
};

export const SIGNAL_LABEL: Record<EntityResolutionMatchSignalType, string> = {
  active_entity_link: "Active link",
  exact_name_match: "Exact name",
  exact_domain_match: "Exact domain",
  alias_match: "Alias",
  possible_name_overlap: "Name overlap"
};

export const SIGNAL_TONE: Record<EntityResolutionMatchSignalType, Tone> = {
  active_entity_link: "success",
  exact_name_match: "accent",
  exact_domain_match: "accent",
  alias_match: "info",
  possible_name_overlap: "warning"
};

export const SYSTEM_EVENT_LABEL: Record<EntityResolutionSystemEventType, string> = {
  proposal_superseded: "Proposal superseded",
  proposal_reactivated: "Proposal reactivated",
  stale_link_removed: "Stale link removed",
  active_link_preserved: "Active link preserved",
  alias_removed: "Alias removed"
};

/** "probable_asset_name_mention" -> "Asset name mention". */
export function fieldLabel(fieldName: string): string {
  const text = fieldName.replace(/^probable_/, "").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function observedName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

/**
 * A proposal replaced by a newer reconciliation context keeps its old state but is no longer current;
 * the console treats it as superseded so it never shows up as work to do.
 */
export function effectiveState(proposal: EntityResolutionProposalSummary): EntityResolutionProposalState {
  return proposal.currentProposal ? proposal.proposalState : "superseded";
}
