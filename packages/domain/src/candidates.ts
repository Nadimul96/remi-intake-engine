import { z } from "zod";

import { ParserResultStatusSchema, ParserWarningSchema } from "./content";

export const extractedCandidateTypes = [
  "metric_fact_candidate",
  "relationship_assertion_candidate",
  "classification_candidate"
] as const;

export const candidateExtractionMethods = ["rule", "parser", "model_assisted"] as const;
export const candidateReviewStatuses = ["pending_review", "accepted", "rejected", "edited_and_accepted"] as const;
export const acceptedRecordTypes = ["fact", "relationship", "classification"] as const;

export const ExtractedCandidateTypeSchema = z.enum(extractedCandidateTypes);
export const CandidateExtractionMethodSchema = z.enum(candidateExtractionMethods);
export const CandidateReviewStatusSchema = z.enum(candidateReviewStatuses);
export const AcceptedRecordTypeSchema = z.enum(acceptedRecordTypes);

export const CandidateCitationPacketSchema = z.object({
  candidateType: ExtractedCandidateTypeSchema,
  fieldName: z.string().min(1),
  candidateValue: z.unknown(),
  confidenceScore: z.number().min(0).max(1),
  sourceArtifactBlobId: z.string(),
  sourceSemanticObjectType: z.string().nullable(),
  sourceSemanticObjectId: z.string().nullable(),
  provenanceAnchorIds: z.array(z.string()).min(1),
  evidencePreview: z.string().min(1),
  extractionMethod: CandidateExtractionMethodSchema,
  extractionMethodDetail: z.string().min(1),
  extractionMetadata: z.record(z.string(), z.unknown()),
  createdAt: z.string()
});

export const ExtractedCandidateSummarySchema = z.object({
  id: z.string(),
  artifactBlobId: z.string(),
  candidateType: ExtractedCandidateTypeSchema,
  fieldName: z.string().min(1),
  valueType: z.string().min(1),
  candidateValue: z.unknown(),
  confidence: z.number().min(0).max(1),
  extractionMethod: CandidateExtractionMethodSchema,
  extractionMethodDetail: z.string().min(1),
  summary: z.string().min(1),
  sourceSemanticObjectType: z.string().nullable(),
  sourceSemanticObjectId: z.string().nullable(),
  reviewReady: z.boolean(),
  reviewStatus: CandidateReviewStatusSchema,
  reviewedValue: z.unknown().nullable(),
  reviewNote: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewedByActorId: z.string().nullable(),
  reviewedByActorName: z.string().nullable(),
  acceptedRecordType: AcceptedRecordTypeSchema.nullable(),
  acceptedRecordId: z.string().nullable(),
  currentExtraction: z.boolean(),
  supersededAt: z.string().nullable(),
  citationPacket: CandidateCitationPacketSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CandidateExtractionResultSchema = z.object({
  status: ParserResultStatusSchema,
  summary: z.string(),
  reasonCodes: z.array(z.string()),
  warnings: z.array(ParserWarningSchema),
  retryRecommended: z.boolean(),
  reprocessRecommended: z.boolean(),
  candidateCount: z.number().int().nonnegative(),
  lastUpdatedAt: z.string().nullable()
});

export type CandidateCitationPacket = z.infer<typeof CandidateCitationPacketSchema>;
export type CandidateExtractionMethod = z.infer<typeof CandidateExtractionMethodSchema>;
export type CandidateExtractionResult = z.infer<typeof CandidateExtractionResultSchema>;
export type CandidateReviewStatus = z.infer<typeof CandidateReviewStatusSchema>;
export type ExtractedCandidateSummary = z.infer<typeof ExtractedCandidateSummarySchema>;
export type ExtractedCandidateType = z.infer<typeof ExtractedCandidateTypeSchema>;
export type AcceptedRecordType = z.infer<typeof AcceptedRecordTypeSchema>;
