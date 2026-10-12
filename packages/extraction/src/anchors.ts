import type { NormalizedContentSummary, WorksheetRow } from "@remi/domain";

/** Shape accepted by the provenance anchor store (structurally identical to @remi/db's ProvenanceAnchorInput). */
export interface AnchorDraft {
  ownerType: string;
  ownerId: string;
  anchorKind: string;
  anchorKey: string;
  title: string;
  summary: string;
  locator: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

const MAX_LINES_PER_PAGE = 600;
const MAX_ANCHOR_TEXT = 500;

export function lineAnchorKey(pageNumber: number, lineNumber: number): string {
  return `page:${pageNumber}:line:${lineNumber}`;
}

export function rowAnchorKey(sheetIndex: number, rowNumber: number): string {
  return `sheet:${sheetIndex}:row:${rowNumber}`;
}

export function columnLetters(column: number): string {
  let result = "";
  let remaining = column;
  while (remaining > 0) {
    const current = (remaining - 1) % 26;
    result = String.fromCharCode(65 + current) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

export function rowText(row: WorksheetRow): string {
  return row.cells.map((cell) => cell.text).join(" | ");
}

/** Non-empty lines of a page with their 1-based line numbers (blank lines still count, so numbers match the source). */
export function pageLines(text: string | null | undefined): { lineNumber: number; text: string }[] {
  if (!text) {
    return [];
  }
  return text
    .split("\n")
    .map((line, index) => ({ lineNumber: index + 1, text: line.trim() }))
    .filter((line) => line.text.length > 0)
    .slice(0, MAX_LINES_PER_PAGE);
}

function documentAnchors(content: NormalizedContentSummary): AnchorDraft[] {
  const isPdf = content.document?.sourceFormat === "pdf";

  return content.documentPages.flatMap((page) => {
    const anchors: AnchorDraft[] = [
      {
        ownerType: "document_page",
        ownerId: page.id,
        anchorKind: isPdf ? "pdf_page" : "text_page",
        anchorKey: `page:${page.pageNumber}`,
        title: `Page ${page.pageNumber}`,
        summary: page.textAvailable
          ? `Page ${page.pageNumber} with ${page.charCount} characters of text.`
          : `Page ${page.pageNumber} without native text.`,
        locator: { pageNumber: page.pageNumber },
        metadata: { charCount: page.charCount, textAvailable: page.textAvailable }
      }
    ];

    if (isPdf && page.textPreview) {
      anchors.push({
        ownerType: "document_page",
        ownerId: page.id,
        anchorKind: "pdf_text_section",
        anchorKey: `page:${page.pageNumber}:section:1`,
        title: `Page ${page.pageNumber} text preview`,
        summary: page.textPreview,
        locator: { pageNumber: page.pageNumber, sectionIndex: 1 },
        metadata: { previewLength: page.textPreview.length }
      });
    }

    for (const line of pageLines(page.text)) {
      anchors.push({
        ownerType: "document_page",
        ownerId: page.id,
        anchorKind: "text_line",
        anchorKey: lineAnchorKey(page.pageNumber, line.lineNumber),
        title: `Page ${page.pageNumber}, line ${line.lineNumber}`,
        summary: line.text.slice(0, MAX_ANCHOR_TEXT),
        locator: { pageNumber: page.pageNumber, lineNumber: line.lineNumber },
        metadata: {}
      });
    }

    return anchors;
  });
}

function emailAnchors(content: NormalizedContentSummary): AnchorDraft[] {
  const anchors: AnchorDraft[] = [];

  if (content.emailThread) {
    anchors.push({
      ownerType: "email_thread",
      ownerId: content.emailThread.id,
      anchorKind: "email_thread",
      anchorKey: content.emailThread.threadKey,
      title: content.emailThread.subject ?? "Email thread",
      summary: `${content.emailThread.messageCount} message(s) in thread.`,
      locator: { threadKey: content.emailThread.threadKey },
      metadata: { messageCount: content.emailThread.messageCount }
    });
  }

  for (const message of content.emailMessages) {
    anchors.push({
      ownerType: "email_message",
      ownerId: message.id,
      anchorKind: "email_header",
      anchorKey: `message:${message.position}:headers`,
      title: message.subject ?? `Email message ${message.position + 1}`,
      summary: `Headers for message ${message.position + 1}.`,
      locator: { messagePosition: message.position, sentAt: message.sentAt, sentAtRaw: message.sentAtRaw },
      metadata: {
        attachmentCount: message.attachmentCount,
        cc: message.cc,
        from: message.sender,
        messageIdHeader: message.messageIdHeader,
        to: message.to
      }
    });

    if (message.bodyPreview) {
      anchors.push({
        ownerType: "email_message",
        ownerId: message.id,
        anchorKind: "email_body",
        anchorKey: `message:${message.position}:body`,
        title: `Message ${message.position + 1} body`,
        summary: message.bodyPreview,
        locator: { bodyPart: "text/plain", messagePosition: message.position },
        metadata: { previewLength: message.bodyPreview.length }
      });
    }
  }

  for (const attachment of content.attachments) {
    anchors.push({
      ownerType: "attachment",
      ownerId: attachment.id,
      anchorKind: "email_attachment",
      anchorKey: `attachment:${attachment.partIndex}`,
      title: attachment.fileName ?? `Attachment ${attachment.partIndex + 1}`,
      summary: `Attachment ${attachment.partIndex + 1}${attachment.contentType ? ` (${attachment.contentType})` : ""}.`,
      locator: { partIndex: attachment.partIndex },
      metadata: {
        contentType: attachment.contentType,
        promotedArtifactBlobId: attachment.promotedArtifactBlobId,
        promotionStatus: attachment.promotionStatus,
        sha256: attachment.sha256,
        sizeBytes: attachment.sizeBytes
      }
    });
  }

  return anchors;
}

function workbookAnchors(content: NormalizedContentSummary): AnchorDraft[] {
  const anchors: AnchorDraft[] = [];

  for (const worksheet of content.worksheets) {
    const endColumn = worksheet.maxColumn ? columnLetters(worksheet.maxColumn) : null;
    const rangeRef = endColumn && worksheet.maxRow ? `A1:${endColumn}${worksheet.maxRow}` : null;

    anchors.push({
      ownerType: "worksheet",
      ownerId: worksheet.id,
      anchorKind: "worksheet_range",
      anchorKey: `sheet:${worksheet.sheetIndex}`,
      title: worksheet.name,
      summary: rangeRef ?? `Worksheet ${worksheet.name}`,
      locator: { rangeRef, sheetIndex: worksheet.sheetIndex, sheetName: worksheet.name },
      metadata: { maxColumn: worksheet.maxColumn, maxRow: worksheet.maxRow, tableCount: worksheet.tableCount }
    });

    for (const row of worksheet.rows ?? []) {
      const first = row.cells[0]?.ref;
      const last = row.cells[row.cells.length - 1]?.ref;
      anchors.push({
        ownerType: "worksheet",
        ownerId: worksheet.id,
        anchorKind: "worksheet_row",
        anchorKey: rowAnchorKey(worksheet.sheetIndex, row.rowNumber),
        title: `${worksheet.name}, row ${row.rowNumber}`,
        summary: rowText(row).slice(0, MAX_ANCHOR_TEXT),
        locator: {
          rangeRef: first && last ? `${first}:${last}` : null,
          rowNumber: row.rowNumber,
          sheetIndex: worksheet.sheetIndex,
          sheetName: worksheet.name
        },
        metadata: { cells: row.cells }
      });
    }
  }

  for (const table of content.structuredTables) {
    anchors.push({
      ownerType: "structured_table",
      ownerId: table.id,
      anchorKind: "structured_table_range",
      anchorKey: table.tableKey,
      title: table.name,
      summary: table.ref ?? table.name,
      locator: { rangeRef: table.ref },
      metadata: { headerRowCount: table.headerRowCount, tableKey: table.tableKey }
    });
  }

  return anchors;
}

/**
 * Every unit a candidate can cite: pages, lines, messages, attachments, sheets and rows.
 * Line and row anchors carry their own source text in `summary`, which is what makes
 * citations checkable (a cited value must literally appear in its anchor).
 */
export function buildProvenanceAnchors(content: NormalizedContentSummary): AnchorDraft[] {
  switch (content.contentKind) {
    case "document":
      return documentAnchors(content);
    case "email":
      return emailAnchors(content);
    case "workbook":
      return workbookAnchors(content);
    default:
      return [];
  }
}
