import { buildDocumentView, type ExtractionContext, type SourceLine } from "../document-view";
import type { CandidateDraft } from "../draft";
import { METRICS } from "../metrics";
import { buildFactDraft, type DocumentFacts, type MetricFactValue, resolutionOf } from "../rules/fact-draft";
import { parseLeadingValue } from "../values";
import type { ModelClient } from "./clients";

/**
 * Model-assisted extraction with a hard grounding rule.
 *
 * The model sees the document as numbered lines (each one a provenance anchor) and may
 * only propose tracked metrics. Every proposal must cite one of those lines and quote it;
 * the quote must literally appear in the cited line, and the value must be readable from
 * the quote. Anything else is discarded, never stored. The model can find values the rules
 * missed, but it cannot introduce a number that is not in the source.
 */

const MAX_LINES_PER_REQUEST = 250;
const MAX_CHARS_PER_REQUEST = 24_000;

export interface ModelProposal {
  metric: string;
  value: number;
  period: string | null;
  line: string;
  quote: string;
  basis?: string | null;
}

export type RejectionReason =
  | "unknown_metric"
  | "unknown_line"
  | "quote_not_in_line"
  | "value_not_in_quote"
  | "malformed";

export interface ModelExtractionResult {
  drafts: CandidateDraft[];
  rejected: { reason: RejectionReason; proposal: unknown }[];
  warnings: string[];
}

const SYSTEM_PROMPT = `You extract real-estate metrics from documents for a provenance-tracked review system.
Rules:
- Only report a metric when its value appears verbatim in one of the numbered lines.
- Cite exactly one line id per metric and copy the exact substring that contains the value into "quote".
- Use only these metric keys: ${Object.keys(METRICS).join(", ")}.
- "value" is a plain number: dollars as 41200000, percentages as 5.6, multiples as 1.21.
- "period" is like "FY2020", "Q3 2017", or null for deal terms.
- If nothing qualifies, return {"metrics": []}.
Respond with JSON only: {"metrics": [{"metric": "...", "value": 0, "period": null, "line": "L1", "quote": "...", "basis": null}]}`;

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function chunkLines(lines: SourceLine[]): SourceLine[][] {
  const chunks: SourceLine[][] = [];
  let current: SourceLine[] = [];
  let chars = 0;
  for (const line of lines) {
    if (current.length >= MAX_LINES_PER_REQUEST || chars + line.text.length > MAX_CHARS_PER_REQUEST) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(line);
    chars += line.text.length;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function parseProposals(raw: string): unknown[] | null {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as { metrics?: unknown };
    return Array.isArray(parsed.metrics) ? parsed.metrics : null;
  } catch {
    return null;
  }
}

function asProposal(value: unknown): ModelProposal | null {
  const candidate = value as Partial<ModelProposal> | null;
  if (
    !candidate ||
    typeof candidate.metric !== "string" ||
    typeof candidate.value !== "number" ||
    !Number.isFinite(candidate.value) ||
    typeof candidate.line !== "string" ||
    typeof candidate.quote !== "string"
  ) {
    return null;
  }
  return {
    metric: candidate.metric,
    value: candidate.value,
    period: typeof candidate.period === "string" && candidate.period.trim() ? candidate.period.trim() : null,
    line: candidate.line,
    quote: candidate.quote,
    basis: typeof candidate.basis === "string" && candidate.basis.trim() ? candidate.basis.trim() : null
  };
}

/** The grounding check. Exported so it can be tested on its own. */
export function verifyProposal(
  proposal: ModelProposal,
  linesById: Map<string, SourceLine>
): { ok: true; line: SourceLine; raw: string; resolution: number } | { ok: false; reason: RejectionReason } {
  const definition = METRICS[proposal.metric];
  if (!definition) {
    return { ok: false, reason: "unknown_metric" };
  }
  const line = linesById.get(proposal.line);
  if (!line) {
    return { ok: false, reason: "unknown_line" };
  }
  if (!proposal.quote.trim() || !normalizeForMatch(line.text).includes(normalizeForMatch(proposal.quote))) {
    return { ok: false, reason: "quote_not_in_line" };
  }

  // Every number in the quote is a candidate reading; the proposed value must equal one of them.
  const readings = [
    ...proposal.quote.matchAll(/\(?-?\$?\s?\d[\d,]*(?:\.\d+)?\)?\s?(?:%|x\b|[kKmM]{1,2}\b|million\b)?/g)
  ]
    .map((match) => parseLeadingValue(match[0]))
    .filter((reading): reading is NonNullable<typeof reading> => reading !== null);
  const match = readings.find((reading) => {
    const tolerance = resolutionOf(reading) / 2 + 1e-9;
    return Math.abs(Math.abs(reading.value) - Math.abs(proposal.value)) <= tolerance;
  });
  if (!match || (match.unit && match.unit !== definition.unit)) {
    return { ok: false, reason: "value_not_in_quote" };
  }
  return { ok: true, line, raw: match.raw, resolution: resolutionOf(match) };
}

/**
 * Ask the model for metrics the rules did not already extract, keep only grounded ones.
 * `existing` lets rule-based facts win: a proposal for a metric/period the rules already
 * found is dropped as a duplicate rather than stored twice.
 */
export async function proposeModelCandidates(input: {
  client: ModelClient;
  context: ExtractionContext;
  document: DocumentFacts;
  existing: CandidateDraft[];
}): Promise<ModelExtractionResult> {
  const view = buildDocumentView(input.context);
  const known = new Set(
    input.existing
      .filter((draft) => draft.candidateType === "metric_fact_candidate")
      .map((draft) => {
        const fact = draft.candidateValue as MetricFactValue;
        return `${fact.metric}|${fact.period ?? ""}`;
      })
  );
  const result: ModelExtractionResult = { drafts: [], rejected: [], warnings: [] };

  for (const chunk of chunkLines(view.lines)) {
    const linesById = new Map(chunk.map((line, index) => [`L${index + 1}`, line]));
    const user = [
      `Document: ${input.context.fileName}`,
      input.document.asset ? `Asset: ${input.document.asset}` : null,
      input.document.period ? `Default period: ${input.document.period}` : null,
      "Lines:",
      ...[...linesById].map(([id, line]) => `${id}: ${line.text}`)
    ]
      .filter(Boolean)
      .join("\n");

    let raw: string;
    try {
      raw = await input.client.complete({ system: SYSTEM_PROMPT, user });
    } catch (error) {
      result.warnings.push(`model request failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const proposals = parseProposals(raw);
    if (!proposals) {
      result.warnings.push("model reply was not the expected JSON shape");
      continue;
    }

    for (const item of proposals) {
      const proposal = asProposal(item);
      if (!proposal) {
        result.rejected.push({ reason: "malformed", proposal: item });
        continue;
      }
      const verdict = verifyProposal(proposal, linesById);
      if (!verdict.ok) {
        result.rejected.push({ reason: verdict.reason, proposal: item });
        continue;
      }
      const period = proposal.period ?? (METRICS[proposal.metric].dealTerm ? null : input.document.period);
      const key = `${proposal.metric}|${period ?? ""}`;
      if (known.has(key)) {
        continue;
      }
      known.add(key);
      const draft = buildFactDraft(input.document, {
        metric: proposal.metric,
        label: METRICS[proposal.metric].label,
        value: Math.abs(proposal.value),
        unit: METRICS[proposal.metric].unit,
        resolution: verdict.resolution,
        period,
        basis: proposal.basis ?? null,
        anchors: [verdict.line.anchor],
        evidence: verdict.line.text,
        locatorHint: verdict.line.locatorHint,
        ruleDetail: input.client.label,
        confidence: 0.6,
        extra: { matchedValue: verdict.raw, modelQuote: proposal.quote }
      });
      result.drafts.push({
        ...draft,
        extractionMethod: "model_assisted",
        citationPacket: { ...draft.citationPacket, extractionMethod: "model_assisted" }
      });
    }
  }
  return result;
}
