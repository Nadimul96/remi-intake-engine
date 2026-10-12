import type {
  ArtifactParserTarget,
  AttachmentSummary,
  DocumentPageSummary,
  DocumentSummary,
  EmailMessageSummary,
  EmailThreadSummary,
  NormalizedContentKind,
  StructuredTableSummary,
  WorkbookSummary,
  WorksheetRow,
  WorksheetSummary
} from "@remi/domain";
import { createId } from "@remi/domain";
import type postgres from "postgres";

import { getDb, jsonb } from "./client";

interface JsonMap {
  [key: string]: unknown;
}

type DbTransaction = postgres.Sql;

interface NormalizedDocumentInput {
  kind: "document";
  document: {
    metadata: JsonMap;
    pageCount: number;
    pages: Array<{
      charCount: number;
      metadata: JsonMap;
      pageNumber: number;
      text?: string | null;
      textAvailable: boolean;
      textPreview: string | null;
    }>;
    textAvailable: boolean;
    textPreview: string | null;
    title: string | null;
  };
}

interface NormalizedEmailInput {
  kind: "email";
  email: {
    attachments: Array<{
      contentBase64?: string | null;
      contentDisposition: string | null;
      contentId: string | null;
      contentType: string | null;
      fileName: string | null;
      messagePosition: number;
      metadata: JsonMap;
      partIndex: number;
      sha256: string | null;
      sizeBytes: number | null;
    }>;
    messages: Array<{
      attachmentCount: number;
      bodyPreview: string | null;
      cc: string[];
      messageIdHeader: string | null;
      metadata: JsonMap;
      position: number;
      sender: string | null;
      sentAt: string | null;
      sentAtRaw: string | null;
      subject: string | null;
      to: string[];
    }>;
    thread: {
      messageCount: number;
      metadata: JsonMap;
      subject: string | null;
      threadKey: string;
    };
  };
}

interface NormalizedWorkbookInput {
  kind: "workbook";
  workbook: {
    fileName: string;
    metadata: JsonMap;
    sheetCount: number;
    structuredTables: Array<{
      headerRowCount: number | null;
      metadata: JsonMap;
      name: string;
      ref: string | null;
      sheetIndex: number;
      tableKey: string;
    }>;
    worksheets: Array<{
      maxColumn: number | null;
      maxRow: number | null;
      metadata: JsonMap;
      name: string;
      rows?: WorksheetRow[];
      sheetIndex: number;
      tableCount: number;
    }>;
  };
}

export type NormalizedContentInput = NormalizedDocumentInput | NormalizedEmailInput | NormalizedWorkbookInput;

export interface PersistNormalizedContentInput {
  artifactBlobId: string;
  normalizedContent: NormalizedContentInput;
  tenantId: string;
}

export interface AttachmentPromotionUpdateInput {
  attachmentId: string;
  promotedArtifactBlobId: string | null;
  promotionStatus: AttachmentSummary["promotionStatus"];
  promotionSummary: string;
}

export interface NormalizedContentRecords {
  attachments: AttachmentSummary[];
  contentKind: NormalizedContentKind | null;
  document: DocumentSummary | null;
  documentPages: DocumentPageSummary[];
  emailMessages: EmailMessageSummary[];
  emailThread: EmailThreadSummary | null;
  lastNormalizedAt: string | null;
  structuredTables: StructuredTableSummary[];
  workbook: WorkbookSummary | null;
  worksheets: WorksheetSummary[];
}

function asNumber(value: bigint | number | string | null): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return Number(value);
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function asStringArray(value: string[] | string | null): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [value];
    }
  }

  return [];
}

async function deleteMissingDocumentPages(tx: DbTransaction, documentId: string, pageNumbers: number[]): Promise<void> {
  const existing = await tx<{ page_number: number }[]>`
    select page_number
    from document_pages
    where document_id = ${documentId}
  `;

  const stale = existing.map((row) => row.page_number).filter((value) => !pageNumbers.includes(value));

  if (stale.length === 0) {
    return;
  }

  await tx`
    delete from document_pages
    where document_id = ${documentId}
      and page_number in ${tx(stale)}
  `;
}

async function deleteMissingAttachments(
  tx: DbTransaction,
  emailMessageId: string,
  partIndexes: number[]
): Promise<void> {
  const existing = await tx<{ part_index: number }[]>`
    select part_index
    from attachments
    where email_message_id = ${emailMessageId}
  `;

  const stale = existing.map((row) => row.part_index).filter((value) => !partIndexes.includes(value));

  if (stale.length === 0) {
    return;
  }

  await tx`
    delete from attachments
    where email_message_id = ${emailMessageId}
      and part_index in ${tx(stale)}
  `;
}

async function deleteMissingWorksheets(tx: DbTransaction, workbookId: string, sheetIndexes: number[]): Promise<void> {
  const existing = await tx<{ sheet_index: number }[]>`
    select sheet_index
    from worksheets
    where workbook_id = ${workbookId}
  `;

  const stale = existing.map((row) => row.sheet_index).filter((value) => !sheetIndexes.includes(value));

  if (stale.length === 0) {
    return;
  }

  await tx`
    delete from worksheets
    where workbook_id = ${workbookId}
      and sheet_index in ${tx(stale)}
  `;
}

async function deleteMissingStructuredTables(
  tx: DbTransaction,
  worksheetId: string,
  tableKeys: string[]
): Promise<void> {
  const existing = await tx<{ table_key: string }[]>`
    select table_key
    from structured_tables
    where worksheet_id = ${worksheetId}
  `;

  const stale = existing.map((row) => row.table_key).filter((value) => !tableKeys.includes(value));

  if (stale.length === 0) {
    return;
  }

  await tx`
    delete from structured_tables
    where worksheet_id = ${worksheetId}
      and table_key in ${tx(stale)}
  `;
}

function parseSentAt(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export async function persistNormalizedContent(
  input: PersistNormalizedContentInput
): Promise<NormalizedContentRecords> {
  const sql = getDb();

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as DbTransaction;

    if (input.normalizedContent.kind === "document") {
      const { document } = input.normalizedContent;
      const [documentRow] = await tx<
        {
          id: string;
        }[]
      >`
        insert into documents (
          id,
          tenant_id,
          artifact_blob_id,
          title,
          page_count,
          text_available,
          text_preview,
          metadata_json
        ) values (
          ${createId("document")},
          ${input.tenantId},
          ${input.artifactBlobId},
          ${document.title},
          ${document.pageCount},
          ${document.textAvailable},
          ${document.textPreview},
          ${jsonb(document.metadata)}
        )
        on conflict (artifact_blob_id)
        do update set
          title = excluded.title,
          page_count = excluded.page_count,
          text_available = excluded.text_available,
          text_preview = excluded.text_preview,
          metadata_json = excluded.metadata_json,
          updated_at = now()
        returning id
      `;

      for (const page of document.pages) {
        await tx`
          insert into document_pages (
            id,
            document_id,
            page_number,
            text_available,
            char_count,
            text_preview,
            text_content,
            metadata_json
          ) values (
            ${createId("docpage")},
            ${documentRow.id},
            ${page.pageNumber},
            ${page.textAvailable},
            ${page.charCount},
            ${page.textPreview},
            ${page.text ?? null},
            ${jsonb(page.metadata)}
          )
          on conflict (document_id, page_number)
          do update set
            text_available = excluded.text_available,
            char_count = excluded.char_count,
            text_preview = excluded.text_preview,
            text_content = excluded.text_content,
            metadata_json = excluded.metadata_json,
            updated_at = now()
        `;
      }

      await deleteMissingDocumentPages(
        tx,
        documentRow.id,
        document.pages.map((page) => page.pageNumber)
      );
    }

    if (input.normalizedContent.kind === "email") {
      const { email } = input.normalizedContent;
      const [threadRow] = await tx<
        {
          id: string;
        }[]
      >`
        insert into email_threads (
          id,
          tenant_id,
          artifact_blob_id,
          thread_key,
          subject,
          message_count,
          metadata_json
        ) values (
          ${createId("emailthread")},
          ${input.tenantId},
          ${input.artifactBlobId},
          ${email.thread.threadKey},
          ${email.thread.subject},
          ${email.thread.messageCount},
          ${jsonb(email.thread.metadata)}
        )
        on conflict (artifact_blob_id)
        do update set
          thread_key = excluded.thread_key,
          subject = excluded.subject,
          message_count = excluded.message_count,
          metadata_json = excluded.metadata_json,
          updated_at = now()
        returning id
      `;

      const messageIdsByPosition = new Map<number, string>();

      for (const message of email.messages) {
        const [messageRow] = await tx<
          {
            id: string;
          }[]
        >`
          insert into email_messages (
            id,
            email_thread_id,
            artifact_blob_id,
            position,
            message_id_header,
            subject,
            sender,
            to_json,
            cc_json,
            sent_at,
            sent_at_raw,
            body_preview,
            attachment_count,
            metadata_json
          ) values (
            ${createId("emailmsg")},
            ${threadRow.id},
            ${input.artifactBlobId},
            ${message.position},
            ${message.messageIdHeader},
            ${message.subject},
            ${message.sender},
            ${jsonb(message.to)},
            ${jsonb(message.cc)},
            ${parseSentAt(message.sentAt)},
            ${message.sentAtRaw},
            ${message.bodyPreview},
            ${message.attachmentCount},
            ${jsonb(message.metadata)}
          )
          on conflict (artifact_blob_id)
          do update set
            email_thread_id = excluded.email_thread_id,
            position = excluded.position,
            message_id_header = excluded.message_id_header,
            subject = excluded.subject,
            sender = excluded.sender,
            to_json = excluded.to_json,
            cc_json = excluded.cc_json,
            sent_at = excluded.sent_at,
            sent_at_raw = excluded.sent_at_raw,
            body_preview = excluded.body_preview,
            attachment_count = excluded.attachment_count,
            metadata_json = excluded.metadata_json,
            updated_at = now()
          returning id
        `;

        messageIdsByPosition.set(message.position, messageRow.id);
      }

      for (const attachment of email.attachments) {
        const messageId = messageIdsByPosition.get(attachment.messagePosition);

        if (!messageId) {
          continue;
        }

        await tx`
          insert into attachments (
            id,
            email_message_id,
            source_artifact_blob_id,
            promoted_artifact_blob_id,
            promotion_status,
            promotion_summary,
            part_index,
            file_name,
            content_type,
            size_bytes,
            content_disposition,
            content_id,
            sha256,
            metadata_json
          ) values (
            ${createId("attachment")},
            ${messageId},
            ${input.artifactBlobId},
            ${null},
            ${"embedded_only"},
            ${"Attachment exists only inside the parent email blob."},
            ${attachment.partIndex},
            ${attachment.fileName},
            ${attachment.contentType},
            ${attachment.sizeBytes},
            ${attachment.contentDisposition},
            ${attachment.contentId},
            ${attachment.sha256},
            ${jsonb(attachment.metadata)}
          )
          on conflict (email_message_id, part_index)
          do update set
            file_name = excluded.file_name,
            content_type = excluded.content_type,
            size_bytes = excluded.size_bytes,
            content_disposition = excluded.content_disposition,
            content_id = excluded.content_id,
            sha256 = excluded.sha256,
            promoted_artifact_blob_id = coalesce(attachments.promoted_artifact_blob_id, excluded.promoted_artifact_blob_id),
            promotion_status = case
              when attachments.promoted_artifact_blob_id is not null then attachments.promotion_status
              else excluded.promotion_status
            end,
            promotion_summary = case
              when attachments.promoted_artifact_blob_id is not null then attachments.promotion_summary
              else excluded.promotion_summary
            end,
            metadata_json = excluded.metadata_json,
            updated_at = now()
        `;
      }

      const attachmentsByMessage = new Map<number, number[]>();

      for (const attachment of email.attachments) {
        attachmentsByMessage.set(attachment.messagePosition, [
          ...(attachmentsByMessage.get(attachment.messagePosition) ?? []),
          attachment.partIndex
        ]);
      }

      for (const [position, messageId] of messageIdsByPosition.entries()) {
        await deleteMissingAttachments(tx, messageId, attachmentsByMessage.get(position) ?? []);
      }
    }

    if (input.normalizedContent.kind === "workbook") {
      const { workbook } = input.normalizedContent;
      const [workbookRow] = await tx<
        {
          id: string;
        }[]
      >`
        insert into workbooks (
          id,
          tenant_id,
          artifact_blob_id,
          file_name,
          sheet_count,
          metadata_json
        ) values (
          ${createId("workbook")},
          ${input.tenantId},
          ${input.artifactBlobId},
          ${workbook.fileName},
          ${workbook.sheetCount},
          ${jsonb(workbook.metadata)}
        )
        on conflict (artifact_blob_id)
        do update set
          file_name = excluded.file_name,
          sheet_count = excluded.sheet_count,
          metadata_json = excluded.metadata_json,
          updated_at = now()
        returning id
      `;

      const worksheetIdsByIndex = new Map<number, string>();

      for (const worksheet of workbook.worksheets) {
        const [worksheetRow] = await tx<
          {
            id: string;
          }[]
        >`
          insert into worksheets (
            id,
            workbook_id,
            sheet_index,
            name,
            max_row,
            max_column,
            table_count,
            rows_json,
            metadata_json
          ) values (
            ${createId("worksheet")},
            ${workbookRow.id},
            ${worksheet.sheetIndex},
            ${worksheet.name},
            ${worksheet.maxRow},
            ${worksheet.maxColumn},
            ${worksheet.tableCount},
            ${jsonb(worksheet.rows ?? [])},
            ${jsonb(worksheet.metadata)}
          )
          on conflict (workbook_id, sheet_index)
          do update set
            name = excluded.name,
            max_row = excluded.max_row,
            max_column = excluded.max_column,
            table_count = excluded.table_count,
            rows_json = excluded.rows_json,
            metadata_json = excluded.metadata_json,
            updated_at = now()
          returning id
        `;

        worksheetIdsByIndex.set(worksheet.sheetIndex, worksheetRow.id);
      }

      const tablesBySheetIndex = new Map<number, string[]>();

      for (const table of workbook.structuredTables) {
        const worksheetId = worksheetIdsByIndex.get(table.sheetIndex);

        if (!worksheetId) {
          continue;
        }

        await tx`
          insert into structured_tables (
            id,
            worksheet_id,
            table_key,
            name,
            ref,
            header_row_count,
            metadata_json
          ) values (
            ${createId("table")},
            ${worksheetId},
            ${table.tableKey},
            ${table.name},
            ${table.ref},
            ${table.headerRowCount},
            ${jsonb(table.metadata)}
          )
          on conflict (worksheet_id, table_key)
          do update set
            name = excluded.name,
            ref = excluded.ref,
            header_row_count = excluded.header_row_count,
            metadata_json = excluded.metadata_json,
            updated_at = now()
        `;

        tablesBySheetIndex.set(table.sheetIndex, [...(tablesBySheetIndex.get(table.sheetIndex) ?? []), table.tableKey]);
      }

      for (const [sheetIndex, worksheetId] of worksheetIdsByIndex.entries()) {
        await deleteMissingStructuredTables(tx, worksheetId, tablesBySheetIndex.get(sheetIndex) ?? []);
      }

      await deleteMissingWorksheets(
        tx,
        workbookRow.id,
        workbook.worksheets.map((worksheet) => worksheet.sheetIndex)
      );
    }
  });

  return getNormalizedContentRecords(input.artifactBlobId, { includeContent: true });
}

/**
 * Load normalized content for an artifact. Full page text and worksheet cells are
 * only read when `includeContent` is set (extraction needs them; API views do not).
 */
export async function getNormalizedContentRecords(
  artifactBlobId: string,
  options: { includeContent?: boolean } = {}
): Promise<NormalizedContentRecords> {
  const sql = getDb();
  const includeContent = options.includeContent ?? false;

  const [document] = await sql<
    {
      id: string;
      page_count: number;
      source_format: string | null;
      text_available: boolean;
      text_preview: string | null;
      title: string | null;
      updated_at: Date;
    }[]
  >`
    select id, title, page_count, text_available, text_preview, updated_at, metadata_json ->> 'source' as source_format
    from documents
    where artifact_blob_id = ${artifactBlobId}
    limit 1
  `;

  const documentPages = document
    ? await sql<
        {
          char_count: number;
          id: string;
          page_number: number;
          text_available: boolean;
          text_content: string | null;
          text_preview: string | null;
        }[]
      >`
        select
          id,
          page_number,
          text_available,
          char_count,
          text_preview,
          case when ${includeContent} then text_content else null end as text_content
        from document_pages
        where document_id = ${document.id}
        order by page_number asc
      `
    : [];

  const [emailThread] = await sql<
    {
      id: string;
      message_count: number;
      subject: string | null;
      thread_key: string;
      updated_at: Date;
    }[]
  >`
    select id, thread_key, subject, message_count, updated_at
    from email_threads
    where artifact_blob_id = ${artifactBlobId}
    limit 1
  `;

  const emailMessages = emailThread
    ? await sql<
        {
          attachment_count: number;
          body_preview: string | null;
          cc_json: string[] | string;
          id: string;
          message_id_header: string | null;
          position: number;
          sender: string | null;
          sent_at: Date | null;
          sent_at_raw: string | null;
          subject: string | null;
          to_json: string[] | string;
        }[]
      >`
        select
          id,
          position,
          message_id_header,
          subject,
          sender,
          to_json,
          cc_json,
          sent_at,
          sent_at_raw,
          body_preview,
          attachment_count
        from email_messages
        where email_thread_id = ${emailThread.id}
        order by position asc
      `
    : [];

  const attachments = emailMessages.length
    ? await sql<
        {
          content_type: string | null;
          file_name: string | null;
          id: string;
          part_index: number;
          promoted_content_kind: NormalizedContentKind | null;
          promoted_content_type: string | null;
          promoted_file_name: string | null;
          promoted_artifact_blob_id: string | null;
          promoted_inspection_status: "completed" | "failed" | "pending" | "unsupported" | null;
          promoted_normalization_status:
            | "completed"
            | "completed_with_warnings"
            | "deferred"
            | "failed"
            | "pending"
            | "skipped"
            | null;
          promoted_parser_target: ArtifactParserTarget | null;
          promoted_sha256: string | null;
          promoted_summary: string | null;
          promoted_support_tier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
          promotion_status: AttachmentSummary["promotionStatus"];
          promotion_summary: string | null;
          sha256: string | null;
          size_bytes: bigint | number | string | null;
        }[]
      >`
        select
          a.id,
          a.part_index,
          a.file_name,
          a.content_type,
          a.size_bytes,
          a.sha256,
          a.promoted_artifact_blob_id,
          a.promotion_status,
          a.promotion_summary,
          pab.sha256 as promoted_sha256,
          pab.content_type as promoted_content_type,
          pab.original_file_name as promoted_file_name,
          aps.support_tier as promoted_support_tier,
          aps.parser_target as promoted_parser_target,
          aps.inspection_status as promoted_inspection_status,
          aps.normalization_status as promoted_normalization_status,
          aps.content_kind as promoted_content_kind,
          aps.summary as promoted_summary
        from attachments a
        left join artifact_blobs pab on pab.id = a.promoted_artifact_blob_id
        left join artifact_processing_states aps on aps.artifact_blob_id = a.promoted_artifact_blob_id
        where email_message_id in ${sql(emailMessages.map((message) => message.id))}
        order by part_index asc
      `
    : [];

  const [workbook] = await sql<
    {
      file_name: string;
      id: string;
      sheet_count: number;
      updated_at: Date;
    }[]
  >`
    select id, file_name, sheet_count, updated_at
    from workbooks
    where artifact_blob_id = ${artifactBlobId}
    limit 1
  `;

  const worksheets = workbook
    ? await sql<
        {
          id: string;
          max_column: number | null;
          max_row: number | null;
          name: string;
          rows_json: WorksheetRow[] | string | null;
          sheet_index: number;
          table_count: number;
        }[]
      >`
        select
          id,
          sheet_index,
          name,
          max_row,
          max_column,
          table_count,
          case when ${includeContent} then rows_json else null end as rows_json
        from worksheets
        where workbook_id = ${workbook.id}
        order by sheet_index asc
      `
    : [];

  const structuredTables = worksheets.length
    ? await sql<
        {
          header_row_count: number | null;
          id: string;
          name: string;
          ref: string | null;
          table_key: string;
        }[]
      >`
        select id, table_key, name, ref, header_row_count
        from structured_tables
        where worksheet_id in ${sql(worksheets.map((worksheet) => worksheet.id))}
        order by name asc
      `
    : [];

  const lastNormalizedAt = [document?.updated_at, emailThread?.updated_at, workbook?.updated_at]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return {
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      promotedArtifactBlobId: attachment.promoted_artifact_blob_id,
      promotionStatus: attachment.promotion_status,
      promotionSummary: attachment.promotion_summary,
      partIndex: attachment.part_index,
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      sizeBytes: asNumber(attachment.size_bytes),
      sha256: attachment.sha256,
      promotedArtifact: attachment.promoted_artifact_blob_id
        ? {
            artifactBlobId: attachment.promoted_artifact_blob_id,
            sha256: attachment.promoted_sha256 ?? "",
            originalFileName: attachment.promoted_file_name ?? attachment.file_name ?? "attachment",
            contentType: attachment.promoted_content_type,
            supportTier: attachment.promoted_support_tier,
            parserTarget: attachment.promoted_parser_target,
            inspectionStatus: attachment.promoted_inspection_status,
            normalizationStatus: attachment.promoted_normalization_status,
            contentKind: attachment.promoted_content_kind,
            summary: attachment.promoted_summary
          }
        : null
    })),
    contentKind: document ? "document" : emailThread ? "email" : workbook ? "workbook" : null,
    document: document
      ? {
          id: document.id,
          sourceFormat: document.source_format === "text" ? "text" : "pdf",
          title: document.title,
          pageCount: document.page_count,
          textAvailable: document.text_available,
          textPreview: document.text_preview
        }
      : null,
    documentPages: documentPages.map((page) => ({
      id: page.id,
      pageNumber: page.page_number,
      textAvailable: page.text_available,
      charCount: page.char_count,
      textPreview: page.text_preview,
      ...(includeContent ? { text: page.text_content } : {})
    })),
    emailMessages: emailMessages.map((message) => ({
      id: message.id,
      position: message.position,
      messageIdHeader: message.message_id_header,
      subject: message.subject,
      sender: message.sender,
      to: asStringArray(message.to_json),
      cc: asStringArray(message.cc_json),
      sentAt: iso(message.sent_at),
      sentAtRaw: message.sent_at_raw,
      bodyPreview: message.body_preview,
      attachmentCount: message.attachment_count
    })),
    emailThread: emailThread
      ? {
          id: emailThread.id,
          threadKey: emailThread.thread_key,
          subject: emailThread.subject,
          messageCount: emailThread.message_count
        }
      : null,
    lastNormalizedAt: iso(lastNormalizedAt ?? null),
    structuredTables: structuredTables.map((table) => ({
      id: table.id,
      tableKey: table.table_key,
      name: table.name,
      ref: table.ref,
      headerRowCount: table.header_row_count
    })),
    workbook: workbook
      ? {
          id: workbook.id,
          fileName: workbook.file_name,
          sheetCount: workbook.sheet_count
        }
      : null,
    worksheets: worksheets.map((worksheet) => ({
      id: worksheet.id,
      sheetIndex: worksheet.sheet_index,
      name: worksheet.name,
      maxRow: worksheet.max_row,
      maxColumn: worksheet.max_column,
      tableCount: worksheet.table_count,
      ...(includeContent ? { rows: parseRows(worksheet.rows_json) } : {})
    }))
  };
}

function parseRows(value: WorksheetRow[] | string | null): WorksheetRow[] {
  if (!value) {
    return [];
  }
  return typeof value === "string" ? (JSON.parse(value) as WorksheetRow[]) : value;
}

export async function updateAttachmentPromotion(input: AttachmentPromotionUpdateInput): Promise<void> {
  const sql = getDb();

  await sql`
    update attachments
    set
      promoted_artifact_blob_id = ${input.promotedArtifactBlobId},
      promotion_status = ${input.promotionStatus},
      promotion_summary = ${input.promotionSummary},
      updated_at = now()
    where id = ${input.attachmentId}
  `;
}
