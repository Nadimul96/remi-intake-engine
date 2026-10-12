import type {
  NormalizedContentSummary,
  ProvenanceAnchorSummary,
  ProvenanceAnchorsSummary,
  WorksheetCell
} from "@remi/domain";

import { lineAnchorKey, pageLines, rowAnchorKey, rowText } from "./anchors";

export interface ExtractionContext {
  artifactBlobId: string;
  fileName: string;
  normalizedContent: NormalizedContentSummary;
  provenanceAnchors: ProvenanceAnchorsSummary;
}

/** One citable line of text: a document line, or a worksheet row rendered as text. */
export interface SourceLine {
  text: string;
  anchor: ProvenanceAnchorSummary;
  /** "page 1, line 12" or "Summary!A6:B6" */
  locatorHint: string;
  pageNumber: number | null;
  lineNumber: number | null;
}

export interface SheetRowView {
  rowNumber: number;
  cells: WorksheetCell[];
  anchor: ProvenanceAnchorSummary;
}

export interface SheetView {
  sheetIndex: number;
  name: string;
  rows: SheetRowView[];
  rangeAnchor: ProvenanceAnchorSummary | null;
}

export interface DocumentView {
  context: ExtractionContext;
  lines: SourceLine[];
  sheets: SheetView[];
  /** All text joined with newlines, used for whole-document pattern matching. */
  fullText: string;
}

function anchorIndex(anchors: ProvenanceAnchorSummary[]): Map<string, ProvenanceAnchorSummary> {
  return new Map(anchors.map((anchor) => [`${anchor.anchorKind}::${anchor.ownerId}::${anchor.anchorKey}`, anchor]));
}

export function buildDocumentView(context: ExtractionContext): DocumentView {
  const index = anchorIndex(context.provenanceAnchors.items);
  const lines: SourceLine[] = [];
  const sheets: SheetView[] = [];

  for (const page of context.normalizedContent.documentPages) {
    for (const line of pageLines(page.text)) {
      const anchor = index.get(`text_line::${page.id}::${lineAnchorKey(page.pageNumber, line.lineNumber)}`);
      if (anchor) {
        lines.push({
          text: line.text,
          anchor,
          locatorHint: `page ${page.pageNumber}, line ${line.lineNumber}`,
          pageNumber: page.pageNumber,
          lineNumber: line.lineNumber
        });
      }
    }
  }

  for (const worksheet of context.normalizedContent.worksheets) {
    const rows: SheetRowView[] = [];
    for (const row of worksheet.rows ?? []) {
      const anchor = index.get(`worksheet_row::${worksheet.id}::${rowAnchorKey(worksheet.sheetIndex, row.rowNumber)}`);
      if (!anchor) {
        continue;
      }
      rows.push({ rowNumber: row.rowNumber, cells: row.cells, anchor });
      const first = row.cells[0]?.ref;
      const last = row.cells[row.cells.length - 1]?.ref;
      lines.push({
        text: rowText(row),
        anchor,
        locatorHint: `${worksheet.name}!${first === last ? first : `${first}:${last}`}`,
        pageNumber: null,
        lineNumber: null
      });
    }
    sheets.push({
      sheetIndex: worksheet.sheetIndex,
      name: worksheet.name,
      rows,
      rangeAnchor: index.get(`worksheet_range::${worksheet.id}::sheet:${worksheet.sheetIndex}`) ?? null
    });
  }

  return { context, lines, sheets, fullText: lines.map((line) => line.text).join("\n") };
}
