import { createHash } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { NormalizedContentInput } from "@remi/db";
import {
  completeIngestion,
  failIngestion,
  getArtifactProcessingSummary,
  getBlobReuseState,
  getCandidateExtractionSummary,
  getExtractedCandidates,
  getNormalizedContentRecords,
  getProvenanceAnchorsSummary,
  markAnchoringStarted,
  markCandidateExtractionStarted,
  markIngestionImmutableStored,
  markIngestionProcessing,
  markInspectionStarted,
  markNormalizationStarted,
  persistNormalizedContent,
  persistProvenanceAnchors,
  recordAnchoringFailure,
  recordAnchoringSkipped,
  recordCandidateExtractionFailure,
  recordCandidateExtractionSkipped,
  recordCandidateSignals,
  recordInspectionArtifacts,
  recordInspectionFailure,
  recordNormalizationFailure,
  recordNormalizationSkipped,
  recordNormalizedContent,
  recordProvenanceAnchors,
  replaceExtractedCandidates,
  updateAttachmentPromotion,
  upsertArtifactBlob,
  upsertArtifactProcessingState,
  upsertCandidateExtractionState,
  upsertDerivedArtifact
} from "@remi/db";
import type {
  ArtifactParserTarget,
  CandidateExtractionResult,
  NormalizedContentKind,
  NormalizedContentSummary,
  ParserResultStatus,
  ParserWarning
} from "@remi/domain";
import { buildProvenanceAnchors, extractEvidenceBackedCandidates } from "@remi/extraction";
import { fileTypeFromBuffer } from "file-type";
import { workflowConfig } from "../config";

const s3Client = new S3Client({
  credentials: {
    accessKeyId: workflowConfig.s3.accessKeyId,
    secretAccessKey: workflowConfig.s3.secretAccessKey
  },
  endpoint: workflowConfig.s3.endpoint,
  forcePathStyle: workflowConfig.s3.forcePathStyle,
  region: workflowConfig.s3.region
});

async function readObjectBuffer(key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: workflowConfig.bucket,
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error(`Object body missing for ${key}`);
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

async function getObjectMetadata(
  key: string
): Promise<{ contentType: string | null; originalFileName: string | null }> {
  const response = await s3Client.send(
    new HeadObjectCommand({
      Bucket: workflowConfig.bucket,
      Key: key
    })
  );

  return {
    contentType: response.ContentType ?? null,
    originalFileName: response.Metadata?.["original-file-name"] ?? null
  };
}

async function createPresignedDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: workflowConfig.bucket,
      Key: key
    }),
    {
      expiresIn: 60 * 10
    }
  );
}

function buildDerivedStorageKey(input: {
  artifactBlobId: string;
  extension: "json" | "txt";
  kind:
    | "artifact_inspection"
    | "candidate_citation_packets"
    | "normalized_metadata"
    | "preview_text"
    | "provenance_anchor_manifest";
  version: number;
}): string {
  return `${workflowConfig.derivedPrefix}/${input.artifactBlobId}/${input.kind}/v${input.version}.${input.extension}`;
}

async function writeDerivedObject(input: { body: string; contentType: string; key: string }): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: workflowConfig.bucket,
      ContentType: input.contentType,
      Key: input.key
    })
  );
}

interface InspectionServiceResponse {
  inspection: Record<string, unknown>;
  normalized_metadata: Record<string, unknown>;
  preview_text: string | null;
  review_required: boolean;
}

interface NormalizeServiceResponse {
  content_kind: "document" | "email" | "workbook";
  normalized_content: NormalizedContentInput;
}

function contentKindLabel(value: NormalizedContentKind | null): string {
  switch (value) {
    case "document":
      return "document";
    case "email":
      return "email";
    case "workbook":
      return "workbook";
    default:
      return "content";
  }
}

function buildParserWarnings(input: {
  parserTarget: SupportedParserTarget;
  supportTier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
}): ParserWarning[] {
  const warnings: ParserWarning[] = [];

  if (input.supportTier === "best_effort") {
    warnings.push({
      code: "best_effort_support_tier",
      message: "Artifact normalized under best-effort support; later review or OCR fallback may still be needed."
    });
  }

  return warnings;
}

function groupAnchorCounts(items: { anchorKind: string; count: number }[]): Record<string, number> {
  return Object.fromEntries(items.map((item) => [item.anchorKind, item.count]));
}

type SupportedParserTarget = Extract<ArtifactParserTarget, "csv" | "eml" | "pdf" | "text" | "xlsx">;
const NORMALIZABLE_TARGETS: ReadonlySet<ArtifactParserTarget> = new Set(["csv", "eml", "pdf", "text", "xlsx"]);

type BlobInspectionResult = {
  derivedArtifacts: {
    id: string;
    kind: "artifact_inspection" | "normalized_metadata" | "preview_text";
    storageKey: string;
    version: number;
  }[];
  inspectionStatus: "completed" | "failed" | "pending" | "unsupported";
  parserEligible: boolean;
  parserTarget: ArtifactParserTarget;
  supportTier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
};

type AttachmentHandoffOutcome = {
  deferredCount: number;
  downstreamFailedCount: number;
  processedCount: number;
  promotedCount: number;
  promotionFailedCount: number;
  reusedBlobCount: number;
  warnings: ParserWarning[];
};

type BlobNormalizationResult = {
  anchorCount: number;
  candidateCount: number;
  contentKind: NormalizedContentKind | null;
  normalizedContent: NormalizedContentSummary;
  reasonCodes: string[];
  reprocessRecommended: boolean;
  retryRecommended: boolean;
  reusedExistingBlob: boolean;
  status: Extract<ParserResultStatus, "completed" | "completed_with_warnings" | "deferred">;
  summary: string;
  warnings: ParserWarning[];
};

type BlobCandidateExtractionResult = {
  candidateCount: number;
  candidates: Awaited<ReturnType<typeof getExtractedCandidates>>;
  result: CandidateExtractionResult;
  reusedExistingBlob: boolean;
};

function supportsNormalizationTarget(target: ArtifactParserTarget): target is SupportedParserTarget {
  return NORMALIZABLE_TARGETS.has(target);
}

function emptyNormalizedContent(): NormalizedContentSummary {
  return {
    attachments: [],
    contentKind: null,
    document: null,
    documentPages: [],
    emailMessages: [],
    emailThread: null,
    lastNormalizedAt: null,
    structuredTables: [],
    workbook: null,
    worksheets: []
  };
}

function buildAttachmentProcessingWarnings(input: AttachmentHandoffOutcome): ParserWarning[] {
  const warnings: ParserWarning[] = [];

  if (input.promotionFailedCount > 0) {
    warnings.push({
      code: "attachment_promotion_failed",
      message: `${input.promotionFailedCount} attachment(s) failed blob promotion.`
    });
  }

  if (input.downstreamFailedCount > 0) {
    warnings.push({
      code: "attachment_child_processing_failed",
      message: `${input.downstreamFailedCount} promoted attachment(s) failed downstream inspection or normalization.`
    });
  }

  if (input.deferredCount > 0) {
    warnings.push({
      code: "attachment_child_deferred",
      message: `${input.deferredCount} promoted attachment(s) are unsupported or deferred in v1.`
    });
  }

  return warnings;
}

async function writeBlobObject(input: {
  body: Buffer;
  contentType: string | null;
  fileName: string;
  key: string;
}): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: workflowConfig.bucket,
      ContentType: input.contentType ?? "application/octet-stream",
      Key: input.key,
      Metadata: {
        "original-file-name": input.fileName
      }
    })
  );
}

async function ensureImmutableBlobFromBuffer(input: {
  buffer: Buffer;
  contentType: string | null;
  fileName: string;
  tenantId: string;
}): Promise<{
  artifactBlobId: string;
  contentType: string | null;
  fileName: string;
  reusedExistingBlob: boolean;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}> {
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  const detected = await fileTypeFromBuffer(input.buffer);
  const immutableKey = `${workflowConfig.immutablePrefix}/sha256/${sha256}`;
  let reusedExistingBlob = false;

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: workflowConfig.bucket,
        Key: immutableKey
      })
    );
    reusedExistingBlob = true;
  } catch {
    await writeBlobObject({
      body: input.buffer,
      contentType: detected?.mime ?? input.contentType,
      fileName: input.fileName,
      key: immutableKey
    });
  }

  const artifactBlob = await upsertArtifactBlob({
    contentType: detected?.mime ?? input.contentType,
    fileName: input.fileName,
    sha256,
    sizeBytes: input.buffer.byteLength,
    storageBucket: workflowConfig.bucket,
    storageKey: immutableKey,
    tenantId: input.tenantId
  });

  return {
    artifactBlobId: artifactBlob.id,
    contentType: artifactBlob.contentType,
    fileName: artifactBlob.originalFileName,
    reusedExistingBlob,
    sha256,
    sizeBytes: artifactBlob.sizeBytes,
    storageKey: immutableKey
  };
}

async function persistAnchorManifest(input: {
  artifactBlobId: string;
  groups: { anchorKind: string; count: number }[];
  items: unknown[];
  totalCount: number;
}): Promise<void> {
  const manifestKey = buildDerivedStorageKey({
    artifactBlobId: input.artifactBlobId,
    extension: "json",
    kind: "provenance_anchor_manifest",
    version: 1
  });

  await writeDerivedObject({
    body: JSON.stringify(
      {
        groups: input.groups,
        items: input.items,
        totalCount: input.totalCount
      },
      null,
      2
    ),
    contentType: "application/json",
    key: manifestKey
  });

  await upsertDerivedArtifact({
    artifactBlobId: input.artifactBlobId,
    kind: "provenance_anchor_manifest",
    metadata: {
      contentType: "application/json",
      groupCount: input.groups.length,
      totalCount: input.totalCount
    },
    storageBucket: workflowConfig.bucket,
    storageKey: manifestKey,
    version: 1
  });
}

async function inspectArtifactBlobInternal(input: {
  artifactBlobId: string;
  contentType: string | null;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}): Promise<BlobInspectionResult> {
  const immutableUrl = await createPresignedDownloadUrl(input.storageKey);
  const response = await fetch(`${workflowConfig.extractorUrl}/inspect`, {
    body: JSON.stringify({
      artifact_blob_id: input.artifactBlobId,
      content_type: input.contentType,
      file_name: input.fileName,
      immutable_url: immutableUrl,
      sha256: input.sha256,
      size_bytes: input.sizeBytes
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Extractor inspection failed with status ${response.status}`);
  }

  const payload = (await response.json()) as InspectionServiceResponse;
  const version = 1;
  const created: BlobInspectionResult["derivedArtifacts"] = [];

  const inspectionKey = buildDerivedStorageKey({
    artifactBlobId: input.artifactBlobId,
    extension: "json",
    kind: "artifact_inspection",
    version
  });

  await writeDerivedObject({
    body: JSON.stringify(payload.inspection, null, 2),
    contentType: "application/json",
    key: inspectionKey
  });

  created.push({
    id: (
      await upsertDerivedArtifact({
        artifactBlobId: input.artifactBlobId,
        kind: "artifact_inspection",
        metadata: {
          ...payload.inspection,
          contentType: "application/json"
        },
        storageBucket: workflowConfig.bucket,
        storageKey: inspectionKey,
        version
      })
    ).id,
    kind: "artifact_inspection",
    storageKey: inspectionKey,
    version
  });

  const metadataKey = buildDerivedStorageKey({
    artifactBlobId: input.artifactBlobId,
    extension: "json",
    kind: "normalized_metadata",
    version
  });

  await writeDerivedObject({
    body: JSON.stringify(payload.normalized_metadata, null, 2),
    contentType: "application/json",
    key: metadataKey
  });

  created.push({
    id: (
      await upsertDerivedArtifact({
        artifactBlobId: input.artifactBlobId,
        kind: "normalized_metadata",
        metadata: {
          ...payload.normalized_metadata,
          contentType: "application/json"
        },
        storageBucket: workflowConfig.bucket,
        storageKey: metadataKey,
        version
      })
    ).id,
    kind: "normalized_metadata",
    storageKey: metadataKey,
    version
  });

  if (payload.preview_text) {
    const previewKey = buildDerivedStorageKey({
      artifactBlobId: input.artifactBlobId,
      extension: "txt",
      kind: "preview_text",
      version
    });

    await writeDerivedObject({
      body: payload.preview_text,
      contentType: "text/plain; charset=utf-8",
      key: previewKey
    });

    created.push({
      id: (
        await upsertDerivedArtifact({
          artifactBlobId: input.artifactBlobId,
          kind: "preview_text",
          metadata: {
            contentType: "text/plain; charset=utf-8",
            excerpt: payload.preview_text.slice(0, 200)
          },
          storageBucket: workflowConfig.bucket,
          storageKey: previewKey,
          version
        })
      ).id,
      kind: "preview_text",
      storageKey: previewKey,
      version
    });
  }

  return {
    derivedArtifacts: created,
    inspectionStatus:
      (payload.inspection.inspectionStatus as "completed" | "failed" | "pending" | "unsupported") ?? "completed",
    parserEligible: Boolean(payload.inspection.parserEligible),
    parserTarget: (payload.inspection.parserTarget as ArtifactParserTarget) ?? "none",
    supportTier:
      (payload.inspection.supportTier as "best_effort" | "deferred" | "supported" | "unsupported" | null) ?? null
  };
}

function groupCandidateCounts(candidates: Awaited<ReturnType<typeof getExtractedCandidates>>): Record<string, number> {
  return candidates.reduce<Record<string, number>>((accumulator, candidate) => {
    accumulator[candidate.candidateType] = (accumulator[candidate.candidateType] ?? 0) + 1;
    return accumulator;
  }, {});
}

async function persistCandidatePacketsArtifact(input: {
  artifactBlobId: string;
  candidates: Awaited<ReturnType<typeof getExtractedCandidates>>;
}): Promise<void> {
  const manifestKey = buildDerivedStorageKey({
    artifactBlobId: input.artifactBlobId,
    extension: "json",
    kind: "candidate_citation_packets",
    version: 1
  });
  const countsByType = groupCandidateCounts(input.candidates);

  await writeDerivedObject({
    body: JSON.stringify(
      {
        candidateCount: input.candidates.length,
        countsByType,
        items: input.candidates.map((candidate) => ({
          artifactBlobId: candidate.artifactBlobId,
          candidateType: candidate.candidateType,
          citationPacket: candidate.citationPacket,
          confidence: candidate.confidence,
          fieldName: candidate.fieldName,
          id: candidate.id,
          summary: candidate.summary
        }))
      },
      null,
      2
    ),
    contentType: "application/json",
    key: manifestKey
  });

  await upsertDerivedArtifact({
    artifactBlobId: input.artifactBlobId,
    kind: "candidate_citation_packets",
    metadata: {
      candidateCount: input.candidates.length,
      contentType: "application/json",
      countsByType
    },
    storageBucket: workflowConfig.bucket,
    storageKey: manifestKey,
    version: 1
  });
}

async function extractCandidatesForBlobInternal(input: {
  artifactBlobId: string;
  fileName: string;
  normalizedContent: NormalizedContentSummary;
  provenanceAnchors: Awaited<ReturnType<typeof getProvenanceAnchorsSummary>>;
  tenantId: string;
}): Promise<BlobCandidateExtractionResult> {
  const existing = await getCandidateExtractionSummary(input.artifactBlobId);

  if (
    existing &&
    (existing.status === "completed" || existing.status === "completed_with_warnings" || existing.status === "skipped")
  ) {
    const candidates = await getExtractedCandidates(input.artifactBlobId);
    if (existing.candidateCount === candidates.length) {
      return {
        candidateCount: candidates.length,
        candidates,
        result: existing,
        reusedExistingBlob: true
      };
    }
  }

  if (!input.normalizedContent.contentKind || input.provenanceAnchors.totalCount === 0) {
    await replaceExtractedCandidates({
      artifactBlobId: input.artifactBlobId,
      candidates: [],
      tenantId: input.tenantId
    });
    await persistCandidatePacketsArtifact({
      artifactBlobId: input.artifactBlobId,
      candidates: []
    });

    const result = await upsertCandidateExtractionState({
      artifactBlobId: input.artifactBlobId,
      candidateCount: 0,
      metadata: {
        anchorCount: input.provenanceAnchors.totalCount,
        contentKind: input.normalizedContent.contentKind
      },
      reasonCodes: ["candidate_extraction_missing_grounding"],
      reprocessRecommended: false,
      retryRecommended: false,
      status: "skipped",
      summary: "Candidate extraction skipped because normalized content or provenance anchors are unavailable.",
      warnings: []
    });

    return {
      candidateCount: 0,
      candidates: [],
      result,
      reusedExistingBlob: false
    };
  }

  const drafts = extractEvidenceBackedCandidates({
    artifactBlobId: input.artifactBlobId,
    fileName: input.fileName,
    normalizedContent: input.normalizedContent,
    provenanceAnchors: input.provenanceAnchors
  });
  const candidates = await replaceExtractedCandidates({
    artifactBlobId: input.artifactBlobId,
    candidates: drafts.map((candidate) => ({
      artifactBlobId: input.artifactBlobId,
      candidateKey: candidate.candidateKey,
      candidateType: candidate.candidateType,
      candidateValue: candidate.candidateValue,
      citationPacket: candidate.citationPacket,
      confidence: candidate.confidence,
      extractionMethod: candidate.extractionMethod,
      extractionMethodDetail: candidate.extractionMethodDetail,
      fieldName: candidate.fieldName,
      metadata: candidate.metadata,
      reviewReady: candidate.reviewReady,
      sourceSemanticObjectId: candidate.sourceSemanticObjectId,
      sourceSemanticObjectType: candidate.sourceSemanticObjectType,
      summary: candidate.summary,
      tenantId: input.tenantId,
      valueType: candidate.valueType
    })),
    tenantId: input.tenantId
  });
  await persistCandidatePacketsArtifact({
    artifactBlobId: input.artifactBlobId,
    candidates
  });

  const result = await upsertCandidateExtractionState({
    artifactBlobId: input.artifactBlobId,
    candidateCount: candidates.length,
    metadata: {
      anchorCount: input.provenanceAnchors.totalCount,
      contentKind: input.normalizedContent.contentKind,
      countsByType: groupCandidateCounts(candidates)
    },
    reasonCodes: candidates.length > 0 ? ["candidate_extraction_completed"] : ["no_reviewable_candidates_generated"],
    reprocessRecommended: false,
    retryRecommended: false,
    status: candidates.length > 0 ? "completed" : "skipped",
    summary:
      candidates.length > 0
        ? `${candidates.length} evidence-backed candidate signal(s) extracted.`
        : "No reviewable evidence-backed candidates were extracted from this artifact.",
    warnings: []
  });

  return {
    candidateCount: candidates.length,
    candidates,
    result,
    reusedExistingBlob: false
  };
}

async function promoteEmailAttachments(input: {
  attachmentDepth: number;
  normalizedContent: NormalizedContentSummary;
  normalizedEmailInput: Extract<NormalizedContentInput, { kind: "email" }>;
  parentArtifactBlobId: string;
  tenantId: string;
  visitedArtifactBlobIds: string[];
}): Promise<AttachmentHandoffOutcome> {
  const outcome: AttachmentHandoffOutcome = {
    deferredCount: 0,
    downstreamFailedCount: 0,
    processedCount: 0,
    promotedCount: 0,
    promotionFailedCount: 0,
    reusedBlobCount: 0,
    warnings: []
  };
  const semanticAttachments = new Map(
    input.normalizedContent.attachments.map((attachment) => [attachment.partIndex, attachment])
  );

  for (const rawAttachment of input.normalizedEmailInput.email.attachments) {
    const semanticAttachment = semanticAttachments.get(rawAttachment.partIndex);

    if (!semanticAttachment) {
      outcome.warnings.push({
        code: "attachment_semantic_link_missing",
        message: `Attachment part ${rawAttachment.partIndex} could not be matched to a semantic attachment row.`
      });
      continue;
    }

    if (rawAttachment.contentBase64 === null || rawAttachment.contentBase64 === undefined) {
      await updateAttachmentPromotion({
        attachmentId: semanticAttachment.id,
        promotedArtifactBlobId: null,
        promotionStatus: "promotion_failed",
        promotionSummary: "Attachment bytes were unavailable for blob promotion."
      });
      outcome.promotionFailedCount += 1;
      continue;
    }

    try {
      const buffer = Buffer.from(rawAttachment.contentBase64, "base64");
      const promotedBlob = await ensureImmutableBlobFromBuffer({
        buffer,
        contentType: rawAttachment.contentType,
        fileName: rawAttachment.fileName ?? `attachment-${rawAttachment.partIndex}`,
        tenantId: input.tenantId
      });

      await updateAttachmentPromotion({
        attachmentId: semanticAttachment.id,
        promotedArtifactBlobId: promotedBlob.artifactBlobId,
        promotionStatus: promotedBlob.reusedExistingBlob ? "reused_existing_blob" : "promoted",
        promotionSummary: promotedBlob.reusedExistingBlob
          ? "Attachment reused an existing immutable artifact blob."
          : "Attachment was promoted into an independent artifact blob."
      });

      if (promotedBlob.reusedExistingBlob) {
        outcome.reusedBlobCount += 1;
      } else {
        outcome.promotedCount += 1;
      }

      if (input.visitedArtifactBlobIds.includes(promotedBlob.artifactBlobId)) {
        outcome.warnings.push({
          code: "attachment_recursive_cycle_prevented",
          message: `Attachment ${rawAttachment.fileName ?? rawAttachment.partIndex} points to an already-visited artifact blob and was not recursively processed again.`
        });
        continue;
      }

      try {
        const childInspection = await inspectArtifactBlobInternal({
          artifactBlobId: promotedBlob.artifactBlobId,
          contentType: promotedBlob.contentType,
          fileName: promotedBlob.fileName,
          sha256: promotedBlob.sha256,
          sizeBytes: promotedBlob.sizeBytes,
          storageKey: promotedBlob.storageKey
        });

        const childResult = await processArtifactBlobInternal({
          artifactBlobId: promotedBlob.artifactBlobId,
          attachmentDepth: input.attachmentDepth + 1,
          contentType: promotedBlob.contentType,
          fileName: promotedBlob.fileName,
          inspection: childInspection,
          sha256: promotedBlob.sha256,
          sizeBytes: promotedBlob.sizeBytes,
          storageKey: promotedBlob.storageKey,
          tenantId: input.tenantId,
          visitedArtifactBlobIds: [...input.visitedArtifactBlobIds, input.parentArtifactBlobId]
        });

        if (childResult.status === "deferred") {
          outcome.deferredCount += 1;
        } else {
          outcome.processedCount += 1;
        }
      } catch {
        outcome.downstreamFailedCount += 1;
      }
    } catch {
      await updateAttachmentPromotion({
        attachmentId: semanticAttachment.id,
        promotedArtifactBlobId: null,
        promotionStatus: "promotion_failed",
        promotionSummary: "Attachment blob promotion failed."
      });
      outcome.promotionFailedCount += 1;
    }
  }

  outcome.warnings.push(...buildAttachmentProcessingWarnings(outcome));
  return outcome;
}

async function processArtifactBlobInternal(input: {
  artifactBlobId: string;
  attachmentDepth: number;
  contentType: string | null;
  fileName: string;
  inspection: BlobInspectionResult;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
  tenantId: string;
  visitedArtifactBlobIds: string[];
}): Promise<BlobNormalizationResult> {
  const existingProcessing = await getArtifactProcessingSummary(input.artifactBlobId);
  const reusableState = await getBlobReuseState(input.artifactBlobId);

  if (
    existingProcessing?.normalizationStatus &&
    (existingProcessing.normalizationStatus === "completed" ||
      existingProcessing.normalizationStatus === "completed_with_warnings" ||
      existingProcessing.normalizationStatus === "deferred") &&
    (existingProcessing.normalizationStatus === "deferred" ||
      (reusableState.hasNormalizedContent && reusableState.hasAnchors))
  ) {
    const normalizedContent = reusableState.hasNormalizedContent
      ? await getNormalizedContentRecords(input.artifactBlobId, { includeContent: true })
      : emptyNormalizedContent();
    const provenanceAnchors = reusableState.hasAnchors
      ? await getProvenanceAnchorsSummary(input.artifactBlobId)
      : {
          totalCount: 0,
          groups: [],
          items: []
        };
    const candidateExtraction = await extractCandidatesForBlobInternal({
      artifactBlobId: input.artifactBlobId,
      fileName: input.fileName,
      normalizedContent,
      provenanceAnchors,
      tenantId: input.tenantId
    });

    return {
      anchorCount: provenanceAnchors.totalCount,
      candidateCount: candidateExtraction.candidateCount,
      contentKind: existingProcessing.contentKind,
      normalizedContent,
      reasonCodes: [],
      reprocessRecommended: false,
      retryRecommended: false,
      reusedExistingBlob: true,
      status:
        existingProcessing.normalizationStatus === "completed_with_warnings"
          ? "completed_with_warnings"
          : existingProcessing.normalizationStatus === "completed"
            ? "completed"
            : "deferred",
      summary: existingProcessing.summary ?? "Existing artifact processing was reused.",
      warnings: []
    };
  }

  if (!input.inspection.parserEligible || !supportsNormalizationTarget(input.inspection.parserTarget)) {
    const summary = `Normalization is deferred for this ${input.inspection.supportTier ?? "unsupported"} artifact type in v1.`;
    await upsertArtifactProcessingState({
      artifactBlobId: input.artifactBlobId,
      contentKind: null,
      inspectionStatus: input.inspection.inspectionStatus,
      normalizationStatus: "deferred",
      parserTarget: input.inspection.parserTarget,
      reasonCodes: [
        `parser_not_eligible:${input.inspection.supportTier ?? "unknown"}/${input.inspection.parserTarget}`
      ],
      reprocessRecommended: input.inspection.supportTier === "deferred",
      retryRecommended: false,
      summary,
      supportTier: input.inspection.supportTier,
      warnings: []
    });
    const candidateExtraction = await extractCandidatesForBlobInternal({
      artifactBlobId: input.artifactBlobId,
      fileName: input.fileName,
      normalizedContent: emptyNormalizedContent(),
      provenanceAnchors: {
        totalCount: 0,
        groups: [],
        items: []
      },
      tenantId: input.tenantId
    });

    return {
      anchorCount: 0,
      candidateCount: candidateExtraction.candidateCount,
      contentKind: null,
      normalizedContent: emptyNormalizedContent(),
      reasonCodes: [
        `parser_not_eligible:${input.inspection.supportTier ?? "unknown"}/${input.inspection.parserTarget}`
      ],
      reprocessRecommended: input.inspection.supportTier === "deferred",
      retryRecommended: false,
      reusedExistingBlob: false,
      status: "deferred",
      summary,
      warnings: []
    };
  }

  try {
    const immutableUrl = await createPresignedDownloadUrl(input.storageKey);
    const response = await fetch(`${workflowConfig.extractorUrl}/normalize`, {
      body: JSON.stringify({
        artifact_blob_id: input.artifactBlobId,
        content_type: input.contentType,
        file_name: input.fileName,
        immutable_url: immutableUrl,
        parser_target: input.inspection.parserTarget
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Extractor normalization failed with status ${response.status}`);
    }

    const payload = (await response.json()) as NormalizeServiceResponse;
    let normalizedContent = await persistNormalizedContent({
      artifactBlobId: input.artifactBlobId,
      normalizedContent: payload.normalized_content,
      tenantId: input.tenantId
    });

    let attachmentWarnings: ParserWarning[] = [];
    let reprocessRecommended = false;

    if (
      payload.content_kind === "email" &&
      payload.normalized_content.kind === "email" &&
      payload.normalized_content.email.attachments.length > 0
    ) {
      if (input.attachmentDepth >= 3) {
        attachmentWarnings.push({
          code: "attachment_recursion_limit_reached",
          message: "Attachment handoff recursion limit reached; deeper nested attachments were not processed."
        });
      } else {
        const outcome = await promoteEmailAttachments({
          attachmentDepth: input.attachmentDepth,
          normalizedContent,
          normalizedEmailInput: payload.normalized_content,
          parentArtifactBlobId: input.artifactBlobId,
          tenantId: input.tenantId,
          visitedArtifactBlobIds: input.visitedArtifactBlobIds
        });
        attachmentWarnings = outcome.warnings;
        reprocessRecommended = outcome.promotionFailedCount > 0 || outcome.downstreamFailedCount > 0;
        normalizedContent = await getNormalizedContentRecords(input.artifactBlobId, { includeContent: true });
      }
    }

    const parserWarnings = buildParserWarnings({
      parserTarget: input.inspection.parserTarget,
      supportTier: input.inspection.supportTier
    });
    const warnings = [...parserWarnings, ...attachmentWarnings];
    const status = warnings.length > 0 ? "completed_with_warnings" : "completed";
    const reasonCodes = warnings.length > 0 ? warnings.map((warning) => warning.code) : ["normalized_content_created"];

    const anchorsToPersist = reusableState.hasAnchors ? [] : buildProvenanceAnchors(normalizedContent);
    const anchorSummary = reusableState.hasAnchors
      ? await getProvenanceAnchorsSummary(input.artifactBlobId)
      : await persistProvenanceAnchors({
          anchors: anchorsToPersist,
          artifactBlobId: input.artifactBlobId,
          tenantId: input.tenantId
        });

    if (!reusableState.hasAnchors && anchorSummary.totalCount > 0) {
      await persistAnchorManifest({
        artifactBlobId: input.artifactBlobId,
        groups: anchorSummary.groups,
        items: anchorSummary.items,
        totalCount: anchorSummary.totalCount
      });
    }

    await upsertArtifactProcessingState({
      artifactBlobId: input.artifactBlobId,
      contentKind: payload.content_kind,
      inspectionStatus: input.inspection.inspectionStatus,
      metadata: {
        anchorCount: anchorSummary.totalCount,
        attachments: normalizedContent.attachments.length,
        documentPages: normalizedContent.documentPages.length,
        emailMessages: normalizedContent.emailMessages.length,
        structuredTables: normalizedContent.structuredTables.length,
        worksheets: normalizedContent.worksheets.length
      },
      normalizationStatus: status,
      parserTarget: input.inspection.parserTarget,
      reasonCodes,
      reprocessRecommended,
      retryRecommended: false,
      summary:
        status === "completed_with_warnings"
          ? `Artifact normalized as ${contentKindLabel(payload.content_kind)} content with warnings.`
          : `Artifact normalized as ${contentKindLabel(payload.content_kind)} content.`,
      supportTier: input.inspection.supportTier,
      warnings
    });
    const candidateExtraction = await extractCandidatesForBlobInternal({
      artifactBlobId: input.artifactBlobId,
      fileName: input.fileName,
      normalizedContent,
      provenanceAnchors: anchorSummary,
      tenantId: input.tenantId
    });

    return {
      anchorCount: anchorSummary.totalCount,
      candidateCount: candidateExtraction.candidateCount,
      contentKind: payload.content_kind,
      normalizedContent,
      reasonCodes,
      reprocessRecommended,
      retryRecommended: false,
      reusedExistingBlob: false,
      status,
      summary:
        status === "completed_with_warnings"
          ? `Artifact normalized as ${contentKindLabel(payload.content_kind)} content with warnings.`
          : `Artifact normalized as ${contentKindLabel(payload.content_kind)} content.`,
      warnings
    };
  } catch (error) {
    await upsertArtifactProcessingState({
      artifactBlobId: input.artifactBlobId,
      contentKind: null,
      inspectionStatus: input.inspection.inspectionStatus,
      normalizationStatus: "failed",
      parserTarget: input.inspection.parserTarget,
      reasonCodes: ["artifact_processing_failed"],
      reprocessRecommended: false,
      retryRecommended: true,
      summary: "Artifact processing failed during normalization or anchoring.",
      supportTier: input.inspection.supportTier,
      warnings: [
        {
          code: "artifact_processing_failed",
          message: error instanceof Error ? error.message : "Unknown artifact processing failure"
        }
      ]
    });

    throw error;
  }
}

export async function promoteUploadedArtifact(input: {
  actorId: string;
  ingestionRunId: string;
  sourceItemId: string;
  tenantId: string;
  uploadKey: string;
  workflowRunId: string;
}): Promise<{
  artifactBlobId: string;
  contentType: string | null;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}> {
  await markIngestionProcessing({
    actorId: input.actorId,
    ingestionRunId: input.ingestionRunId,
    sourceItemId: input.sourceItemId,
    workflowRunId: input.workflowRunId
  });

  const stagedMetadata = await getObjectMetadata(input.uploadKey);
  const buffer = await readObjectBuffer(input.uploadKey);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const detected = await fileTypeFromBuffer(buffer);
  const immutableKey = `${workflowConfig.immutablePrefix}/sha256/${sha256}`;

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: workflowConfig.bucket,
        Key: immutableKey
      })
    );
  } catch {
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: workflowConfig.bucket,
        CopySource: `${workflowConfig.bucket}/${input.uploadKey}`,
        Key: immutableKey,
        MetadataDirective: "COPY"
      })
    );
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: workflowConfig.bucket,
      Key: input.uploadKey
    })
  );

  const artifactBlob = await upsertArtifactBlob({
    contentType: detected?.mime ?? stagedMetadata.contentType,
    fileName: stagedMetadata.originalFileName ?? input.uploadKey.split("/").at(-1) ?? input.uploadKey,
    sha256,
    sizeBytes: buffer.byteLength,
    storageBucket: workflowConfig.bucket,
    storageKey: immutableKey,
    tenantId: input.tenantId
  });

  await markIngestionImmutableStored({
    actorId: input.actorId,
    artifactBlobId: artifactBlob.id,
    ingestionRunId: input.ingestionRunId,
    sourceItemId: input.sourceItemId,
    workflowRunId: input.workflowRunId
  });

  return {
    artifactBlobId: artifactBlob.id,
    contentType: artifactBlob.contentType,
    fileName: artifactBlob.originalFileName,
    sha256,
    sizeBytes: artifactBlob.sizeBytes,
    storageKey: immutableKey
  };
}

export async function inspectUploadedArtifact(input: {
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
  parserTarget: ArtifactParserTarget;
  supportTier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
}> {
  await markInspectionStarted({
    actorId: input.actorId,
    ingestionRunId: input.ingestionRunId,
    sourceItemId: input.sourceItemId,
    workflowRunId: input.workflowRunId
  });

  try {
    const result = await inspectArtifactBlobInternal({
      artifactBlobId: input.artifactBlobId,
      contentType: input.contentType,
      fileName: input.fileName,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey
    });

    await recordInspectionArtifacts({
      actorId: input.actorId,
      derivedArtifacts: result.derivedArtifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        version: artifact.version
      })),
      ingestionRunId: input.ingestionRunId,
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    return {
      derivedArtifacts: result.derivedArtifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        storageKey: artifact.storageKey,
        version: artifact.version
      })),
      parserEligible: result.parserEligible,
      parserTarget: result.parserTarget,
      supportTier: result.supportTier
    };
  } catch (error) {
    await upsertArtifactProcessingState({
      artifactBlobId: input.artifactBlobId,
      contentKind: null,
      inspectionStatus: "failed",
      normalizationStatus: "failed",
      parserTarget: null,
      reasonCodes: ["inspection_failed_prevented_normalization"],
      reprocessRecommended: false,
      retryRecommended: true,
      summary: "Artifact inspection failed before normalization could run.",
      supportTier: null,
      warnings: [
        {
          code: "inspection_failed",
          message: error instanceof Error ? error.message : "Unknown inspection failure"
        }
      ]
    });

    await recordInspectionFailure({
      actorId: input.actorId,
      artifactBlobId: input.artifactBlobId,
      errorMessage: error instanceof Error ? error.message : "Unknown inspection failure",
      ingestionRunId: input.ingestionRunId,
      parserTarget: null,
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    throw error;
  }
}

export async function normalizeUploadedArtifact(input: {
  actorId: string;
  artifactBlobId: string;
  fileName: string;
  ingestionRunId: string;
  parserEligible: boolean;
  parserTarget: ArtifactParserTarget;
  sourceItemId: string;
  storageKey: string;
  supportTier: "best_effort" | "deferred" | "supported" | "unsupported" | null;
  tenantId: string;
  workflowRunId: string;
}): Promise<{
  contentKind: "document" | "email" | "workbook" | null;
  skipped: boolean;
}> {
  const reusableState = await getBlobReuseState(input.artifactBlobId);
  const existingProcessing = await getArtifactProcessingSummary(input.artifactBlobId);

  if (!input.parserEligible || !supportsNormalizationTarget(input.parserTarget)) {
    const status = input.supportTier === "deferred" || input.supportTier === "unsupported" ? "deferred" : "skipped";
    const summary =
      status === "deferred"
        ? `Normalization is deferred for this ${input.supportTier ?? "unsupported"} artifact type in v1.`
        : "Normalization was skipped because the artifact is not parser-eligible.";

    await upsertArtifactProcessingState({
      artifactBlobId: input.artifactBlobId,
      contentKind: null,
      inspectionStatus:
        input.supportTier === "deferred" || input.supportTier === "unsupported" ? "unsupported" : "completed",
      normalizationStatus: status === "deferred" ? "deferred" : null,
      parserTarget: input.parserTarget,
      reasonCodes: [`parser_not_eligible:${input.supportTier ?? "unknown"}/${input.parserTarget}`],
      reprocessRecommended: status === "deferred",
      retryRecommended: false,
      summary,
      supportTier: input.supportTier,
      warnings: []
    });

    await recordNormalizationSkipped({
      actorId: input.actorId,
      artifactBlobId: input.artifactBlobId,
      contentKind: null,
      ingestionRunId: input.ingestionRunId,
      parserTarget: input.parserTarget,
      reasonCodes: [`parser_not_eligible:${input.supportTier ?? "unknown"}/${input.parserTarget}`],
      reprocessRecommended: status === "deferred",
      retryRecommended: false,
      status,
      sourceItemId: input.sourceItemId,
      summary,
      workflowRunId: input.workflowRunId
    });

    await recordAnchoringSkipped({
      actorId: input.actorId,
      ingestionRunId: input.ingestionRunId,
      reasonCodes: ["anchoring_skipped_without_normalized_content"],
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    return {
      contentKind: null,
      skipped: true
    };
  }

  if (
    existingProcessing?.normalizationStatus &&
    (existingProcessing.normalizationStatus === "completed" ||
      existingProcessing.normalizationStatus === "completed_with_warnings" ||
      existingProcessing.normalizationStatus === "deferred") &&
    reusableState.hasNormalizedContent &&
    reusableState.hasAnchors
  ) {
    await recordNormalizationSkipped({
      actorId: input.actorId,
      artifactBlobId: input.artifactBlobId,
      contentKind: reusableState.contentKind,
      ingestionRunId: input.ingestionRunId,
      parserTarget: input.parserTarget,
      reasonCodes: ["reused_existing_blob_normalization"],
      reprocessRecommended: false,
      retryRecommended: false,
      status: "skipped",
      sourceItemId: input.sourceItemId,
      summary: `Normalized ${contentKindLabel(reusableState.contentKind)} content was reused from the existing immutable blob.`,
      workflowRunId: input.workflowRunId
    });

    await recordAnchoringSkipped({
      actorId: input.actorId,
      ingestionRunId: input.ingestionRunId,
      reasonCodes: ["reused_existing_blob_anchors"],
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    return {
      contentKind: reusableState.contentKind,
      skipped: true
    };
  }

  await markNormalizationStarted({
    actorId: input.actorId,
    artifactBlobId: input.artifactBlobId,
    ingestionRunId: input.ingestionRunId,
    parserTarget: input.parserTarget,
    sourceItemId: input.sourceItemId,
    workflowRunId: input.workflowRunId
  });

  try {
    const parserTarget = input.parserTarget as SupportedParserTarget;
    let normalizedContent =
      existingProcessing?.normalizationStatus && reusableState.hasNormalizedContent
        ? await getNormalizedContentRecords(input.artifactBlobId, { includeContent: true })
        : null;
    let contentKind = existingProcessing?.contentKind ?? reusableState.contentKind;
    let normalizedPayload: NormalizeServiceResponse | null = null;

    if (!normalizedContent?.contentKind) {
      const immutableUrl = await createPresignedDownloadUrl(input.storageKey);
      const response = await fetch(`${workflowConfig.extractorUrl}/normalize`, {
        body: JSON.stringify({
          artifact_blob_id: input.artifactBlobId,
          content_type: null,
          file_name: input.fileName,
          immutable_url: immutableUrl,
          parser_target: input.parserTarget
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`Extractor normalization failed with status ${response.status}`);
      }

      const payload = (await response.json()) as NormalizeServiceResponse;
      normalizedPayload = payload;
      normalizedContent = await persistNormalizedContent({
        artifactBlobId: input.artifactBlobId,
        normalizedContent: payload.normalized_content,
        tenantId: input.tenantId
      });
      contentKind = payload.content_kind;
    }

    if (!normalizedContent.contentKind || !contentKind) {
      throw new Error("Normalization did not yield a supported content kind.");
    }

    let attachmentOutcome: AttachmentHandoffOutcome | null = null;
    if (normalizedPayload?.content_kind === "email" && normalizedPayload.normalized_content.kind === "email") {
      attachmentOutcome = await promoteEmailAttachments({
        attachmentDepth: 0,
        normalizedContent,
        normalizedEmailInput: normalizedPayload.normalized_content,
        parentArtifactBlobId: input.artifactBlobId,
        tenantId: input.tenantId,
        visitedArtifactBlobIds: [input.artifactBlobId]
      });
      normalizedContent = await getNormalizedContentRecords(input.artifactBlobId, { includeContent: true });
    }

    const warnings = [
      ...buildParserWarnings({
        parserTarget,
        supportTier: input.supportTier
      }),
      ...(attachmentOutcome?.warnings ?? [])
    ];
    const status = warnings.length > 0 ? "completed_with_warnings" : "completed";
    const reasonCodes = warnings.length > 0 ? warnings.map((warning) => warning.code) : ["normalized_content_created"];
    const reprocessRecommended =
      (attachmentOutcome?.promotionFailedCount ?? 0) > 0 || (attachmentOutcome?.downstreamFailedCount ?? 0) > 0;

    await recordNormalizedContent({
      actorId: input.actorId,
      artifactBlobId: input.artifactBlobId,
      contentKind,
      counts: {
        attachments: normalizedContent.attachments.length,
        documentPages: normalizedContent.documentPages.length,
        emailMessages: normalizedContent.emailMessages.length,
        structuredTables: normalizedContent.structuredTables.length,
        worksheets: normalizedContent.worksheets.length
      },
      ingestionRunId: input.ingestionRunId,
      parserTarget: input.parserTarget,
      reasonCodes,
      reprocessRecommended,
      retryRecommended: false,
      sourceItemId: input.sourceItemId,
      status,
      summary:
        status === "completed_with_warnings"
          ? `Normalized ${contentKindLabel(contentKind)} content created with warnings.`
          : `Normalized ${contentKindLabel(contentKind)} content created successfully.`,
      warnings,
      workflowRunId: input.workflowRunId
    });

    await upsertArtifactProcessingState({
      artifactBlobId: input.artifactBlobId,
      contentKind,
      inspectionStatus: "completed",
      metadata: {
        anchorReuse: reusableState.hasAnchors,
        attachmentDeferredCount: attachmentOutcome?.deferredCount ?? 0,
        attachmentProcessedCount: attachmentOutcome?.processedCount ?? 0,
        attachmentPromotionFailedCount: attachmentOutcome?.promotionFailedCount ?? 0,
        attachmentPromotedCount: attachmentOutcome?.promotedCount ?? 0,
        attachmentReusedBlobCount: attachmentOutcome?.reusedBlobCount ?? 0
      },
      normalizationStatus: status,
      parserTarget: input.parserTarget,
      reasonCodes,
      reprocessRecommended,
      retryRecommended: false,
      summary:
        status === "completed_with_warnings"
          ? `Artifact normalized as ${contentKindLabel(contentKind)} content with warnings.`
          : `Artifact normalized as ${contentKindLabel(contentKind)} content.`,
      supportTier: input.supportTier,
      warnings
    });

    const anchorsToPersist = reusableState.hasAnchors ? [] : buildProvenanceAnchors(normalizedContent);

    if (reusableState.hasAnchors) {
      await recordAnchoringSkipped({
        actorId: input.actorId,
        ingestionRunId: input.ingestionRunId,
        reasonCodes: ["reused_existing_blob_anchors"],
        sourceItemId: input.sourceItemId,
        workflowRunId: input.workflowRunId
      });
    } else if (anchorsToPersist.length === 0) {
      await recordAnchoringSkipped({
        actorId: input.actorId,
        ingestionRunId: input.ingestionRunId,
        reasonCodes: ["no_provenance_anchors_generated"],
        sourceItemId: input.sourceItemId,
        workflowRunId: input.workflowRunId
      });
    } else {
      await markAnchoringStarted({
        actorId: input.actorId,
        contentKind,
        ingestionRunId: input.ingestionRunId,
        sourceItemId: input.sourceItemId,
        workflowRunId: input.workflowRunId
      });

      try {
        const anchorSummary = await persistProvenanceAnchors({
          anchors: anchorsToPersist,
          artifactBlobId: input.artifactBlobId,
          tenantId: input.tenantId
        });
        await persistAnchorManifest({
          artifactBlobId: input.artifactBlobId,
          groups: anchorSummary.groups,
          items: anchorSummary.items,
          totalCount: anchorSummary.totalCount
        });

        await recordProvenanceAnchors({
          actorId: input.actorId,
          counts: groupAnchorCounts(anchorSummary.groups),
          ingestionRunId: input.ingestionRunId,
          sourceItemId: input.sourceItemId,
          totalCount: anchorSummary.totalCount,
          workflowRunId: input.workflowRunId
        });
      } catch (error) {
        await recordAnchoringFailure({
          actorId: input.actorId,
          errorMessage: error instanceof Error ? error.message : "Unknown anchoring failure",
          ingestionRunId: input.ingestionRunId,
          sourceItemId: input.sourceItemId,
          workflowRunId: input.workflowRunId
        });

        throw error;
      }
    }

    return {
      contentKind,
      skipped: false
    };
  } catch (error) {
    await upsertArtifactProcessingState({
      artifactBlobId: input.artifactBlobId,
      contentKind: null,
      inspectionStatus: "completed",
      normalizationStatus: "failed",
      parserTarget: input.parserTarget,
      reasonCodes: ["artifact_processing_failed"],
      reprocessRecommended: false,
      retryRecommended: true,
      summary: "Artifact processing failed during normalization or anchoring.",
      supportTier: input.supportTier,
      warnings: [
        {
          code: "artifact_processing_failed",
          message: error instanceof Error ? error.message : "Unknown normalization failure"
        }
      ]
    });

    await recordNormalizationFailure({
      actorId: input.actorId,
      artifactBlobId: input.artifactBlobId,
      errorMessage: error instanceof Error ? error.message : "Unknown normalization failure",
      ingestionRunId: input.ingestionRunId,
      parserTarget: input.parserTarget,
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    throw error;
  }
}

export async function extractCandidatesForUploadedArtifact(input: {
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
  status: CandidateExtractionResult["status"];
}> {
  await markCandidateExtractionStarted({
    actorId: input.actorId,
    ingestionRunId: input.ingestionRunId,
    sourceItemId: input.sourceItemId,
    workflowRunId: input.workflowRunId
  });

  try {
    const normalizedContent = await getNormalizedContentRecords(input.artifactBlobId, { includeContent: true });
    const provenanceAnchors = await getProvenanceAnchorsSummary(input.artifactBlobId);
    const candidateExtraction = await extractCandidatesForBlobInternal({
      artifactBlobId: input.artifactBlobId,
      fileName: input.fileName,
      normalizedContent,
      provenanceAnchors,
      tenantId: input.tenantId
    });

    if (candidateExtraction.reusedExistingBlob) {
      await recordCandidateExtractionSkipped({
        actorId: input.actorId,
        ingestionRunId: input.ingestionRunId,
        reasonCodes: ["reused_existing_blob_candidates"],
        sourceItemId: input.sourceItemId,
        summary: "Evidence-backed candidate signals were reused from the existing immutable blob.",
        workflowRunId: input.workflowRunId
      });
    } else if (candidateExtraction.result.status === "skipped") {
      await recordCandidateExtractionSkipped({
        actorId: input.actorId,
        ingestionRunId: input.ingestionRunId,
        reasonCodes: candidateExtraction.result.reasonCodes,
        sourceItemId: input.sourceItemId,
        summary: candidateExtraction.result.summary,
        workflowRunId: input.workflowRunId
      });
    } else {
      await recordCandidateSignals({
        actorId: input.actorId,
        candidateCount: candidateExtraction.candidateCount,
        countsByType: groupCandidateCounts(candidateExtraction.candidates),
        ingestionRunId: input.ingestionRunId,
        sourceItemId: input.sourceItemId,
        workflowRunId: input.workflowRunId
      });
    }

    return {
      candidateCount: candidateExtraction.candidateCount,
      reusedExistingBlob: candidateExtraction.reusedExistingBlob,
      status: candidateExtraction.result.status
    };
  } catch (error) {
    await upsertCandidateExtractionState({
      artifactBlobId: input.artifactBlobId,
      candidateCount: 0,
      metadata: {},
      reasonCodes: ["candidate_extraction_failed"],
      reprocessRecommended: false,
      retryRecommended: true,
      status: "failed",
      summary: "Evidence-backed candidate extraction failed.",
      warnings: [
        {
          code: "candidate_extraction_failed",
          message: error instanceof Error ? error.message : "Unknown candidate extraction failure"
        }
      ]
    });

    await recordCandidateExtractionFailure({
      actorId: input.actorId,
      errorMessage: error instanceof Error ? error.message : "Unknown candidate extraction failure",
      ingestionRunId: input.ingestionRunId,
      sourceItemId: input.sourceItemId,
      workflowRunId: input.workflowRunId
    });

    throw error;
  }
}

export async function finalizeUploadedArtifact(input: {
  actorId: string;
  artifactBlobId: string;
  contentType: string | null;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  await completeIngestion(input);
}

export async function failUploadedArtifact(input: {
  actorId: string;
  errorMessage: string;
  ingestionRunId: string;
  sourceItemId: string;
  workflowRunId: string;
}): Promise<void> {
  await failIngestion(input);
}
