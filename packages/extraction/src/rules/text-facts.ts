import type { SourceLine } from "../document-view";
import type { CandidateDraft } from "../draft";
import { canonicalMetric, cleanLabel, METRICS } from "../metrics";
import { findPeriod, leadingRowPeriod, splitQuarterPrefix } from "../periods";
import { parseLeadingValue } from "../values";
import { buildFactDraft, type DocumentFacts, resolutionOf } from "./fact-draft";

const KEY_VALUE_LINE = /^[\s\-•*·]*\**\s*([A-Za-z][A-Za-z0-9 &/()'.-]{1,60}?)\s*\**\s*:\s*\**\s*(.+)$/;
const STARTS_WITH_NUMBER = /^[\s(]*-?\$?\s?\d/;
const RATIO_CELL = /(\d+\.\d+)x\b/;
const CURRENCY_CELL = /\$\d[\d,]*(?:\.\d+)?/g;

/** A heading without a value ("FINANCIAL HIGHLIGHTS (Q3 2017)") sets the period for the lines under it. */
function sectionPeriod(line: string): string | null {
  return line.includes(":") ? null : findPeriod(line);
}

function unitAgrees(metric: string, unit: string | null): boolean {
  const expected = METRICS[metric]?.unit;
  return !unit || !expected || unit === expected;
}

/**
 * "Label: value" lines in reports, memos, emails and CSV notes, for tracked metrics.
 * The period comes from the label ("Q2 NOI"), the nearest heading, or the document.
 */
export function keyValueLineFacts(document: DocumentFacts, lines: SourceLine[]): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];
  let currentSection: string | null = null;

  for (const line of lines) {
    if (line.text.includes(" | ")) {
      continue;
    }
    currentSection = sectionPeriod(line.text) ?? currentSection;
    const match = line.text.match(KEY_VALUE_LINE);
    if (!match || !STARTS_WITH_NUMBER.test(match[2].replace(/\*/g, ""))) {
      continue;
    }

    const cleaned = cleanLabel(match[1]);
    const quarter = splitQuarterPrefix(cleaned.label, document.year);
    const canonical = canonicalMetric(quarter.label);
    const parsed = parseLeadingValue(match[2].replace(/\*/g, ""));
    if (!canonical || !parsed || !unitAgrees(canonical.key, parsed.unit)) {
      continue;
    }

    drafts.push(
      buildFactDraft(document, {
        metric: canonical.key,
        label: quarter.label,
        value: parsed.value,
        unit: parsed.unit,
        resolution: resolutionOf(parsed),
        period: quarter.period ?? currentSection ?? document.period,
        basis: canonical.basis ?? cleaned.qualifier,
        anchors: [line.anchor],
        evidence: line.text,
        locatorHint: line.locatorHint,
        ruleDetail: "key_value_line",
        confidence: 0.86,
        extra: { matchedValue: parsed.raw }
      })
    );
  }
  return drafts;
}

/**
 * Fixed-width covenant tables: a header naming DSCR, then rows that start with a period
 * ("2023 (Y3 Actual)  $1,142,000  $943,500*  1.21x"). Each row yields NOI and DSCR for that period.
 */
export function coverageTableFacts(document: DocumentFacts, lines: SourceLine[]): CandidateDraft[] {
  const headerIndex = lines.findIndex((line) => /\bperiod\b/i.test(line.text) && /\bdscr\b/i.test(line.text));
  if (headerIndex < 0) {
    return [];
  }

  const drafts: CandidateDraft[] = [];
  let started = false;
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^[-=_\s]+$/.test(line.text)) {
      continue;
    }
    const period = leadingRowPeriod(line.text);
    const ratio = line.text.match(RATIO_CELL);
    if (!period || !ratio) {
      if (started) {
        break;
      }
      continue;
    }
    started = true;
    const header = lines[headerIndex];
    const shared = {
      period,
      basis: null,
      anchors: [line.anchor, header.anchor],
      evidence: line.text,
      locatorHint: line.locatorHint,
      confidence: 0.9
    };
    drafts.push(
      buildFactDraft(document, {
        ...shared,
        metric: "dscr",
        label: "DSCR",
        value: Number(ratio[1]),
        unit: "ratio",
        resolution: 10 ** -(ratio[1].split(".")[1]?.length ?? 0),
        ruleDetail: "coverage_table_row",
        extra: { matchedValue: ratio[0] }
      })
    );
    const noi = line.text.match(CURRENCY_CELL)?.[0];
    const parsedNoi = noi ? parseLeadingValue(noi) : null;
    if (parsedNoi) {
      drafts.push(
        buildFactDraft(document, {
          ...shared,
          metric: "noi",
          label: "NOI",
          value: parsedNoi.value,
          unit: "usd",
          resolution: resolutionOf(parsedNoi),
          ruleDetail: "coverage_table_row",
          extra: { matchedValue: parsedNoi.raw }
        })
      );
    }
  }
  return drafts;
}
