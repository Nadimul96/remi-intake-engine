import type { IntakeRegistrationWorkflowInput } from "@remi/domain";
import { proxyActivities } from "@temporalio/workflow";

interface IntakeActivities {
  extractCandidatesForUploadedArtifact(input: {
    actorId: string;
    artifactBlobId: string;
    fileName: string;
    ingestionRunId: string;
    sourceItemId: string;
    tenantId: string;
    workflowRunId: string;
  }): Promise<{
    candidateCount: number;
    reusedExistingBlob: boolean;
    status: "completed" | "completed_with_warnings" | "deferred" | "failed" | "pending" | "skipped";
  }>;
  failUploadedArtifact(input: {
    actorId: string;
    errorMessage: string;
    ingestionRunId: string;
    sourceItemId: string;
    workflowRunId: string;
  }): Promise<void>;
  finalizeUploadedArtifact(input: {
    actorId: string;
    artifactBlobId: string;
    contentType: string | null;
    ingestionRunId: string;
    sourceItemId: string;
    workflowRunId: string;
  }): Promise<void>;
  inspectUploadedArtifact(input: {
    actorId: string;
    artifactBlobId: string;
    contentType: string | null;
    fileName: string;
    ingestionRunId: string;
    sha256: string;
    sizeBytes: number;
    sourceItemId: string;
    storageKey: string;
    workflowRunId: string;
  }): Promise<{
    derivedArtifacts: {
      id: string;
      kind: "artifact_inspection" | "normalized_metadata" | "preview_text";
      storageKey: string;
      version: number;
    }[];
    parserEligible: boolean;
    parserTarget: "archive" | "eml" | "none" | "pdf" | "xlsx";
    supportTier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
  }>;
  normalizeUploadedArtifact(input: {
    actorId: string;
    artifactBlobId: string;
    fileName: string;
    ingestionRunId: string;
    parserEligible: boolean;
    parserTarget: "archive" | "eml" | "none" | "pdf" | "xlsx";
    sourceItemId: string;
    storageKey: string;
    supportTier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
    tenantId: string;
    workflowRunId: string;
  }): Promise<{
    contentKind: "document" | "email" | "workbook" | null;
    skipped: boolean;
  }>;
  promoteUploadedArtifact(input: IntakeRegistrationWorkflowInput): Promise<{
    artifactBlobId: string;
    contentType: string | null;
    fileName: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }>;
}

const activities = proxyActivities<IntakeActivities>({
  retry: {
    maximumAttempts: 3
  },
  startToCloseTimeout: "5 minutes"
});

export async function registerIntakeSourceItemWorkflow(input: IntakeRegistrationWorkflowInput): Promise<{
  artifactBlobId: string;
  sha256: string;
  storageKey: string;
}> {
  try {
    const artifact = await activities.promoteUploadedArtifact(input);

    const inspection = await activities.inspectUploadedArtifact({
      actorId: input.actorId,
      artifactBlobId: artifact.artifactBlobId,
      contentType: artifact.contentType,
      fileName: artifact.fileName,
      ingestionRunId: input.ingestionRunId,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      sourceItemId: input.sourceItemId,
      storageKey: artifact.storageKey,
      workflowRunId: input.workflowRunId
    });

    await activities.normalizeUploadedArtifact({
      actorId: input.actorId,
      artifactBlobId: artifact.artifactBlobId,
      fileName: artifact.fileName,
      ingestionRunId: input.ingestionRunId,
      parserEligible: inspection.parserEligible,
      parserTarget: inspection.parserTarget,
      sourceItemId: input.sourceItemId,
      storageKey: artifact.storageKey,
      supportTier: inspection.supportTier,
      tenantId: input.tenantId,
      workflowRunId: input.workflowRunId
    });

    await activities.extractCandidatesForUploadedArtifact({
      actorId: input.actorId,
      artifactBlobId: artifact.artifactBlobId,
      fileName: artifact.fileName,
      ingestionRunId: input.ingestionRunId,
      sourceItemId: input.sourceItemId,
      tenantId: input.tenantId,
      workflowRunId: input.workflowRunId
    });

    await activities.finalizeUploadedArtifact({
      actorId: input.actorId,
      artifactBlobId: artifact.artifactBlobId,
      contentType: artifact.contentType,
      ingestionRunId: input.ingestionRunId,
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    return artifact;
  } catch (error) {
    await activities.failUploadedArtifact({
      actorId: input.actorId,
      errorMessage: error instanceof Error ? error.message : "Unknown intake workflow failure",
      ingestionRunId: input.ingestionRunId,
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    throw error;
  }
}
