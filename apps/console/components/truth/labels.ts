import type { AcceptedRecordType, AcceptedTruthFilter, ExtractedCandidateType } from "@remi/domain";

import { humanize } from "../../lib/format";

export const TRUTH_FILTERS: AcceptedTruthFilter[] = ["all", "fact", "relationship", "classification"];

export const FILTER_LABEL: Record<AcceptedTruthFilter, string> = {
  all: "All",
  fact: "Facts",
  relationship: "Relationships",
  classification: "Classifications"
};

export const RECORD_TYPE_LABEL: Record<AcceptedRecordType, string> = {
  fact: "Fact",
  relationship: "Relationship",
  classification: "Classification"
};

export const RECORD_TYPE_DESCRIPTION: Record<AcceptedRecordType, string> = {
  fact: "A reviewed metric such as NOI, occupancy or a loan term.",
  relationship: "A reviewed link between an asset and an organization.",
  classification: "A reviewed label for what a document is about, such as the asset it names."
};

/** The candidate type a reviewer accepts to produce each kind of accepted record. */
export const CANDIDATE_TYPE_FOR: Record<AcceptedRecordType, ExtractedCandidateType> = {
  fact: "metric_fact_candidate",
  relationship: "relationship_assertion_candidate",
  classification: "classification_candidate"
};

/** The `type` filter value the Review page uses for each kind of accepted record. */
export const REVIEW_TYPE_FOR: Record<AcceptedRecordType, string> = {
  fact: "metric",
  relationship: "relationship",
  classification: "classification"
};

/** "metric.landscaping_grounds" -> "Landscaping grounds"; "probable_asset_name_mention" -> "Asset name mention". */
export function fieldLabel(fieldName: string): string {
  return humanize(fieldName.replace(/^metric\./, "").replace(/^probable_/, ""));
}

export function reviewHref(candidateId: string): string {
  return `/review?status=all&id=${encodeURIComponent(candidateId)}`;
}
