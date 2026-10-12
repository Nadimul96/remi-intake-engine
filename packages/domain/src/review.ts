import { z } from "zod";

import {
  AcceptedRecordTypeSchema,
  CandidateCitationPacketSchema,
  CandidateExtractionMethodSchema,
  CandidateReviewStatusSchema,
  ExtractedCandidateSummarySchema,
  ExtractedCandidateTypeSchema
} from "./candidates";
import { ProvenanceAnchorSummarySchema } from "./content";

export const reviewCandidateActionTypes = ["accept", "reject", "edit_and_accept"] as const;

export const ReviewCandidateActionTypeSchema = z.enum(reviewCandidateActionTypes);

export const AcceptedTruthFilterSchema = z.enum(["all", "fact", "relationship", "classification"]);

export const ReviewArtifactSummarySchema = z.object({
  artifactBlobId: z.string(),
  originalFileName: z.string(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  sourceItemId: z.string().nullable(),
  sourceItemFileName: z.string().nullable(),
  sourceUri: z.string().nullable()
});

export const AcceptedRecordSummarySchema = z.object({
  id: z.string(),
  acceptedRecordType: AcceptedRecordTypeSchema,
  sourceCandidateId: z.string(),
  artifactBlobId: z.string(),
  fieldName: z.string().min(1),
  valueType: z.string().min(1),
  acceptedValue: z.unknown(),
  sourceSemanticObjectType: z.string().nullable(),
  sourceSemanticObjectId: z.string().nullable(),
  provenanceAnchorIds: z.array(z.string()),
  citationPacket: CandidateCitationPacketSchema,
  reviewStatus: CandidateReviewStatusSchema,
  reviewNote: z.string().nullable(),
  reviewerActorId: z.string(),
  reviewerActorName: z.string(),
  reviewedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ReviewHistoryEntrySchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  artifactBlobId: z.string(),
  previousReviewStatus: CandidateReviewStatusSchema,
  newReviewStatus: CandidateReviewStatusSchema,
  action: ReviewCandidateActionTypeSchema,
  reviewNote: z.string().nullable(),
  editedValue: z.unknown().nullable(),
  reviewerActorId: z.string(),
  reviewerActorName: z.string(),
  createdAt: z.string()
});

export const CandidateReviewQueueItemSchema = z.object({
  candidateId: z.string(),
  artifactBlobId: z.string(),
  artifactFileName: z.string(),
  contentType: z.string().nullable(),
  candidateType: ExtractedCandidateTypeSchema,
  fieldName: z.string().min(1),
  valueType: z.string().min(1),
  candidateValue: z.unknown(),
  confidence: z.number().min(0).max(1),
  extractionMethod: CandidateExtractionMethodSchema,
  extractionMethodDetail: z.string().min(1),
  summary: z.string().min(1),
  reviewStatus: CandidateReviewStatusSchema,
  reviewedAt: z.string().nullable(),
  reviewedByActorName: z.string().nullable(),
  acceptedRecordType: AcceptedRecordTypeSchema.nullable(),
  acceptedRecordId: z.string().nullable(),
  currentExtraction: z.boolean(),
  sourceItemId: z.string().nullable(),
  sourceItemFileName: z.string().nullable(),
  sourceUri: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CandidateReviewQueueCountsSchema = z.object({
  pendingReview: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  editedAndAccepted: z.number().int().nonnegative()
});

export const CandidateReviewQueueResponseSchema = z.object({
  counts: CandidateReviewQueueCountsSchema,
  items: z.array(CandidateReviewQueueItemSchema)
});

export const CandidateReviewDetailSchema = z.object({
  artifact: ReviewArtifactSummarySchema,
  candidate: ExtractedCandidateSummarySchema,
  provenanceAnchors: z.array(ProvenanceAnchorSummarySchema),
  acceptedRecord: AcceptedRecordSummarySchema.nullable(),
  reviewHistory: z.array(ReviewHistoryEntrySchema)
});

export const ReviewCandidateActionRequestSchema = z
  .object({
    action: ReviewCandidateActionTypeSchema,
    note: z.string().trim().max(2_000).nullable().optional(),
    reviewedValue: z.unknown().optional()
  })
  .superRefine((value, context) => {
    if (value.action === "edit_and_accept" && value.reviewedValue === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reviewedValue is required when action is edit_and_accept.",
        path: ["reviewedValue"]
      });
    }

    if (value.action !== "edit_and_accept" && value.reviewedValue !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reviewedValue is only allowed when action is edit_and_accept.",
        path: ["reviewedValue"]
      });
    }
  });

export const ReviewCandidateActionResponseSchema = CandidateReviewDetailSchema.extend({
  action: ReviewCandidateActionTypeSchema
});

export const RelatedCandidateSummarySchema = z.object({
  id: z.string(),
  fieldName: z.string(),
  candidateValue: z.unknown(),
  reviewStatus: CandidateReviewStatusSchema,
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CandidateLineageSummarySchema = z.object({
  sourceCandidateId: z.string(),
  sourceCandidateCurrentExtraction: z.boolean(),
  sourceCandidateSupersededAt: z.string().nullable(),
  newerCandidates: z.array(RelatedCandidateSummarySchema)
});

export const AcceptedTruthListItemSchema = z.object({
  acceptedRecordId: z.string(),
  acceptedRecordType: AcceptedRecordTypeSchema,
  fieldName: z.string(),
  valueType: z.string(),
  acceptedValue: z.unknown(),
  artifactBlobId: z.string(),
  artifactFileName: z.string(),
  contentType: z.string().nullable(),
  sourceCandidateId: z.string(),
  sourceCandidateReviewStatus: CandidateReviewStatusSchema,
  sourceCandidateCurrentExtraction: z.boolean(),
  sourceCandidateSupersededAt: z.string().nullable(),
  latestReviewAction: ReviewCandidateActionTypeSchema.nullable(),
  latestReviewAt: z.string().nullable(),
  provenanceAnchorCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const AcceptedTruthBrowserCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  fact: z.number().int().nonnegative(),
  relationship: z.number().int().nonnegative(),
  classification: z.number().int().nonnegative()
});

export const AcceptedTruthBrowserResponseSchema = z.object({
  counts: AcceptedTruthBrowserCountsSchema,
  items: z.array(AcceptedTruthListItemSchema)
});

export const AcceptedTruthDetailSchema = z.object({
  acceptedRecord: AcceptedRecordSummarySchema,
  artifact: ReviewArtifactSummarySchema,
  sourceCandidate: ExtractedCandidateSummarySchema,
  provenanceAnchors: z.array(ProvenanceAnchorSummarySchema),
  reviewHistory: z.array(ReviewHistoryEntrySchema),
  lineage: CandidateLineageSummarySchema
});

export type AcceptedRecordSummary = z.infer<typeof AcceptedRecordSummarySchema>;
export type AcceptedTruthBrowserCounts = z.infer<typeof AcceptedTruthBrowserCountsSchema>;
export type AcceptedTruthBrowserResponse = z.infer<typeof AcceptedTruthBrowserResponseSchema>;
export type AcceptedTruthDetail = z.infer<typeof AcceptedTruthDetailSchema>;
export type AcceptedTruthFilter = z.infer<typeof AcceptedTruthFilterSchema>;
export type AcceptedTruthListItem = z.infer<typeof AcceptedTruthListItemSchema>;
export type CandidateReviewDetail = z.infer<typeof CandidateReviewDetailSchema>;
export type CandidateReviewQueueCounts = z.infer<typeof CandidateReviewQueueCountsSchema>;
export type CandidateReviewQueueItem = z.infer<typeof CandidateReviewQueueItemSchema>;
export type CandidateReviewQueueResponse = z.infer<typeof CandidateReviewQueueResponseSchema>;
export type CandidateLineageSummary = z.infer<typeof CandidateLineageSummarySchema>;
export type RelatedCandidateSummary = z.infer<typeof RelatedCandidateSummarySchema>;
export type ReviewArtifactSummary = z.infer<typeof ReviewArtifactSummarySchema>;
export type ReviewCandidateActionRequest = z.infer<typeof ReviewCandidateActionRequestSchema>;
export type ReviewCandidateActionResponse = z.infer<typeof ReviewCandidateActionResponseSchema>;
export type ReviewCandidateActionType = z.infer<typeof ReviewCandidateActionTypeSchema>;
export type ReviewHistoryEntry = z.infer<typeof ReviewHistoryEntrySchema>;
