import { z } from "zod";
import { ExtractedCandidateSummarySchema } from "./candidates";
import { ProvenanceAnchorSummarySchema } from "./content";
import { CanonicalEntitySummarySchema } from "./entity";
import { AcceptedRecordSummarySchema, ReviewArtifactSummarySchema, ReviewHistoryEntrySchema } from "./review";

export const assetOrganizationRelationshipTypes = [
  "originating_organization_for_asset",
  "broker_organization_for_asset"
] as const;
export const relationshipResolutionProposalStates = ["pending_review", "accepted", "rejected", "superseded"] as const;
export const relationshipResolutionDecisionActions = ["accept", "reject"] as const;
export const relationshipAcceptedRecordStatuses = ["active", "unsupported", "deleted"] as const;
export const relationshipResolutionSystemEventTypes = [
  "proposal_superseded",
  "proposal_reactivated",
  "stale_link_removed",
  "active_link_preserved"
] as const;
export const relationshipQueueTypeFilters = ["all", ...assetOrganizationRelationshipTypes] as const;
export const relationshipQueueLifecycleFilters = ["all", "current", "historical"] as const;
export const relationshipQueueLinkFilters = ["all", "linked", "unlinked"] as const;
export const relationshipQueueStateFilters = ["all", ...relationshipResolutionProposalStates] as const;
export const relationshipResolutionReadinessStates = [
  "ready_to_attach",
  "multiple_candidates",
  "missing_asset",
  "missing_organization",
  "missing_both"
] as const;
export const relationshipEntityMatchSignalTypes = [
  "artifact_entity_link",
  "exact_name_match",
  "exact_domain_match",
  "alias_match"
] as const;

export const AssetOrganizationRelationshipTypeSchema = z.enum(assetOrganizationRelationshipTypes);
export const RelationshipResolutionProposalStateSchema = z.enum(relationshipResolutionProposalStates);
export const RelationshipResolutionDecisionActionSchema = z.enum(relationshipResolutionDecisionActions);
export const RelationshipAcceptedRecordStatusSchema = z.enum(relationshipAcceptedRecordStatuses);
export const RelationshipResolutionSystemEventTypeSchema = z.enum(relationshipResolutionSystemEventTypes);
export const RelationshipQueueTypeFilterSchema = z.enum(relationshipQueueTypeFilters);
export const RelationshipQueueLifecycleFilterSchema = z.enum(relationshipQueueLifecycleFilters);
export const RelationshipQueueLinkFilterSchema = z.enum(relationshipQueueLinkFilters);
export const RelationshipQueueStateFilterSchema = z.enum(relationshipQueueStateFilters);
export const RelationshipResolutionReadinessStateSchema = z.enum(relationshipResolutionReadinessStates);
export const RelationshipEntityMatchSignalTypeSchema = z.enum(relationshipEntityMatchSignalTypes);

export const RelationshipEntityMatchCandidateSchema = z.object({
  entityId: z.string(),
  entityDisplayName: z.string().min(1),
  signalType: RelationshipEntityMatchSignalTypeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  matchedName: z.string().min(1),
  matchedFrom: z.string().min(1)
});

export const AcceptedAssetOrganizationRelationshipLinkSchema = z.object({
  id: z.string(),
  sourceCandidateId: z.string(),
  acceptedRecordId: z.string(),
  relationshipType: AssetOrganizationRelationshipTypeSchema,
  canonicalAssetEntityId: z.string(),
  canonicalAssetDisplayName: z.string().min(1),
  canonicalOrganizationEntityId: z.string(),
  canonicalOrganizationDisplayName: z.string().min(1),
  linkStatus: z.string().min(1),
  linkReason: z.string().min(1),
  reviewerActorId: z.string(),
  reviewerActorName: z.string(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const AssetOrganizationRelationshipProposalSummarySchema = z.object({
  id: z.string(),
  sourceCandidateId: z.string(),
  acceptedRecordId: z.string(),
  relationshipType: AssetOrganizationRelationshipTypeSchema,
  proposalState: RelationshipResolutionProposalStateSchema,
  resolutionReadiness: RelationshipResolutionReadinessStateSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  assetEntityId: z.string().nullable(),
  assetEntityDisplayName: z.string().nullable(),
  organizationEntityId: z.string().nullable(),
  organizationEntityDisplayName: z.string().nullable(),
  assetCandidates: z.array(RelationshipEntityMatchCandidateSchema),
  organizationCandidates: z.array(RelationshipEntityMatchCandidateSchema),
  currentProposal: z.boolean(),
  supersededAt: z.string().nullable(),
  statusExplanation: z.string().min(1),
  reviewNote: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewedByActorId: z.string().nullable(),
  reviewedByActorName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const RelationshipResolutionHistoryEntrySchema = z.object({
  id: z.string(),
  proposalId: z.string(),
  sourceCandidateId: z.string(),
  acceptedRecordId: z.string(),
  previousProposalState: RelationshipResolutionProposalStateSchema,
  newProposalState: RelationshipResolutionProposalStateSchema,
  action: RelationshipResolutionDecisionActionSchema,
  chosenCanonicalAssetEntityId: z.string().nullable(),
  chosenCanonicalAssetDisplayName: z.string().nullable(),
  chosenCanonicalOrganizationEntityId: z.string().nullable(),
  chosenCanonicalOrganizationDisplayName: z.string().nullable(),
  reviewNote: z.string().nullable(),
  reviewerActorId: z.string(),
  reviewerActorName: z.string(),
  createdAt: z.string()
});

export const RelationshipResolutionSystemEventSchema = z.object({
  id: z.string(),
  proposalId: z.string(),
  sourceCandidateId: z.string(),
  acceptedRecordId: z.string(),
  eventType: RelationshipResolutionSystemEventTypeSchema,
  previousProposalState: RelationshipResolutionProposalStateSchema.nullable(),
  newProposalState: RelationshipResolutionProposalStateSchema.nullable(),
  canonicalAssetEntityId: z.string().nullable(),
  canonicalAssetDisplayName: z.string().nullable(),
  canonicalOrganizationEntityId: z.string().nullable(),
  canonicalOrganizationDisplayName: z.string().nullable(),
  summary: z.string().min(1),
  createdAt: z.string()
});

export const AssetOrganizationRelationshipQueueItemSchema = z.object({
  proposal: AssetOrganizationRelationshipProposalSummarySchema,
  acceptedFieldName: z.string().min(1),
  acceptedValue: z.unknown(),
  acceptedRecordStatus: RelationshipAcceptedRecordStatusSchema,
  artifactBlobId: z.string(),
  artifactFileName: z.string(),
  currentRelationshipLink: AcceptedAssetOrganizationRelationshipLinkSchema.nullable()
});

export const AssetOrganizationRelationshipQueueCountsSchema = z.object({
  pendingReview: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  superseded: z.number().int().nonnegative(),
  attachedAcceptedRelationships: z.number().int().nonnegative(),
  unattachedAcceptedRelationships: z.number().int().nonnegative(),
  unsupportedAcceptedRelationships: z.number().int().nonnegative()
});

export const AssetOrganizationRelationshipQueueResponseSchema = z.object({
  counts: AssetOrganizationRelationshipQueueCountsSchema,
  items: z.array(AssetOrganizationRelationshipQueueItemSchema)
});

export const RelationshipQueueFiltersSchema = z.object({
  relationshipType: RelationshipQueueTypeFilterSchema.default("all"),
  lifecycle: RelationshipQueueLifecycleFilterSchema.default("all"),
  linkState: RelationshipQueueLinkFilterSchema.default("all"),
  proposalState: RelationshipQueueStateFilterSchema.default("all")
});

export const AssetOrganizationRelationshipDetailSchema = z.object({
  proposal: AssetOrganizationRelationshipProposalSummarySchema,
  acceptedRecord: AcceptedRecordSummarySchema,
  acceptedRecordStatus: RelationshipAcceptedRecordStatusSchema,
  acceptedRecordStatusExplanation: z.string().min(1),
  artifact: ReviewArtifactSummarySchema,
  sourceCandidate: ExtractedCandidateSummarySchema,
  provenanceAnchors: z.array(ProvenanceAnchorSummarySchema),
  reviewHistory: z.array(ReviewHistoryEntrySchema),
  reconciliationHistory: z.array(RelationshipResolutionHistoryEntrySchema),
  systemEvents: z.array(RelationshipResolutionSystemEventSchema),
  currentRelationshipLink: AcceptedAssetOrganizationRelationshipLinkSchema.nullable(),
  matchingAssets: z.array(CanonicalEntitySummarySchema),
  matchingOrganizations: z.array(CanonicalEntitySummarySchema)
});

export const RelationshipResolutionDecisionRequestSchema = z
  .object({
    action: RelationshipResolutionDecisionActionSchema,
    note: z.string().trim().max(2_000).nullable().optional(),
    canonicalAssetEntityId: z.string().trim().min(1).optional(),
    canonicalOrganizationEntityId: z.string().trim().min(1).optional()
  })
  .superRefine((value, context) => {
    if (value.action === "accept") {
      if (!value.canonicalAssetEntityId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "canonicalAssetEntityId is required when action is accept.",
          path: ["canonicalAssetEntityId"]
        });
      }

      if (!value.canonicalOrganizationEntityId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "canonicalOrganizationEntityId is required when action is accept.",
          path: ["canonicalOrganizationEntityId"]
        });
      }
    }

    if (
      value.action === "reject" &&
      (value.canonicalAssetEntityId !== undefined || value.canonicalOrganizationEntityId !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Entity selections are only allowed when action is accept.",
        path: ["action"]
      });
    }
  });

export const RelationshipResolutionDecisionResponseSchema = AssetOrganizationRelationshipDetailSchema.extend({
  action: RelationshipResolutionDecisionActionSchema
});

export type AcceptedAssetOrganizationRelationshipLink = z.infer<typeof AcceptedAssetOrganizationRelationshipLinkSchema>;
export type AssetOrganizationRelationshipDetail = z.infer<typeof AssetOrganizationRelationshipDetailSchema>;
export type AssetOrganizationRelationshipProposalSummary = z.infer<
  typeof AssetOrganizationRelationshipProposalSummarySchema
>;
export type AssetOrganizationRelationshipQueueCounts = z.infer<typeof AssetOrganizationRelationshipQueueCountsSchema>;
export type AssetOrganizationRelationshipQueueFilters = z.infer<typeof RelationshipQueueFiltersSchema>;
export type AssetOrganizationRelationshipQueueItem = z.infer<typeof AssetOrganizationRelationshipQueueItemSchema>;
export type AssetOrganizationRelationshipQueueResponse = z.infer<
  typeof AssetOrganizationRelationshipQueueResponseSchema
>;
export type AssetOrganizationRelationshipType = z.infer<typeof AssetOrganizationRelationshipTypeSchema>;
export type RelationshipAcceptedRecordStatus = z.infer<typeof RelationshipAcceptedRecordStatusSchema>;
export type RelationshipEntityMatchCandidate = z.infer<typeof RelationshipEntityMatchCandidateSchema>;
export type RelationshipResolutionDecisionAction = z.infer<typeof RelationshipResolutionDecisionActionSchema>;
export type RelationshipResolutionDecisionRequest = z.infer<typeof RelationshipResolutionDecisionRequestSchema>;
export type RelationshipResolutionDecisionResponse = z.infer<typeof RelationshipResolutionDecisionResponseSchema>;
export type RelationshipResolutionHistoryEntry = z.infer<typeof RelationshipResolutionHistoryEntrySchema>;
export type RelationshipResolutionProposalState = z.infer<typeof RelationshipResolutionProposalStateSchema>;
export type RelationshipResolutionReadinessState = z.infer<typeof RelationshipResolutionReadinessStateSchema>;
export type RelationshipQueueLifecycleFilter = z.infer<typeof RelationshipQueueLifecycleFilterSchema>;
export type RelationshipQueueLinkFilter = z.infer<typeof RelationshipQueueLinkFilterSchema>;
export type RelationshipQueueStateFilter = z.infer<typeof RelationshipQueueStateFilterSchema>;
export type RelationshipQueueTypeFilter = z.infer<typeof RelationshipQueueTypeFilterSchema>;
export type RelationshipResolutionSystemEvent = z.infer<typeof RelationshipResolutionSystemEventSchema>;
export type RelationshipResolutionSystemEventType = z.infer<typeof RelationshipResolutionSystemEventTypeSchema>;
