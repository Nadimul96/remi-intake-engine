import { z } from "zod";

/**
 * value_mismatch     the same metric for the same asset and period disagrees across documents
 * version_conflict   underwriting model versions for the same asset disagree on a deal term
 * name_variants      several surface names resolve to one asset
 * covenant_breach    a reported ratio sits below a covenant minimum stated in the corpus
 * budget_variance    actuals exceed budget by more than the review threshold
 */
export const conflictKinds = [
  "value_mismatch",
  "version_conflict",
  "name_variants",
  "covenant_breach",
  "budget_variance"
] as const;
export const conflictSeverities = ["high", "medium", "low"] as const;
export const conflictStatuses = ["open", "resolved", "dismissed"] as const;
export const conflictResolutionActions = ["resolve", "dismiss", "reopen"] as const;

export const ConflictKindSchema = z.enum(conflictKinds);
export const ConflictSeveritySchema = z.enum(conflictSeverities);
export const ConflictStatusSchema = z.enum(conflictStatuses);
export const ConflictResolutionActionSchema = z.enum(conflictResolutionActions);

export const ConflictSideSchema = z.object({
  candidateId: z.string(),
  artifactBlobId: z.string(),
  fileName: z.string(),
  label: z.string(),
  display: z.string(),
  value: z.number().nullable(),
  note: z.string().nullable(),
  evidence: z.string(),
  locatorHint: z.string().nullable(),
  provenanceAnchorIds: z.array(z.string()).min(1)
});

export const ConflictSummarySchema = z.object({
  id: z.string(),
  conflictKey: z.string(),
  kind: ConflictKindSchema,
  severity: ConflictSeveritySchema,
  status: ConflictStatusSchema,
  assetName: z.string().nullable(),
  metric: z.string().nullable(),
  period: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  sides: z.array(ConflictSideSchema).min(1),
  resolvedCandidateId: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  resolvedByActorId: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  firstDetectedAt: z.string(),
  lastDetectedAt: z.string()
});

export const ConflictListResponseSchema = z.object({
  counts: z.object({
    open: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    dismissed: z.number().int().nonnegative()
  }),
  items: z.array(ConflictSummarySchema)
});

export const ConflictResolutionRequestSchema = z.object({
  action: ConflictResolutionActionSchema,
  candidateId: z.string().nullable().optional(),
  note: z.string().max(2000).nullable().optional()
});

export type ConflictKind = z.infer<typeof ConflictKindSchema>;
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;
export type ConflictStatus = z.infer<typeof ConflictStatusSchema>;
export type ConflictSide = z.infer<typeof ConflictSideSchema>;
export type ConflictSummary = z.infer<typeof ConflictSummarySchema>;
export type ConflictListResponse = z.infer<typeof ConflictListResponseSchema>;
export type ConflictResolutionRequest = z.infer<typeof ConflictResolutionRequestSchema>;
