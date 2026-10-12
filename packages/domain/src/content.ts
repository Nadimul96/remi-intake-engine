import { z } from "zod";

export const parserResultStatuses = [
  "pending",
  "completed",
  "completed_with_warnings",
  "deferred",
  "skipped",
  "failed"
] as const;
export const normalizedContentKinds = ["document", "email", "workbook"] as const;
export const attachmentPromotionStatuses = [
  "embedded_only",
  "promoted",
  "reused_existing_blob",
  "promotion_failed"
] as const;
const artifactProcessingSupportTiers = ["supported", "best_effort", "deferred", "unsupported"] as const;
const artifactProcessingParserTargets = ["pdf", "eml", "xlsx", "csv", "text", "archive", "none"] as const;
const artifactProcessingInspectionStatuses = ["pending", "completed", "failed", "unsupported"] as const;

export const ParserResultStatusSchema = z.enum(parserResultStatuses);
export const NormalizedContentKindSchema = z.enum(normalizedContentKinds);
export const AttachmentPromotionStatusSchema = z.enum(attachmentPromotionStatuses);
export const ArtifactProcessingSupportTierSchema = z.enum(artifactProcessingSupportTiers);
export const ArtifactProcessingParserTargetSchema = z.enum(artifactProcessingParserTargets);
export const ArtifactProcessingInspectionStatusSchema = z.enum(artifactProcessingInspectionStatuses);

export const DocumentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  artifactBlobId: z.string(),
  title: z.string().nullable(),
  pageCount: z.number().int().nonnegative(),
  textAvailable: z.boolean(),
  textPreview: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const DocumentPageSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  pageNumber: z.number().int().positive(),
  textAvailable: z.boolean(),
  charCount: z.number().int().nonnegative(),
  textPreview: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const EmailThreadSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  artifactBlobId: z.string(),
  threadKey: z.string(),
  subject: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const EmailMessageSchema = z.object({
  id: z.string(),
  emailThreadId: z.string(),
  artifactBlobId: z.string(),
  position: z.number().int().nonnegative(),
  messageIdHeader: z.string().nullable(),
  subject: z.string().nullable(),
  sender: z.string().nullable(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  sentAt: z.date().nullable(),
  sentAtRaw: z.string().nullable(),
  bodyPreview: z.string().nullable(),
  attachmentCount: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const AttachmentSchema = z.object({
  id: z.string(),
  emailMessageId: z.string(),
  sourceArtifactBlobId: z.string(),
  promotedArtifactBlobId: z.string().nullable(),
  promotionStatus: AttachmentPromotionStatusSchema,
  promotionSummary: z.string().nullable(),
  partIndex: z.number().int().nonnegative(),
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  contentDisposition: z.string().nullable(),
  contentId: z.string().nullable(),
  sha256: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const PromotedArtifactSummarySchema = z.object({
  artifactBlobId: z.string(),
  sha256: z.string(),
  originalFileName: z.string(),
  contentType: z.string().nullable(),
  supportTier: ArtifactProcessingSupportTierSchema.nullable(),
  parserTarget: ArtifactProcessingParserTargetSchema.nullable(),
  inspectionStatus: ArtifactProcessingInspectionStatusSchema.nullable(),
  normalizationStatus: ParserResultStatusSchema.nullable(),
  contentKind: NormalizedContentKindSchema.nullable(),
  summary: z.string().nullable()
});

export const WorkbookSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  artifactBlobId: z.string(),
  fileName: z.string(),
  sheetCount: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const WorksheetSchema = z.object({
  id: z.string(),
  workbookId: z.string(),
  sheetIndex: z.number().int().nonnegative(),
  name: z.string(),
  maxRow: z.number().int().nonnegative().nullable(),
  maxColumn: z.number().int().nonnegative().nullable(),
  tableCount: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const StructuredTableSchema = z.object({
  id: z.string(),
  worksheetId: z.string(),
  tableKey: z.string(),
  name: z.string(),
  ref: z.string().nullable(),
  headerRowCount: z.number().int().nonnegative().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const documentSourceFormats = ["pdf", "text"] as const;
export const DocumentSourceFormatSchema = z.enum(documentSourceFormats);

export const DocumentSummarySchema = z.object({
  id: z.string(),
  sourceFormat: DocumentSourceFormatSchema,
  title: z.string().nullable(),
  pageCount: z.number().int().nonnegative(),
  textAvailable: z.boolean(),
  textPreview: z.string().nullable()
});

export const DocumentPageSummarySchema = z.object({
  id: z.string(),
  pageNumber: z.number().int().positive(),
  textAvailable: z.boolean(),
  charCount: z.number().int().nonnegative(),
  textPreview: z.string().nullable(),
  /** Full line-structured page text; only loaded for extraction. */
  text: z.string().nullable().optional()
});

export const EmailThreadSummarySchema = z.object({
  id: z.string(),
  threadKey: z.string(),
  subject: z.string().nullable(),
  messageCount: z.number().int().nonnegative()
});

export const EmailMessageSummarySchema = z.object({
  id: z.string(),
  position: z.number().int().nonnegative(),
  messageIdHeader: z.string().nullable(),
  subject: z.string().nullable(),
  sender: z.string().nullable(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  sentAt: z.string().nullable(),
  sentAtRaw: z.string().nullable(),
  bodyPreview: z.string().nullable(),
  attachmentCount: z.number().int().nonnegative()
});

export const AttachmentSummarySchema = z.object({
  id: z.string(),
  promotedArtifactBlobId: z.string().nullable(),
  promotionStatus: AttachmentPromotionStatusSchema,
  promotionSummary: z.string().nullable(),
  partIndex: z.number().int().nonnegative(),
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  sha256: z.string().nullable(),
  promotedArtifact: PromotedArtifactSummarySchema.nullable()
});

export const WorkbookSummarySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  sheetCount: z.number().int().nonnegative()
});

export const WorksheetCellSchema = z.object({
  column: z.number().int().positive(),
  ref: z.string().min(2),
  text: z.string()
});

export const WorksheetRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  cells: z.array(WorksheetCellSchema)
});

export const WorksheetSummarySchema = z.object({
  id: z.string(),
  sheetIndex: z.number().int().nonnegative(),
  name: z.string(),
  maxRow: z.number().int().nonnegative().nullable(),
  maxColumn: z.number().int().nonnegative().nullable(),
  tableCount: z.number().int().nonnegative(),
  /** Sparse cell grid with A1 references; only loaded for extraction. */
  rows: z.array(WorksheetRowSchema).optional()
});

export const StructuredTableSummarySchema = z.object({
  id: z.string(),
  tableKey: z.string(),
  name: z.string(),
  ref: z.string().nullable(),
  headerRowCount: z.number().int().nonnegative().nullable()
});

export const ParserWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

// Keep anchor contracts extensible; the current kinds are implementation examples, not a closed ontology.
export const ProvenanceAnchorSummarySchema = z.object({
  id: z.string(),
  ownerType: z.string().min(1),
  ownerId: z.string().min(1),
  anchorKind: z.string().min(1),
  anchorKey: z.string().min(1),
  title: z.string(),
  summary: z.string(),
  locator: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown())
});

export const ProvenanceAnchorGroupSchema = z.object({
  anchorKind: z.string().min(1),
  count: z.number().int().nonnegative()
});

export const ProvenanceAnchorsSummarySchema = z.object({
  totalCount: z.number().int().nonnegative(),
  groups: z.array(ProvenanceAnchorGroupSchema),
  items: z.array(ProvenanceAnchorSummarySchema)
});

export const ParserResultSummarySchema = z.object({
  status: ParserResultStatusSchema,
  summary: z.string(),
  reasonCodes: z.array(z.string()),
  warnings: z.array(ParserWarningSchema),
  retryRecommended: z.boolean(),
  reprocessRecommended: z.boolean(),
  contentKind: NormalizedContentKindSchema.nullable(),
  lastUpdatedAt: z.string().nullable()
});

export const NormalizedContentSummarySchema = z.object({
  contentKind: NormalizedContentKindSchema.nullable(),
  lastNormalizedAt: z.string().nullable(),
  document: DocumentSummarySchema.nullable(),
  documentPages: z.array(DocumentPageSummarySchema),
  emailThread: EmailThreadSummarySchema.nullable(),
  emailMessages: z.array(EmailMessageSummarySchema),
  attachments: z.array(AttachmentSummarySchema),
  workbook: WorkbookSummarySchema.nullable(),
  worksheets: z.array(WorksheetSummarySchema),
  structuredTables: z.array(StructuredTableSummarySchema)
});

export type Attachment = z.infer<typeof AttachmentSchema>;
export type AttachmentSummary = z.infer<typeof AttachmentSummarySchema>;
export type AttachmentPromotionStatus = z.infer<typeof AttachmentPromotionStatusSchema>;
export type PromotedArtifactSummary = z.infer<typeof PromotedArtifactSummarySchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type DocumentPage = z.infer<typeof DocumentPageSchema>;
export type DocumentPageSummary = z.infer<typeof DocumentPageSummarySchema>;
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;
export type DocumentSourceFormat = z.infer<typeof DocumentSourceFormatSchema>;
export type EmailMessage = z.infer<typeof EmailMessageSchema>;
export type EmailMessageSummary = z.infer<typeof EmailMessageSummarySchema>;
export type EmailThread = z.infer<typeof EmailThreadSchema>;
export type EmailThreadSummary = z.infer<typeof EmailThreadSummarySchema>;
export type NormalizedContentKind = z.infer<typeof NormalizedContentKindSchema>;
export type NormalizedContentSummary = z.infer<typeof NormalizedContentSummarySchema>;
export type ParserResultStatus = z.infer<typeof ParserResultStatusSchema>;
export type ParserResultSummary = z.infer<typeof ParserResultSummarySchema>;
export type ParserWarning = z.infer<typeof ParserWarningSchema>;
export type ProvenanceAnchorGroup = z.infer<typeof ProvenanceAnchorGroupSchema>;
export type ProvenanceAnchorSummary = z.infer<typeof ProvenanceAnchorSummarySchema>;
export type ProvenanceAnchorsSummary = z.infer<typeof ProvenanceAnchorsSummarySchema>;
export type StructuredTable = z.infer<typeof StructuredTableSchema>;
export type StructuredTableSummary = z.infer<typeof StructuredTableSummarySchema>;
export type WorksheetCell = z.infer<typeof WorksheetCellSchema>;
export type WorksheetRow = z.infer<typeof WorksheetRowSchema>;
export type Workbook = z.infer<typeof WorkbookSchema>;
export type WorkbookSummary = z.infer<typeof WorkbookSummarySchema>;
export type Worksheet = z.infer<typeof WorksheetSchema>;
export type WorksheetSummary = z.infer<typeof WorksheetSummarySchema>;

/** One cited anchor with the surrounding source a reviewer needs to judge it. */
export const ProvenanceViewSchema = z.object({
  anchor: ProvenanceAnchorSummarySchema,
  artifact: z.object({
    id: z.string(),
    fileName: z.string(),
    contentType: z.string().nullable()
  }),
  /** Neighbouring lines, or the header row plus nearby rows, ordered as in the source. */
  context: z.array(ProvenanceAnchorSummarySchema)
});

export type ProvenanceView = z.infer<typeof ProvenanceViewSchema>;
