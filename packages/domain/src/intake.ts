import { z } from "zod";

import { CandidateExtractionResultSchema, ExtractedCandidateSummarySchema } from "./candidates";
import { NormalizedContentSummarySchema, ParserResultSummarySchema, ProvenanceAnchorsSummarySchema } from "./content";

export const sourceConnectionKinds = ["upload", "mailbox", "file_drop", "sftp"] as const;
export const sourceItemStatuses = ["staged", "registered", "processing", "completed", "failed"] as const;
export const ingestionRunStatuses = ["queued", "processing", "completed", "failed"] as const;
export const ingestionStages = [
  "registered",
  "immutable_storage",
  "inspection",
  "normalization",
  "anchoring",
  "candidate_extraction",
  "complete",
  "failed"
] as const;
export const derivedArtifactKinds = [
  "artifact_inspection",
  "normalized_metadata",
  "preview_text",
  "normalization_report",
  "provenance_anchor_manifest",
  "candidate_citation_packets"
] as const;
export const artifactSupportTiers = ["supported", "best_effort", "deferred", "unsupported"] as const;
export const artifactParserTargets = ["pdf", "eml", "xlsx", "csv", "text", "archive", "none"] as const;
export const artifactInspectionStatuses = ["pending", "completed", "failed", "unsupported"] as const;
export const artifactFileClassifications = ["pdf", "email", "spreadsheet", "archive", "document", "unknown"] as const;
export const reviewQueues = ["intake", "resolution", "output_approval"] as const;
export const reviewItemTypes = ["intake_assignment", "doc_classification", "unsupported_file", "ocr_rescue"] as const;
export const reviewStatuses = ["open", "in_progress", "resolved", "dismissed"] as const;
export const workflowTypes = ["intake_registration"] as const;
export const workflowStatuses = ["queued", "running", "completed", "failed"] as const;
export const intakeEventTypes = [
  "source_item_registered",
  "ingestion_queued",
  "workflow_started",
  "ingestion_processing",
  "artifact_promoted",
  "inspection_started",
  "derived_artifacts_recorded",
  "inspection_completed",
  "inspection_failed",
  "normalization_started",
  "normalized_content_recorded",
  "normalization_completed",
  "normalization_skipped",
  "normalization_failed",
  "anchoring_started",
  "provenance_anchors_recorded",
  "anchoring_completed",
  "anchoring_skipped",
  "anchoring_failed",
  "candidate_extraction_started",
  "candidate_signals_recorded",
  "candidate_extraction_completed",
  "candidate_extraction_skipped",
  "candidate_extraction_failed",
  "review_item_created",
  "ingestion_completed",
  "ingestion_failed"
] as const;

export const SourceConnectionKindSchema = z.enum(sourceConnectionKinds);
export const SourceItemStatusSchema = z.enum(sourceItemStatuses);
export const IngestionRunStatusSchema = z.enum(ingestionRunStatuses);
export const IngestionStageSchema = z.enum(ingestionStages);
export const DerivedArtifactKindSchema = z.enum(derivedArtifactKinds);
export const ArtifactSupportTierSchema = z.enum(artifactSupportTiers);
export const ArtifactParserTargetSchema = z.enum(artifactParserTargets);
export const ArtifactInspectionStatusSchema = z.enum(artifactInspectionStatuses);
export const ArtifactFileClassificationSchema = z.enum(artifactFileClassifications);
export const ReviewQueueSchema = z.enum(reviewQueues);
export const ReviewItemTypeSchema = z.enum(reviewItemTypes);
export const ReviewStatusSchema = z.enum(reviewStatuses);
export const WorkflowTypeSchema = z.enum(workflowTypes);
export const WorkflowStatusSchema = z.enum(workflowStatuses);
export const IntakeEventTypeSchema = z.enum(intakeEventTypes);

export const SourceConnectionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  key: z.string(),
  kind: SourceConnectionKindSchema,
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const SourceItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  sourceConnectionId: z.string(),
  fileName: z.string(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  objectKey: z.string(),
  sourceUri: z.string(),
  status: SourceItemStatusSchema,
  artifactBlobId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const IngestionRunSchema = z.object({
  id: z.string(),
  sourceItemId: z.string(),
  status: IngestionRunStatusSchema,
  stage: IngestionStageSchema,
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const ArtifactBlobSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  sha256: z.string(),
  storageBucket: z.string(),
  storageKey: z.string(),
  originalFileName: z.string(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.date()
});

export const DerivedArtifactSchema = z.object({
  id: z.string(),
  artifactBlobId: z.string(),
  kind: DerivedArtifactKindSchema,
  version: z.number().int().positive(),
  storageBucket: z.string(),
  storageKey: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date()
});

export const DerivedArtifactSummarySchema = z.object({
  id: z.string(),
  kind: DerivedArtifactKindSchema,
  version: z.number().int().positive(),
  storageKey: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string()
});

export const ReviewItemSchema = z.object({
  id: z.string(),
  queue: ReviewQueueSchema,
  type: ReviewItemTypeSchema,
  status: ReviewStatusSchema,
  sourceItemId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflowType: WorkflowTypeSchema,
  status: WorkflowStatusSchema,
  externalWorkflowId: z.string().nullable(),
  sourceItemId: z.string().nullable(),
  ingestionRunId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const TimelineEventSchema = z.object({
  id: z.string(),
  eventType: IntakeEventTypeSchema,
  message: z.string(),
  createdAt: z.string(),
  payload: z.record(z.string(), z.unknown())
});

export const IntakeQueueItemSchema = z.object({
  id: z.string(),
  artifactBlobId: z.string().nullable(),
  fileName: z.string(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  sourceConnectionName: z.string(),
  sourceConnectionKind: SourceConnectionKindSchema,
  sourceUri: z.string(),
  status: SourceItemStatusSchema,
  ingestionStatus: IngestionRunStatusSchema,
  ingestionStage: IngestionStageSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  workflowStatus: WorkflowStatusSchema.nullable(),
  artifactSha256: z.string().nullable(),
  immutableStorageKey: z.string().nullable(),
  supportTier: ArtifactSupportTierSchema.nullable(),
  parserTarget: ArtifactParserTargetSchema.nullable(),
  inspectionStatus: ArtifactInspectionStatusSchema.nullable(),
  normalizationStatus: ParserResultSummarySchema.shape.status.nullable()
});

export const IntakeDetailSchema = IntakeQueueItemSchema.extend({
  fileClassification: ArtifactFileClassificationSchema.nullable(),
  normalizedExtension: z.string().nullable(),
  nativeTextPresent: z.boolean().nullable(),
  ocrNeededLater: z.boolean().nullable(),
  isContainer: z.boolean().nullable(),
  parserEligible: z.boolean(),
  normalizationResult: ParserResultSummarySchema,
  candidateExtractionResult: CandidateExtractionResultSchema,
  normalizedContent: NormalizedContentSummarySchema,
  provenanceAnchors: ProvenanceAnchorsSummarySchema,
  candidateSignals: z.array(ExtractedCandidateSummarySchema),
  derivedArtifacts: z.array(DerivedArtifactSummarySchema),
  timeline: z.array(TimelineEventSchema)
});

export const PresignUploadRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive()
});

export const PresignUploadResponseSchema = z.object({
  uploadKey: z.string(),
  uploadUrl: z.string(),
  headers: z.record(z.string(), z.string())
});

export const RegisterIntakeRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  uploadKey: z.string().min(1)
});

export const RegisterIntakeResponseSchema = z.object({
  sourceItemId: z.string(),
  ingestionRunId: z.string(),
  workflowRunId: z.string(),
  wasReplayed: z.boolean()
});

export const IntakeRegistrationWorkflowInputSchema = z.object({
  actorId: z.string(),
  /** The name the uploader registered; preferred over object-store metadata, which not every S3 server keeps. */
  fileName: z.string().min(1).optional(),
  ingestionRunId: z.string(),
  sourceItemId: z.string(),
  tenantId: z.string(),
  uploadKey: z.string(),
  workflowRunId: z.string()
});

export const INTAKE_REGISTRATION_WORKFLOW = "registerIntakeSourceItemWorkflow";

export type ArtifactBlob = z.infer<typeof ArtifactBlobSchema>;
export type ArtifactFileClassification = z.infer<typeof ArtifactFileClassificationSchema>;
export type ArtifactInspectionStatus = z.infer<typeof ArtifactInspectionStatusSchema>;
export type ArtifactParserTarget = z.infer<typeof ArtifactParserTargetSchema>;
export type ArtifactSupportTier = z.infer<typeof ArtifactSupportTierSchema>;
export type DerivedArtifact = z.infer<typeof DerivedArtifactSchema>;
export type DerivedArtifactSummary = z.infer<typeof DerivedArtifactSummarySchema>;
export type IngestionRun = z.infer<typeof IngestionRunSchema>;
export type IntakeDetail = z.infer<typeof IntakeDetailSchema>;
export type IntakeQueueItem = z.infer<typeof IntakeQueueItemSchema>;
export type IntakeRegistrationWorkflowInput = z.infer<typeof IntakeRegistrationWorkflowInputSchema>;
export type RegisterIntakeRequest = z.infer<typeof RegisterIntakeRequestSchema>;
export type RegisterIntakeResponse = z.infer<typeof RegisterIntakeResponseSchema>;
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type SourceConnection = z.infer<typeof SourceConnectionSchema>;
export type SourceConnectionKind = z.infer<typeof SourceConnectionKindSchema>;
export type SourceItem = z.infer<typeof SourceItemSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
