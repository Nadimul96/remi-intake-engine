import { z } from "zod";

import { AcceptedRecordTypeSchema, ExtractedCandidateSummarySchema } from "./candidates";
import { ProvenanceAnchorSummarySchema } from "./content";
import { AcceptedRecordSummarySchema, ReviewArtifactSummarySchema, ReviewHistoryEntrySchema } from "./review";

export const canonicalEntityTypes = ["asset", "organization"] as const;
export const canonicalEntityAliasTypes = ["observed_name", "observed_domain"] as const;
export const entityResolutionProposalKinds = ["create_entity", "attach_to_existing"] as const;
export const entityResolutionProposalStates = ["pending_review", "accepted", "rejected", "superseded"] as const;
export const entityResolutionDecisionActions = ["accept", "reject"] as const;
export const entityResolutionSystemEventTypes = [
  "proposal_superseded",
  "proposal_reactivated",
  "stale_link_removed",
  "active_link_preserved",
  "alias_removed"
] as const;
export const entityResolutionMatchCategories = [
  "active_link",
  "exact_match",
  "alias_match",
  "possible_match",
  "create_new"
] as const;
export const entityResolutionMatchSignalTypes = [
  "active_entity_link",
  "exact_name_match",
  "exact_domain_match",
  "alias_match",
  "possible_name_overlap"
] as const;

export const CanonicalEntityTypeSchema = z.enum(canonicalEntityTypes);
export const CanonicalEntityAliasTypeSchema = z.enum(canonicalEntityAliasTypes);
export const EntityResolutionProposalKindSchema = z.enum(entityResolutionProposalKinds);
export const EntityResolutionProposalStateSchema = z.enum(entityResolutionProposalStates);
export const EntityResolutionDecisionActionSchema = z.enum(entityResolutionDecisionActions);
export const EntityResolutionSystemEventTypeSchema = z.enum(entityResolutionSystemEventTypes);
export const EntityResolutionMatchCategorySchema = z.enum(entityResolutionMatchCategories);
export const EntityResolutionMatchSignalTypeSchema = z.enum(entityResolutionMatchSignalTypes);

export const CanonicalEntityAliasSummarySchema = z.object({
  id: z.string(),
  canonicalEntityId: z.string(),
  canonicalEntityType: CanonicalEntityTypeSchema,
  aliasType: CanonicalEntityAliasTypeSchema,
  aliasValue: z.string().min(1),
  normalizedAliasValue: z.string().min(1),
  sourceAcceptedRecordType: AcceptedRecordTypeSchema.nullable(),
  sourceAcceptedRecordId: z.string().nullable(),
  sourceCandidateId: z.string().nullable(),
  sourceArtifactBlobId: z.string().nullable(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CanonicalEntitySummarySchema = z.object({
  id: z.string(),
  entityType: CanonicalEntityTypeSchema,
  displayName: z.string().min(1),
  normalizedName: z.string().min(1),
  status: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  aliases: z.array(CanonicalEntityAliasSummarySchema),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const EntityResolutionMatchCandidateSchema = z.object({
  entityId: z.string(),
  entityDisplayName: z.string().min(1),
  signalType: EntityResolutionMatchSignalTypeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  matchedName: z.string().min(1),
  matchedFrom: z.string().min(1),
  aliasId: z.string().nullable(),
  aliasValue: z.string().nullable()
});

export const AcceptedTruthEntityLinkSchema = z.object({
  id: z.string(),
  sourceCandidateId: z.string(),
  acceptedRecordType: z.string().min(1),
  acceptedRecordId: z.string(),
  canonicalEntityId: z.string(),
  canonicalEntityType: CanonicalEntityTypeSchema,
  canonicalEntityDisplayName: z.string().min(1),
  linkStatus: z.string().min(1),
  linkReason: z.string().min(1),
  reviewerActorId: z.string(),
  reviewerActorName: z.string(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const EntityResolutionProposalSummarySchema = z.object({
  id: z.string(),
  sourceCandidateId: z.string(),
  acceptedRecordType: z.string().min(1),
  acceptedRecordId: z.string(),
  entityType: CanonicalEntityTypeSchema,
  proposalKind: EntityResolutionProposalKindSchema,
  proposalState: EntityResolutionProposalStateSchema,
  proposedDisplayName: z.string().min(1),
  normalizedDisplayName: z.string().min(1),
  targetEntityId: z.string().nullable(),
  targetEntityDisplayName: z.string().nullable(),
  resolvedEntityId: z.string().nullable(),
  resolvedEntityDisplayName: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  matchCategory: EntityResolutionMatchCategorySchema,
  matchStrategy: z.string().min(1),
  matchingCandidates: z.array(EntityResolutionMatchCandidateSchema),
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

export const EntityResolutionHistoryEntrySchema = z.object({
  id: z.string(),
  proposalId: z.string(),
  sourceCandidateId: z.string(),
  acceptedRecordType: z.string().min(1),
  acceptedRecordId: z.string(),
  previousProposalState: EntityResolutionProposalStateSchema,
  newProposalState: EntityResolutionProposalStateSchema,
  action: EntityResolutionDecisionActionSchema,
  chosenEntityId: z.string().nullable(),
  chosenEntityDisplayName: z.string().nullable(),
  chosenEntityCreated: z.boolean(),
  createdAliasValues: z.array(z.string()),
  reviewNote: z.string().nullable(),
  reviewerActorId: z.string(),
  reviewerActorName: z.string(),
  createdAt: z.string()
});

export const EntityResolutionSystemEventSchema = z.object({
  id: z.string(),
  proposalId: z.string(),
  sourceCandidateId: z.string(),
  acceptedRecordType: z.string().min(1),
  acceptedRecordId: z.string(),
  eventType: EntityResolutionSystemEventTypeSchema,
  previousProposalState: EntityResolutionProposalStateSchema.nullable(),
  newProposalState: EntityResolutionProposalStateSchema.nullable(),
  canonicalEntityId: z.string().nullable(),
  canonicalEntityDisplayName: z.string().nullable(),
  aliasValues: z.array(z.string()),
  summary: z.string().min(1),
  createdAt: z.string()
});

export const EntityResolutionQueueItemSchema = z.object({
  proposal: EntityResolutionProposalSummarySchema,
  acceptedFieldName: z.string().min(1),
  acceptedValue: z.unknown(),
  artifactBlobId: z.string(),
  artifactFileName: z.string(),
  currentEntityLink: AcceptedTruthEntityLinkSchema.nullable()
});

export const EntityResolutionQueueCountsSchema = z.object({
  pendingReview: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  superseded: z.number().int().nonnegative(),
  attachedAcceptedTruths: z.number().int().nonnegative(),
  unattachedAcceptedTruths: z.number().int().nonnegative(),
  unsupportedAcceptedTruths: z.number().int().nonnegative(),
  canonicalEntities: z.number().int().nonnegative()
});

export const EntityResolutionQueueResponseSchema = z.object({
  counts: EntityResolutionQueueCountsSchema,
  items: z.array(EntityResolutionQueueItemSchema)
});

export const EntityResolutionDetailSchema = z.object({
  proposal: EntityResolutionProposalSummarySchema,
  acceptedRecord: AcceptedRecordSummarySchema,
  artifact: ReviewArtifactSummarySchema,
  sourceCandidate: ExtractedCandidateSummarySchema,
  provenanceAnchors: z.array(ProvenanceAnchorSummarySchema),
  reviewHistory: z.array(ReviewHistoryEntrySchema),
  reconciliationHistory: z.array(EntityResolutionHistoryEntrySchema),
  systemEvents: z.array(EntityResolutionSystemEventSchema),
  currentEntityLink: AcceptedTruthEntityLinkSchema.nullable(),
  matchingEntities: z.array(CanonicalEntitySummarySchema)
});

export const EntityResolutionDecisionRequestSchema = z
  .object({
    action: EntityResolutionDecisionActionSchema,
    note: z.string().trim().max(2_000).nullable().optional(),
    targetEntityId: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).max(255).optional(),
    entityType: CanonicalEntityTypeSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.action === "reject") {
      if (value.targetEntityId !== undefined || value.displayName !== undefined || value.entityType !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Entity overrides are only allowed when action is accept.",
          path: ["action"]
        });
      }
    }
  });

export const EntityResolutionDecisionResponseSchema = EntityResolutionDetailSchema.extend({
  action: EntityResolutionDecisionActionSchema
});

export type AcceptedTruthEntityLink = z.infer<typeof AcceptedTruthEntityLinkSchema>;
export type CanonicalEntityAliasSummary = z.infer<typeof CanonicalEntityAliasSummarySchema>;
export type CanonicalEntityAliasType = z.infer<typeof CanonicalEntityAliasTypeSchema>;
export type CanonicalEntitySummary = z.infer<typeof CanonicalEntitySummarySchema>;
export type CanonicalEntityType = z.infer<typeof CanonicalEntityTypeSchema>;
export type EntityResolutionDecisionAction = z.infer<typeof EntityResolutionDecisionActionSchema>;
export type EntityResolutionDecisionRequest = z.infer<typeof EntityResolutionDecisionRequestSchema>;
export type EntityResolutionDecisionResponse = z.infer<typeof EntityResolutionDecisionResponseSchema>;
export type EntityResolutionDetail = z.infer<typeof EntityResolutionDetailSchema>;
export type EntityResolutionHistoryEntry = z.infer<typeof EntityResolutionHistoryEntrySchema>;
export type EntityResolutionMatchCandidate = z.infer<typeof EntityResolutionMatchCandidateSchema>;
export type EntityResolutionMatchCategory = z.infer<typeof EntityResolutionMatchCategorySchema>;
export type EntityResolutionMatchSignalType = z.infer<typeof EntityResolutionMatchSignalTypeSchema>;
export type EntityResolutionProposalKind = z.infer<typeof EntityResolutionProposalKindSchema>;
export type EntityResolutionProposalState = z.infer<typeof EntityResolutionProposalStateSchema>;
export type EntityResolutionProposalSummary = z.infer<typeof EntityResolutionProposalSummarySchema>;
export type EntityResolutionQueueCounts = z.infer<typeof EntityResolutionQueueCountsSchema>;
export type EntityResolutionQueueItem = z.infer<typeof EntityResolutionQueueItemSchema>;
export type EntityResolutionQueueResponse = z.infer<typeof EntityResolutionQueueResponseSchema>;
export type EntityResolutionSystemEvent = z.infer<typeof EntityResolutionSystemEventSchema>;
export type EntityResolutionSystemEventType = z.infer<typeof EntityResolutionSystemEventTypeSchema>;
