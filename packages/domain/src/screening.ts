import { z } from "zod";

import { ExtractedCandidateSummarySchema } from "./candidates";
import { EntityResolutionQueueItemSchema } from "./entity";
import { IntakeDetailSchema } from "./intake";
import { AssetOrganizationRelationshipQueueItemSchema } from "./relationship";
import { AcceptedTruthBrowserCountsSchema, AcceptedTruthListItemSchema } from "./review";

export const screeningReadinessStatuses = ["ready", "needs_review", "insufficient_context"] as const;
export const screeningIssueKinds = [
  "candidate_review",
  "asset_identity",
  "organization_identity",
  "relationship_review",
  "intake_processing"
] as const;

export const ScreeningReadinessStatusSchema = z.enum(screeningReadinessStatuses);
export const ScreeningIssueKindSchema = z.enum(screeningIssueKinds);

export const ScreeningCandidateSummarySchema = z.object({
  pendingReview: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  editedAndAccepted: z.number().int().nonnegative(),
  items: z.array(ExtractedCandidateSummarySchema)
});

export const ScreeningAcceptedTruthSummarySchema = z.object({
  counts: AcceptedTruthBrowserCountsSchema,
  items: z.array(AcceptedTruthListItemSchema)
});

export const ScreeningLaneStatusSchema = z.object({
  currentTotal: z.number().int().nonnegative(),
  resolvedCurrent: z.number().int().nonnegative(),
  unresolvedCurrent: z.number().int().nonnegative()
});

export const ScreeningIssueSchema = z.object({
  id: z.string(),
  kind: ScreeningIssueKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  href: z.string().min(1)
});

export const ScreeningReadinessSummarySchema = z.object({
  status: ScreeningReadinessStatusSchema,
  about: z.string().min(1),
  pendingCandidateReviews: z.number().int().nonnegative(),
  assetIdentity: ScreeningLaneStatusSchema,
  organizationIdentity: ScreeningLaneStatusSchema,
  relationships: ScreeningLaneStatusSchema,
  needsAttention: z.array(ScreeningIssueSchema)
});

export const DealScreeningWorkbenchSchema = z.object({
  sourceItem: IntakeDetailSchema,
  candidateSignals: ScreeningCandidateSummarySchema,
  acceptedTruth: ScreeningAcceptedTruthSummarySchema,
  entityResolution: z.object({
    assetItems: z.array(EntityResolutionQueueItemSchema),
    organizationItems: z.array(EntityResolutionQueueItemSchema)
  }),
  relationships: z.object({
    currentItems: z.array(AssetOrganizationRelationshipQueueItemSchema),
    historicalItems: z.array(AssetOrganizationRelationshipQueueItemSchema)
  }),
  readiness: ScreeningReadinessSummarySchema
});

export type DealScreeningWorkbench = z.infer<typeof DealScreeningWorkbenchSchema>;
export type ScreeningAcceptedTruthSummary = z.infer<typeof ScreeningAcceptedTruthSummarySchema>;
export type ScreeningCandidateSummary = z.infer<typeof ScreeningCandidateSummarySchema>;
export type ScreeningIssue = z.infer<typeof ScreeningIssueSchema>;
export type ScreeningIssueKind = z.infer<typeof ScreeningIssueKindSchema>;
export type ScreeningLaneStatus = z.infer<typeof ScreeningLaneStatusSchema>;
export type ScreeningReadinessStatus = z.infer<typeof ScreeningReadinessStatusSchema>;
export type ScreeningReadinessSummary = z.infer<typeof ScreeningReadinessSummarySchema>;
