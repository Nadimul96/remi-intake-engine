import { createHash } from "node:crypto";

import type {
  CandidateCitationPacket,
  CandidateExtractionMethod,
  ExtractedCandidateType,
  ProvenanceAnchorSummary
} from "@remi/domain";

export interface CandidateDraft {
  candidateKey: string;
  candidateType: ExtractedCandidateType;
  candidateValue: unknown;
  citationPacket: CandidateCitationPacket;
  confidence: number;
  extractionMethod: CandidateExtractionMethod;
  extractionMethodDetail: string;
  fieldName: string;
  metadata?: Record<string, unknown>;
  reviewReady: boolean;
  sourceSemanticObjectId: string | null;
  sourceSemanticObjectType: string | null;
  summary: string;
  valueType: string;
}

export interface DraftInput {
  artifactBlobId: string;
  candidateType: ExtractedCandidateType;
  candidateValue: unknown;
  confidence: number;
  evidencePreview: string;
  extractionMetadata?: Record<string, unknown>;
  extractionMethod: CandidateExtractionMethod;
  extractionMethodDetail: string;
  fieldName: string;
  metadata?: Record<string, unknown>;
  provenanceAnchors: ProvenanceAnchorSummary[];
  summary: string;
  valueType: string;
}

/**
 * A candidate is never just a value: it carries a citation packet that names the
 * anchors justifying it. The candidate key is a content hash, so re-extracting the
 * same artifact yields the same keys and supersession can diff old against new.
 */
export function buildCandidateDraft(input: DraftInput): CandidateDraft {
  const provenanceAnchorIds = input.provenanceAnchors.map((anchor) => anchor.id);
  const primary = input.provenanceAnchors[0] ?? null;
  const candidateKey = createHash("sha1")
    .update(
      JSON.stringify({
        artifactBlobId: input.artifactBlobId,
        candidateType: input.candidateType,
        fieldName: input.fieldName,
        provenanceAnchorIds,
        sourceSemanticObjectId: primary?.ownerId ?? null,
        sourceSemanticObjectType: primary?.ownerType ?? null,
        value: input.candidateValue
      })
    )
    .digest("hex");

  return {
    candidateKey,
    candidateType: input.candidateType,
    candidateValue: input.candidateValue,
    citationPacket: {
      candidateType: input.candidateType,
      fieldName: input.fieldName,
      candidateValue: input.candidateValue,
      confidenceScore: input.confidence,
      sourceArtifactBlobId: input.artifactBlobId,
      sourceSemanticObjectType: primary?.ownerType ?? null,
      sourceSemanticObjectId: primary?.ownerId ?? null,
      provenanceAnchorIds,
      evidencePreview: input.evidencePreview,
      extractionMethod: input.extractionMethod,
      extractionMethodDetail: input.extractionMethodDetail,
      extractionMetadata: input.extractionMetadata ?? {},
      createdAt: new Date().toISOString()
    },
    confidence: input.confidence,
    extractionMethod: input.extractionMethod,
    extractionMethodDetail: input.extractionMethodDetail,
    fieldName: input.fieldName,
    metadata: input.metadata,
    reviewReady: provenanceAnchorIds.length > 0 && input.evidencePreview.length > 0,
    sourceSemanticObjectId: primary?.ownerId ?? null,
    sourceSemanticObjectType: primary?.ownerType ?? null,
    summary: input.summary,
    valueType: input.valueType
  };
}

export function dedupeCandidates(candidates: CandidateDraft[]): CandidateDraft[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.candidateKey)) {
      return false;
    }
    seen.add(candidate.candidateKey);
    return true;
  });
}
