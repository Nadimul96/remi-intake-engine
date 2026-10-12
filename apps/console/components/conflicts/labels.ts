import type { ConflictKind, ConflictSeverity, ConflictStatus } from "@remi/domain";

import type { Tone } from "../ui/badge";

export const KIND_LABEL: Record<ConflictKind, string> = {
  value_mismatch: "Value mismatch",
  version_conflict: "Version conflict",
  name_variants: "Name variants",
  covenant_breach: "Covenant breach",
  budget_variance: "Budget overrun"
};

export const KIND_DESCRIPTION: Record<ConflictKind, string> = {
  value_mismatch: "The same metric, asset and period disagree across documents.",
  version_conflict: "Underwriting model versions disagree on a deal term.",
  name_variants: "Several names in the corpus resolve to one asset.",
  covenant_breach: "A reported ratio is below a covenant minimum stated in the corpus.",
  budget_variance: "Actuals exceed budget by more than 25%."
};

export const SEVERITY_TONE: Record<ConflictSeverity, Tone> = {
  high: "danger",
  medium: "warning",
  low: "neutral"
};

export const STATUS_TONE: Record<ConflictStatus, Tone> = {
  open: "warning",
  resolved: "success",
  dismissed: "neutral"
};

/** Distinct values in a conflict get distinct swatches so disagreement is visible at a glance. */
export const VALUE_SWATCHES = [
  "bg-accent",
  "bg-warning",
  "bg-danger",
  "bg-success",
  "bg-info-text",
  "bg-muted"
] as const;
