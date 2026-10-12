import type { ConflictKind, ConflictSeverity, ConflictSide } from "@remi/domain";

import { METRICS } from "../metrics";
import { ASSET_NAME_FIELD, type AssetNameRole } from "../rules/asset-identity";
import { METRIC_FIELD_PREFIX, type MetricFactValue } from "../rules/fact-draft";
import { formatValue } from "../values";
import { type AssetClusters, type AssetNameRecord, clusterAssetNames } from "./asset-clusters";

/** The slice of a stored candidate the detector needs. */
export interface CandidateRecord {
  id: string;
  artifactBlobId: string;
  fileName: string;
  fieldName: string;
  candidateValue: unknown;
  extractionMethodDetail: string;
  metadata: Record<string, unknown>;
  provenanceAnchorIds: string[];
  evidence: string;
  locatorHint: string | null;
}

export interface DetectedConflict {
  conflictKey: string;
  kind: ConflictKind;
  severity: ConflictSeverity;
  assetName: string | null;
  metric: string | null;
  period: string | null;
  title: string;
  summary: string;
  sides: ConflictSide[];
}

export const BUDGET_OVERRUN_THRESHOLD_PCT = 25;
const NON_ACTUAL_BASES = new Set(["stabilized", "projected", "pro forma", "proforma", "underwritten"]);

interface Fact {
  record: CandidateRecord;
  value: MetricFactValue;
  asset: string;
}

function isMetricFact(value: unknown): value is MetricFactValue {
  const fact = value as MetricFactValue | null;
  return Boolean(fact) && typeof fact?.metric === "string" && typeof fact.value === "number";
}

/** "Levered IRR" -> "levered IRR": lower-case the first word unless it is an acronym. */
function inSentence(label: string): string {
  const [first, ...rest] = label.split(" ");
  return [first === first.toUpperCase() ? first : first.toLowerCase(), ...rest].join(" ");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function conflictKey(kind: ConflictKind, parts: (string | null)[]): string {
  return [kind, ...parts.map((part) => (part ? slug(part) : "-"))].join(":");
}

function sideLabel(fact: MetricFactValue, fileName: string): string {
  return fact.version ?? fact.basis ?? fact.documentRole?.replaceAll("_", " ") ?? fileName;
}

function factSide(fact: Fact): ConflictSide {
  return {
    candidateId: fact.record.id,
    artifactBlobId: fact.record.artifactBlobId,
    fileName: fact.record.fileName,
    label: sideLabel(fact.value, fact.record.fileName),
    display: fact.value.display,
    value: fact.value.value,
    note: fact.value.basis,
    evidence: fact.record.evidence,
    locatorHint: fact.record.locatorHint,
    provenanceAnchorIds: fact.record.provenanceAnchorIds
  };
}

/** Two readings agree when they are equal at the precision of the coarser one. */
function agree(left: MetricFactValue, right: MetricFactValue): boolean {
  const tolerance = Math.max(left.resolution, right.resolution) / 2 + 1e-9;
  return Math.abs(left.value - right.value) <= tolerance;
}

function spreadSeverity(values: number[], unit: MetricFactValue["unit"]): ConflictSeverity {
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (unit === "percent" || unit === "ratio") {
    return high - low >= (unit === "percent" ? 0.5 : 0.05) ? "high" : "medium";
  }
  return low === 0 || (high - low) / Math.abs(low) >= 0.01 ? "high" : "medium";
}

function describeSpread(values: number[], unit: MetricFactValue["unit"]): string {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = formatValue(high - low, unit === "percent" ? "percent" : unit);
  const relative = unit === "usd" && low !== 0 ? ` (${(((high - low) / Math.abs(low)) * 100).toFixed(1)}%)` : "";
  return `Spread ${unit === "percent" ? `${spread.replace("%", "")} pts` : spread}${relative}.`;
}

function metricConflicts(facts: Fact[]): DetectedConflict[] {
  const groups = new Map<string, Fact[]>();
  for (const fact of facts) {
    const { metric, period } = fact.value;
    if (metric === "budget_variance") {
      continue;
    }
    const scope = period ?? (METRICS[metric]?.dealTerm ? "deal terms" : null);
    if (!scope) {
      continue;
    }
    const key = `${fact.asset}|${metric}|${scope}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }

  const conflicts: DetectedConflict[] = [];
  for (const group of groups.values()) {
    const crossDocumentDisagreement = group.some((left) =>
      group.some(
        (right) => left.record.artifactBlobId !== right.record.artifactBlobId && !agree(left.value, right.value)
      )
    );
    if (!crossDocumentDisagreement) {
      continue;
    }

    const { asset } = group[0];
    const { metric, period, label, unit } = group[0].value;
    const models = group.filter((fact) => fact.value.documentRole === "underwriting_model");
    const modelsDisagree = models.some((left) => models.some((right) => !agree(left.value, right.value)));
    const kind: ConflictKind = modelsDisagree ? "version_conflict" : "value_mismatch";
    const values = group.map((fact) => fact.value.value);
    const documents = new Set(group.map((fact) => fact.record.artifactBlobId)).size;
    const readings = group.map((fact) => `${fact.value.display} (${fact.record.fileName})`).join(", ");

    conflicts.push({
      conflictKey: conflictKey(kind, [asset, metric, period]),
      kind,
      severity: spreadSeverity(values, unit),
      assetName: asset,
      metric,
      period,
      title:
        kind === "version_conflict"
          ? `Underwriting versions disagree on ${inSentence(label)} for ${asset}`
          : `Conflicting ${inSentence(label)} for ${asset}${period ? ` (${period})` : ""}`,
      summary: `${documents} documents report ${inSentence(label)}${period ? ` for ${period}` : ""}: ${readings}. ${describeSpread(values, unit)}`,
      sides: group.map(factSide)
    });
  }
  return conflicts;
}

function covenantConflicts(facts: Fact[]): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const assets = new Set(facts.map((fact) => fact.asset));

  for (const asset of assets) {
    const minimums = facts.filter((fact) => fact.asset === asset && fact.value.metric === "minimum_dscr");
    if (minimums.length === 0) {
      continue;
    }
    const minimum = Math.max(...minimums.map((fact) => fact.value.value));
    const breaches = facts.filter(
      (fact) =>
        fact.asset === asset &&
        fact.value.metric === "dscr" &&
        fact.value.value < minimum &&
        !NON_ACTUAL_BASES.has((fact.value.basis ?? "").toLowerCase())
    );
    if (breaches.length === 0) {
      continue;
    }

    const periods = [...new Set(breaches.map((fact) => fact.value.period ?? "an unlabeled period"))];
    const lowest = Math.min(...breaches.map((fact) => fact.value.value));
    conflicts.push({
      conflictKey: conflictKey("covenant_breach", [asset, "dscr", null]),
      kind: "covenant_breach",
      severity: "high",
      assetName: asset,
      metric: "dscr",
      period: null,
      title: `DSCR below the ${formatValue(minimum, "ratio")} covenant minimum for ${asset}`,
      summary: `Reported DSCR as low as ${formatValue(lowest, "ratio")} in ${periods.join(", ")}, below the ${formatValue(minimum, "ratio")} minimum stated in ${[...new Set(minimums.map((fact) => fact.record.fileName))].join(", ")}.`,
      sides: [...minimums, ...breaches].map(factSide)
    });
  }
  return conflicts;
}

function budgetConflicts(facts: Fact[]): DetectedConflict[] {
  const groups = new Map<string, Fact[]>();
  for (const fact of facts) {
    const isTotal = /^total$/i.test(fact.value.basis ?? "");
    if (fact.value.metric !== "budget_variance" || fact.value.value < BUDGET_OVERRUN_THRESHOLD_PCT || isTotal) {
      continue;
    }
    const key = `${fact.asset}|${fact.value.period ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }

  return [...groups.values()].map((group) => {
    const { asset } = group[0];
    const { period } = group[0].value;
    const lines = group.map((fact) => `${fact.value.basis} +${fact.value.display}`).join(", ");
    return {
      conflictKey: conflictKey("budget_variance", [asset, null, period]),
      kind: "budget_variance" as const,
      severity: "medium" as const,
      assetName: asset,
      metric: "budget_variance",
      period,
      title: `${group.length} line item${group.length === 1 ? "" : "s"} more than ${BUDGET_OVERRUN_THRESHOLD_PCT}% over budget for ${asset}${period ? ` (${period})` : ""}`,
      summary: `Actuals exceed budget by more than ${BUDGET_OVERRUN_THRESHOLD_PCT}%: ${lines}. Check whether each is one-time or a run-rate change before re-forecasting.`,
      sides: group.map((fact) => ({ ...factSide(fact), label: fact.value.basis ?? "line item" }))
    };
  });
}

const ROLE_LABEL: Record<AssetNameRole, string> = {
  primary: "primary name",
  variant: "variant",
  alias: "declared alias"
};

function nameVariantConflicts(records: CandidateRecord[], clusters: AssetClusters): DetectedConflict[] {
  const bySurface = new Map<string, CandidateRecord>();
  for (const record of records) {
    const surface = String(record.candidateValue);
    const key = surface.toLowerCase();
    const existing = bySurface.get(key);
    if (!existing || (existing.metadata.assetRole !== "primary" && record.metadata.assetRole === "primary")) {
      bySurface.set(key, record);
    }
  }

  return clusters.clusters
    .map((cluster) => {
      const sides = cluster.surfaces
        .map((surface) => bySurface.get(surface.toLowerCase()))
        .filter((record): record is CandidateRecord => Boolean(record))
        .map((record) => ({
          candidateId: record.id,
          artifactBlobId: record.artifactBlobId,
          fileName: record.fileName,
          label: ROLE_LABEL[(record.metadata.assetRole as AssetNameRole) ?? "variant"] ?? "variant",
          display: String(record.candidateValue),
          value: null,
          note: typeof record.metadata.identityName === "string" ? record.metadata.identityName : null,
          evidence: record.evidence,
          locatorHint: record.locatorHint,
          provenanceAnchorIds: record.provenanceAnchorIds
        }));
      return { cluster, sides };
    })
    .filter(({ sides }) => sides.length >= 2)
    .map(({ cluster, sides }) => ({
      conflictKey: conflictKey("name_variants", [cluster.canonical, null, null]),
      kind: "name_variants" as const,
      severity: "low" as const,
      assetName: cluster.canonical,
      metric: null,
      period: null,
      title: `${cluster.canonical} appears under ${sides.length} names`,
      summary: `These names resolve to one asset: ${sides.map((side) => `"${side.display}"`).join(", ")}. Facts filed under any of them are compared together.`,
      sides
    }));
}

/**
 * Deterministic, corpus-wide conflict detection over extracted candidates.
 * The same input always yields the same conflicts with the same keys, so the
 * store can upsert by key and retire conflicts that no longer reproduce.
 */
export function detectConflicts(records: CandidateRecord[]): DetectedConflict[] {
  const nameRecords = records.filter(
    (record) => record.fieldName === ASSET_NAME_FIELD && typeof record.metadata.assetRole === "string"
  );
  const factRecords = records.filter(
    (record) => record.fieldName.startsWith(METRIC_FIELD_PREFIX) && isMetricFact(record.candidateValue)
  );

  const clusters = clusterAssetNames(
    nameRecords.map(
      (record): AssetNameRecord => ({
        surface: String(record.candidateValue),
        identityName: String(record.metadata.identityName ?? record.candidateValue),
        role: record.metadata.assetRole as AssetNameRole,
        fromFileName: record.extractionMethodDetail === "asset_name_file_name",
        artifactBlobId: record.artifactBlobId
      })
    ),
    factRecords
      .map((record) => (record.candidateValue as MetricFactValue).asset)
      .filter((asset): asset is string => Boolean(asset))
  );

  const facts: Fact[] = factRecords.flatMap((record) => {
    const value = record.candidateValue as MetricFactValue;
    const asset = clusters.canonicalOf(value.asset);
    return asset ? [{ record, value, asset }] : [];
  });

  return [
    ...covenantConflicts(facts),
    ...metricConflicts(facts),
    ...budgetConflicts(facts),
    ...nameVariantConflicts(nameRecords, clusters)
  ].sort((left, right) => left.conflictKey.localeCompare(right.conflictKey));
}
