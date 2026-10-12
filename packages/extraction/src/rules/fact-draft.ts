import type { ProvenanceAnchorSummary } from "@remi/domain";

import type { DocumentView } from "../document-view";
import { buildCandidateDraft, type CandidateDraft } from "../draft";
import { METRICS, metricLabel } from "../metrics";
import { findPeriod, findYear } from "../periods";
import { formatValue, type MetricUnit, type ParsedValue } from "../values";

export type DocumentRole =
  | "underwriting_model"
  | "operating_statement"
  | "rent_roll"
  | "budget"
  | "loan_summary"
  | "report"
  | "correspondence";

/** The structured value stored on every metric_fact_candidate produced by these rules. */
export interface MetricFactValue {
  metric: string;
  label: string;
  value: number;
  unit: MetricUnit | null;
  display: string;
  /** Smallest difference the source can express (0.1 for "5.6%", 100000 for "$41.2M"). */
  resolution: number;
  period: string | null;
  asset: string | null;
  basis: string | null;
  documentRole: DocumentRole | null;
  version: string | null;
}

export const METRIC_FIELD_PREFIX = "metric.";

/** What the whole document tells every fact inside it: asset, default period, role and version. */
export interface DocumentFacts {
  view: DocumentView;
  asset: string | null;
  period: string | null;
  year: string | null;
  role: DocumentRole | null;
  version: string | null;
}

const ROLE_RULES: [RegExp, DocumentRole][] = [
  [/\buw\b|underwriting/i, "underwriting_model"],
  [/\bt-?12\b|operating statement/i, "operating_statement"],
  [/rent\s?roll/i, "rent_roll"],
  [/budget/i, "budget"],
  [/\bloan\b|\bdebt\s?summary/i, "loan_summary"],
  [/\bthread\b|^from:/im, "correspondence"],
  [/report|memo|memorandum/i, "report"]
];

export function describeDocument(
  view: DocumentView,
  asset: string | null,
  fallbackPeriod: string | null = null
): DocumentFacts {
  const fileName = view.context.fileName;
  const spacedName = fileName.replace(/[_-]+/g, " ").replace(/(?<=[a-z])(?=[A-Z])/g, " ");
  const head = view.lines
    .slice(0, 6)
    .map((line) => line.text)
    .join("\n");
  const period = findPeriod(fileName) ?? findPeriod(head) ?? fallbackPeriod;
  const role =
    ROLE_RULES.find(([pattern]) => pattern.test(spacedName))?.[1] ??
    ROLE_RULES.find(([pattern]) => pattern.test(head))?.[1] ??
    null;

  const versionLine = view.lines.slice(0, 10).find((line) => /\bversion:/i.test(line.text));
  const versionText = versionLine?.text.match(/version:\s*([^|]+)/i)?.[1]?.trim();
  const analyst = versionLine?.text.match(/analyst:\s*([^|]+)/i)?.[1]?.trim();
  const fileVersion = fileName.match(/[_\s-](v\d+)(?=[_\s.-])/i)?.[1]?.toLowerCase();
  const version = versionText ? [versionText, analyst].filter(Boolean).join(" · ") : (fileVersion ?? null);

  const dateLine = view.lines.slice(0, 10).find((line) => /^date:/i.test(line.text));
  const year = period?.match(/\d{4}/)?.[0] ?? (dateLine ? findYear(dateLine.text) : null) ?? findYear(head);

  return { view, asset, period, year, role, version };
}

function decimals(raw: string): number {
  return raw.match(/\.(\d+)/)?.[1]?.length ?? 0;
}

export function resolutionOf(parsed: ParsedValue): number {
  const multiplier = /m{1,2}\b|million/i.test(parsed.raw) ? 1e6 : /k\b|thousand/i.test(parsed.raw) ? 1e3 : 1;
  return 10 ** -decimals(parsed.raw) * multiplier;
}

export interface FactInput {
  metric: string;
  label: string;
  value: number;
  unit: MetricUnit | null;
  resolution: number;
  period: string | null;
  basis: string | null;
  anchors: ProvenanceAnchorSummary[];
  evidence: string;
  locatorHint: string;
  ruleDetail: string;
  confidence: number;
  extra?: Record<string, unknown>;
}

export function buildFactDraft(document: DocumentFacts, input: FactInput): CandidateDraft {
  const unit = input.unit ?? METRICS[input.metric]?.unit ?? null;
  const fact: MetricFactValue = {
    metric: input.metric,
    label: metricLabel(input.metric, input.label),
    value: input.value,
    unit,
    display: formatValue(input.value, unit),
    resolution: input.resolution,
    period: input.period,
    asset: document.asset,
    basis: input.basis,
    documentRole: document.role,
    version: document.version
  };
  const scope = [fact.period, fact.basis].filter(Boolean).join(", ");

  return buildCandidateDraft({
    artifactBlobId: document.view.context.artifactBlobId,
    candidateType: "metric_fact_candidate",
    candidateValue: fact,
    confidence: input.confidence,
    evidencePreview: input.evidence,
    extractionMetadata: { locatorHint: input.locatorHint, sourceLabel: input.label, ...input.extra },
    extractionMethod: "rule",
    extractionMethodDetail: input.ruleDetail,
    fieldName: `${METRIC_FIELD_PREFIX}${input.metric}`,
    provenanceAnchors: input.anchors,
    summary: `${fact.label}${scope ? ` (${scope})` : ""} is ${fact.display}${fact.asset ? ` for ${fact.asset}` : ""}.`,
    valueType: "metric"
  });
}

/** Keep the first reading of each metric/period/basis within one document. */
export function firstPerMetric(drafts: CandidateDraft[]): CandidateDraft[] {
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const fact = draft.candidateValue as MetricFactValue;
    const key = `${fact.metric}|${fact.period ?? ""}|${fact.basis ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
