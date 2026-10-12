import type { WorksheetCell } from "@remi/domain";

import type { SheetRowView, SheetView } from "../document-view";
import type { CandidateDraft } from "../draft";
import { canonicalMetric, cleanLabel, slugMetric } from "../metrics";
import { isMonthHeader, periodFromMonthHeaders } from "../periods";
import { parseLeadingValue, parseNumericCell } from "../values";
import { buildFactDraft, type DocumentFacts, resolutionOf } from "./fact-draft";

function cellAt(row: SheetRowView, column: number): WorksheetCell | undefined {
  return row.cells.find((cell) => cell.column === column);
}

function headerColumn(row: SheetRowView, pattern: RegExp): number | null {
  return row.cells.find((cell) => pattern.test(cell.text.trim()))?.column ?? null;
}

function monthHeaderIndex(sheet: SheetView): number {
  return sheet.rows.findIndex((row) => row.cells.filter((cell) => isMonthHeader(cell.text)).length >= 12);
}

/** The fiscal year an operating statement covers, which also dates the notes written under it. */
export function statementPeriod(sheet: SheetView): string | null {
  const headerIndex = monthHeaderIndex(sheet);
  return headerIndex < 0 ? null : periodFromMonthHeaders(sheet.rows[headerIndex].cells.map((cell) => cell.text));
}

/**
 * T-12 style operating statements: a header of twelve months plus a Total column.
 * Every line item's annual total becomes a fact for that fiscal year, cited to its row.
 */
export function operatingStatementFacts(document: DocumentFacts, sheet: SheetView): CandidateDraft[] {
  const headerIndex = monthHeaderIndex(sheet);
  if (headerIndex < 0) {
    return [];
  }
  const header = sheet.rows[headerIndex];
  const period = statementPeriod(sheet);
  const totalColumn = headerColumn(header, /^total$/i);
  if (!period || !totalColumn) {
    return [];
  }

  const drafts: CandidateDraft[] = [];
  for (const row of sheet.rows.slice(headerIndex + 1)) {
    const labelCell = cellAt(row, 1);
    const totalCell = cellAt(row, totalColumn);
    const parsed = totalCell ? parseNumericCell(totalCell.text) : null;
    if (!labelCell || !totalCell || !parsed || parseNumericCell(labelCell.text)) {
      continue;
    }
    const { label } = cleanLabel(labelCell.text);
    const canonical = canonicalMetric(label);
    drafts.push(
      buildFactDraft(document, {
        metric: canonical?.key ?? slugMetric(label),
        label,
        value: Math.abs(parsed.value),
        unit: "usd",
        resolution: resolutionOf(parsed),
        period,
        basis: canonical?.basis ?? null,
        anchors: [row.anchor, header.anchor],
        evidence: `${labelCell.text} — ${header.cells.find((cell) => cell.column === totalColumn)?.text}: ${totalCell.text}`,
        locatorHint: `${sheet.name}!${totalCell.ref}`,
        ruleDetail: "operating_statement_total_column",
        confidence: 0.95,
        extra: { cellRef: totalCell.ref, rowNumber: row.rowNumber, sheetName: sheet.name }
      })
    );
  }
  return drafts;
}

/** Rent rolls: count units by status and derive physical occupancy, citing the header row and the sheet. */
export function rentRollFacts(document: DocumentFacts, sheet: SheetView): CandidateDraft[] {
  const headerIndex = sheet.rows.findIndex(
    (row) => headerColumn(row, /^unit( #| number)?$/i) !== null && headerColumn(row, /^status$/i) !== null
  );
  if (headerIndex < 0) {
    return [];
  }
  const header = sheet.rows[headerIndex];
  const statusColumn = headerColumn(header, /^status$/i) as number;
  const statuses = sheet.rows
    .slice(headerIndex + 1)
    .map((row) => cellAt(row, statusColumn)?.text.trim().toLowerCase())
    .filter((status): status is string => Boolean(status));
  if (statuses.length === 0) {
    return [];
  }

  const occupied = statuses.filter((status) => status.startsWith("occupied")).length;
  const total = statuses.length;
  const occupancy = Math.round((occupied / total) * 1000) / 10;
  const anchors = [header.anchor, ...(sheet.rangeAnchor ? [sheet.rangeAnchor] : [])];
  const evidence = `${occupied} of ${total} unit rows have Status = Occupied`;
  const base = {
    anchors,
    evidence,
    locatorHint: `${sheet.name}, ${total} unit rows`,
    period: document.period,
    basis: "rent roll count",
    confidence: 0.92,
    extra: { occupiedUnits: occupied, totalUnits: total, sheetName: sheet.name }
  };

  return [
    buildFactDraft(document, {
      ...base,
      metric: "units",
      label: "Units",
      value: total,
      unit: "count",
      resolution: 1,
      basis: null,
      ruleDetail: "rent_roll_row_count"
    }),
    buildFactDraft(document, {
      ...base,
      metric: "occupied_units",
      label: "Occupied units",
      value: occupied,
      unit: "count",
      resolution: 1,
      ruleDetail: "rent_roll_status_count"
    }),
    buildFactDraft(document, {
      ...base,
      metric: "physical_occupancy",
      label: "Physical occupancy",
      value: occupancy,
      unit: "percent",
      resolution: 0.1,
      ruleDetail: "rent_roll_status_ratio"
    })
  ];
}

/** Budget-vs-actual sheets: one fact per overspent line item, valued as percent over budget. */
export function budgetVarianceFacts(document: DocumentFacts, sheet: SheetView): CandidateDraft[] {
  const headerIndex = sheet.rows.findIndex(
    (row) => headerColumn(row, /budget/i) !== null && headerColumn(row, /actual/i) !== null
  );
  if (headerIndex < 0) {
    return [];
  }
  const header = sheet.rows[headerIndex];
  const budgetColumn = headerColumn(header, /budget/i) as number;
  const actualColumn = headerColumn(header, /actual/i) as number;
  const drafts: CandidateDraft[] = [];

  for (const row of sheet.rows.slice(headerIndex + 1)) {
    const label = cellAt(row, 1)?.text.trim();
    const budgetCell = cellAt(row, budgetColumn);
    const actualCell = cellAt(row, actualColumn);
    const budget = budgetCell ? parseNumericCell(budgetCell.text) : null;
    const actual = actualCell ? parseNumericCell(actualCell.text) : null;
    if (!label || !budget || !actual || !actualCell || budget.value <= 0 || actual.value <= budget.value) {
      continue;
    }
    const variancePct = Math.round(((actual.value - budget.value) / budget.value) * 1000) / 10;
    drafts.push(
      buildFactDraft(document, {
        metric: "budget_variance",
        label: `${label} vs budget`,
        value: variancePct,
        unit: "percent",
        resolution: 0.1,
        period: document.period,
        basis: label,
        anchors: [row.anchor, header.anchor],
        evidence: `${label}: budget ${budgetCell?.text}, actual ${actualCell.text}`,
        locatorHint: `${sheet.name}!${actualCell.ref}`,
        ruleDetail: "budget_vs_actual_columns",
        confidence: 0.93,
        extra: { budget: budget.value, actual: actual.value, lineItem: label, cellRef: actualCell.ref }
      })
    );
  }
  return drafts;
}

/**
 * Label/value rows ("Purchase Price | $41,200,000") anywhere in a workbook, for tracked
 * metrics only. Rows with more than one number are schedules, not single values, and are skipped.
 */
export function labelValueFacts(document: DocumentFacts, sheet: SheetView): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];
  for (const row of sheet.rows) {
    const [labelCell, valueCell, ...rest] = row.cells;
    if (!labelCell || !valueCell || labelCell.column !== 1 || valueCell.column !== 2) {
      continue;
    }
    if (rest.some((cell) => parseNumericCell(cell.text)) || !/^[\s(]*-?\$?\s?\d/.test(valueCell.text)) {
      continue;
    }
    const { label, qualifier } = cleanLabel(labelCell.text);
    const canonical = canonicalMetric(label);
    const parsed = parseLeadingValue(valueCell.text);
    if (!canonical || !parsed) {
      continue;
    }
    drafts.push(
      buildFactDraft(document, {
        metric: canonical.key,
        label,
        value: parsed.value,
        unit: parsed.unit,
        resolution: resolutionOf(parsed),
        period: document.period,
        basis: canonical.basis ?? qualifier,
        anchors: [row.anchor],
        evidence: `${labelCell.text}: ${valueCell.text}`,
        locatorHint: `${sheet.name}!${valueCell.ref}`,
        ruleDetail: "label_value_row",
        confidence: 0.9,
        extra: { cellRef: valueCell.ref, rowNumber: row.rowNumber, sheetName: sheet.name }
      })
    );
  }
  return drafts;
}
