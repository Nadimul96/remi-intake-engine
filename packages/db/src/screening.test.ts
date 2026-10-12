import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

import { createId } from "@remi/domain";

import { replaceExtractedCandidates, upsertCandidateExtractionState } from "./candidates";
import type { PersistExtractedCandidateInput } from "./candidates";
import { closeDb, getDb } from "./client";
import { persistNormalizedContent } from "./content";
import { listEntityResolutionQueue, reviewEntityResolutionProposal } from "./entities";
import {
  completeIngestion,
  createIntakeRegistration,
  ensureSourceConnection,
  markIngestionImmutableStored,
  markIngestionProcessing,
  upsertArtifactBlob,
  upsertDerivedArtifact
} from "./intake";
import { persistProvenanceAnchors, upsertArtifactProcessingState, upsertNormalizationResult } from "./processing";
import { listAssetOrganizationRelationshipQueue, reviewAssetOrganizationRelationshipProposal } from "./relationships";
import { reviewCandidate } from "./reviews";
import { getDealScreeningWorkbench } from "./screening";

const sql = getDb();

after(async () => {
  await closeDb();
});

function loadFixtureEmail(fileName: string): {
  bodyPreview: string;
  from: string;
  messageIdHeader: string;
  subject: string;
} {
  const raw = readFileSync(
    fileURLToPath(new URL(`../../../tests/fixtures/normalization/email/${fileName}`, import.meta.url)),
    "utf8"
  );

  function header(name: string): string {
    const match = raw.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
    assert.ok(match?.[1], `fixture ${fileName} should contain ${name}`);
    return match[1].trim();
  }

  const bodyMatch = raw.match(/\r?\n\r?\n([\s\S]+?)\r?\n--/);
  const bodyPreview = bodyMatch?.[1]
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  assert.ok(bodyPreview, `fixture ${fileName} should contain a plain-text body`);

  return {
    bodyPreview,
    from: header("From"),
    messageIdHeader: header("Message-ID"),
    subject: header("Subject")
  };
}

function packet(input: {
  anchorIds: string[];
  artifactBlobId: string;
  candidateType: "classification_candidate" | "relationship_assertion_candidate";
  fieldName: string;
  sourceSemanticObjectId: string;
  value: unknown;
}) {
  return {
    candidateType: input.candidateType,
    fieldName: input.fieldName,
    candidateValue: input.value,
    confidenceScore: input.candidateType === "relationship_assertion_candidate" ? 0.93 : 0.9,
    sourceArtifactBlobId: input.artifactBlobId,
    sourceSemanticObjectType: "email_message",
    sourceSemanticObjectId: input.sourceSemanticObjectId,
    provenanceAnchorIds: input.anchorIds,
    evidencePreview: JSON.stringify(input.value),
    extractionMethod: "rule" as const,
    extractionMethodDetail:
      input.candidateType === "relationship_assertion_candidate"
        ? "screening_workbench_relationship_rule"
        : "screening_workbench_classification_rule",
    extractionMetadata: {
      fixtureBacked: true
    },
    createdAt: new Date().toISOString()
  };
}

async function createFixtureSourcePacket(input: {
  connectionId: string;
  fileName: string;
  fixture: ReturnType<typeof loadFixtureEmail>;
  objectKey: string;
  tenantId: string;
}) {
  const registration = await createIntakeRegistration({
    actorId: "actor_screening_test",
    contentType: "message/rfc822",
    fileName: input.fileName,
    objectKey: input.objectKey,
    sizeBytes: 2048,
    sourceConnectionId: input.connectionId,
    sourceUri: `s3://verification/${input.objectKey}`,
    tenantId: input.tenantId
  });

  await markIngestionProcessing({
    actorId: "actor_screening_test",
    ingestionRunId: registration.ingestionRunId,
    sourceItemId: registration.sourceItemId,
    workflowRunId: registration.workflowRunId
  });

  const artifact = await upsertArtifactBlob({
    contentType: "message/rfc822",
    fileName: input.fileName,
    sha256: `screening-${input.objectKey}`,
    sizeBytes: 2048,
    storageBucket: "verification",
    storageKey: input.objectKey,
    tenantId: input.tenantId
  });

  await markIngestionImmutableStored({
    actorId: "actor_screening_test",
    artifactBlobId: artifact.id,
    ingestionRunId: registration.ingestionRunId,
    sourceItemId: registration.sourceItemId,
    workflowRunId: registration.workflowRunId
  });

  await upsertDerivedArtifact({
    artifactBlobId: artifact.id,
    kind: "artifact_inspection",
    metadata: {
      fileClassification: "email",
      inspectionStatus: "completed",
      isContainer: false,
      nativeTextPresent: true,
      normalizedExtension: "eml",
      ocrNeededLater: false,
      parserEligible: true,
      parserTarget: "eml",
      supportTier: "supported"
    },
    storageBucket: "verification",
    storageKey: `${input.objectKey}.inspection.json`,
    version: 1
  });

  await upsertArtifactProcessingState({
    artifactBlobId: artifact.id,
    contentKind: "email",
    inspectionStatus: "completed",
    normalizationStatus: "completed",
    parserTarget: "eml",
    reasonCodes: ["fixture_email_ready"],
    reprocessRecommended: false,
    retryRecommended: false,
    summary: "Fixture email is ready for screening workbench verification.",
    supportTier: "supported",
    warnings: []
  });

  await upsertNormalizationResult({
    artifactBlobId: artifact.id,
    contentKind: "email",
    parserTarget: "eml",
    reasonCodes: ["fixture_email_normalized"],
    reprocessRecommended: false,
    retryRecommended: false,
    sourceItemId: registration.sourceItemId,
    status: "completed",
    summary: "Fixture email normalized for screening workbench verification.",
    warnings: []
  });

  const messageId = createId("emailmsg");

  await persistNormalizedContent({
    artifactBlobId: artifact.id,
    normalizedContent: {
      kind: "email",
      email: {
        thread: {
          messageCount: 1,
          metadata: {
            fixtureBacked: true
          },
          subject: input.fixture.subject,
          threadKey: `fixture:${input.objectKey}`
        },
        messages: [
          {
            attachmentCount: 1,
            bodyPreview: input.fixture.bodyPreview,
            cc: ["acquisitions@syntheticcapital.com"],
            messageIdHeader: input.fixture.messageIdHeader,
            metadata: {
              fixtureBacked: true
            },
            position: 0,
            sender: input.fixture.from,
            sentAt: "2026-03-10T14:15:00.000Z",
            sentAtRaw: "Tue, 10 Mar 2026 09:15:00 -0500",
            subject: input.fixture.subject,
            to: ["team@syntheticcapital.com"]
          }
        ],
        attachments: [
          {
            contentDisposition: "attachment",
            contentId: null,
            contentType: "text/plain",
            fileName: "teaser-note.txt",
            messagePosition: 0,
            metadata: {
              fixtureBacked: true
            },
            partIndex: 1,
            sha256: `attach-${input.objectKey}`,
            sizeBytes: 26
          }
        ]
      }
    },
    tenantId: input.tenantId
  });

  const anchors = await persistProvenanceAnchors({
    anchors: [
      {
        anchorKey: "header",
        anchorKind: "email_header",
        locator: {},
        metadata: {
          fixtureBacked: true
        },
        ownerId: messageId,
        ownerType: "email_message",
        summary: "Fixture email header values",
        title: "Fixture Email Header"
      },
      {
        anchorKey: "body",
        anchorKind: "email_body",
        locator: {},
        metadata: {
          fixtureBacked: true
        },
        ownerId: messageId,
        ownerType: "email_message",
        summary: "Fixture email body preview",
        title: "Fixture Email Body"
      }
    ],
    artifactBlobId: artifact.id,
    tenantId: input.tenantId
  });

  return {
    anchorIds: anchors.items.map((anchor) => anchor.id),
    artifactBlobId: artifact.id,
    messageId,
    registration
  };
}

async function seedWorkbenchCandidates(input: {
  anchorIds: string[];
  artifactBlobId: string;
  assetName: string;
  messageId: string;
  organizationName: string;
  tenantId: string;
}) {
  const createdCandidates = await replaceExtractedCandidates({
    artifactBlobId: input.artifactBlobId,
    candidates: [
      {
        artifactBlobId: input.artifactBlobId,
        candidateKey: `asset-${input.assetName}`,
        candidateType: "classification_candidate",
        citationPacket: packet({
          anchorIds: input.anchorIds,
          artifactBlobId: input.artifactBlobId,
          candidateType: "classification_candidate",
          fieldName: "probable_asset_name_mention",
          sourceSemanticObjectId: input.messageId,
          value: input.assetName
        }),
        confidence: 0.92,
        extractionMethod: "rule",
        extractionMethodDetail: "screening_workbench_asset_rule",
        fieldName: "probable_asset_name_mention",
        reviewReady: true,
        sourceSemanticObjectId: input.messageId,
        sourceSemanticObjectType: "email_message",
        summary: `Fixture-backed asset signal for ${input.assetName}.`,
        tenantId: input.tenantId,
        valueType: "text",
        candidateValue: input.assetName
      },
      {
        artifactBlobId: input.artifactBlobId,
        candidateKey: `org-${input.organizationName}`,
        candidateType: "classification_candidate",
        citationPacket: packet({
          anchorIds: input.anchorIds,
          artifactBlobId: input.artifactBlobId,
          candidateType: "classification_candidate",
          fieldName: "probable_originating_organization_name",
          sourceSemanticObjectId: input.messageId,
          value: input.organizationName
        }),
        confidence: 0.9,
        extractionMethod: "rule",
        extractionMethodDetail: "screening_workbench_org_name_rule",
        fieldName: "probable_originating_organization_name",
        reviewReady: true,
        sourceSemanticObjectId: input.messageId,
        sourceSemanticObjectType: "email_message",
        summary: `Fixture-backed organization signal for ${input.organizationName}.`,
        tenantId: input.tenantId,
        valueType: "text",
        candidateValue: input.organizationName
      },
      {
        artifactBlobId: input.artifactBlobId,
        candidateKey: `broker-${input.assetName}-${input.organizationName}`,
        candidateType: "relationship_assertion_candidate",
        citationPacket: packet({
          anchorIds: input.anchorIds,
          artifactBlobId: input.artifactBlobId,
          candidateType: "relationship_assertion_candidate",
          fieldName: "probable_broker_organization_for_asset",
          sourceSemanticObjectId: input.messageId,
          value: {
            assetName: input.assetName,
            emailMessageId: input.messageId,
            organizationDomain: null,
            organizationName: input.organizationName,
            relationshipType: "broker_organization_for_asset"
          }
        }),
        confidence: 0.93,
        extractionMethod: "rule",
        extractionMethodDetail: "screening_workbench_broker_relationship_rule",
        fieldName: "probable_broker_organization_for_asset",
        reviewReady: true,
        sourceSemanticObjectId: input.messageId,
        sourceSemanticObjectType: "email_message",
        summary: `Fixture-backed broker relationship signal linking ${input.organizationName} to ${input.assetName}.`,
        tenantId: input.tenantId,
        valueType: "relationship",
        candidateValue: {
          assetName: input.assetName,
          emailMessageId: input.messageId,
          organizationDomain: null,
          organizationName: input.organizationName,
          relationshipType: "broker_organization_for_asset"
        }
      }
    ] satisfies PersistExtractedCandidateInput[],
    tenantId: input.tenantId
  });

  await upsertCandidateExtractionState({
    artifactBlobId: input.artifactBlobId,
    candidateCount: createdCandidates.length,
    reasonCodes: ["fixture_candidates_recorded"],
    reprocessRecommended: false,
    retryRecommended: false,
    status: "completed",
    summary: "Fixture-backed candidate extraction completed for screening workbench verification.",
    warnings: []
  });

  return new Map(createdCandidates.map((candidate) => [candidate.fieldName, candidate]));
}

test("deal screening workbench assembles fixture-backed resolved and unresolved operator state", async () => {
  const tenantId = `tenant_screening_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const fixture = loadFixtureEmail("sample-broker.eml");
  const sourceConnection = await ensureSourceConnection({
    key: `screening-workbench-${tenantId}`,
    kind: "upload",
    name: "Screening Workbench Test Upload",
    tenantId
  });

  const sourceItemIds: string[] = [];
  const ingestionRunIds: string[] = [];
  const workflowRunIds: string[] = [];
  const artifactIds: string[] = [];
  const canonicalEntityIds = new Set<string>();

  try {
    const assetName = fixture.subject.replace(" teaser", "");
    const organizationName = "Example Brokerage";

    const resolvedPacket = await createFixtureSourcePacket({
      connectionId: sourceConnection.id,
      fileName: "sample-broker.eml",
      fixture,
      objectKey: `fixtures/sample-broker-resolved-${tenantId}.eml`,
      tenantId
    });
    sourceItemIds.push(resolvedPacket.registration.sourceItemId);
    ingestionRunIds.push(resolvedPacket.registration.ingestionRunId);
    workflowRunIds.push(resolvedPacket.registration.workflowRunId);
    artifactIds.push(resolvedPacket.artifactBlobId);

    const resolvedCandidates = await seedWorkbenchCandidates({
      anchorIds: resolvedPacket.anchorIds,
      artifactBlobId: resolvedPacket.artifactBlobId,
      assetName,
      messageId: resolvedPacket.messageId,
      organizationName,
      tenantId
    });

    await completeIngestion({
      actorId: "actor_screening_test",
      artifactBlobId: resolvedPacket.artifactBlobId,
      contentType: "message/rfc822",
      ingestionRunId: resolvedPacket.registration.ingestionRunId,
      sourceItemId: resolvedPacket.registration.sourceItemId,
      workflowRunId: resolvedPacket.registration.workflowRunId
    });

    const acceptedAsset = await reviewCandidate({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      candidateId: resolvedCandidates.get("probable_asset_name_mention")!.id,
      note: "Accept fixture-backed asset truth."
    });
    const acceptedOrganization = await reviewCandidate({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      candidateId: resolvedCandidates.get("probable_originating_organization_name")!.id,
      note: "Accept fixture-backed organization truth."
    });
    const acceptedRelationship = await reviewCandidate({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      candidateId: resolvedCandidates.get("probable_broker_organization_for_asset")!.id,
      note: "Accept fixture-backed broker relationship truth."
    });

    let entityQueue = await listEntityResolutionQueue();
    const resolvedAssetProposal = entityQueue.items.find(
      (item) => item.proposal.sourceCandidateId === acceptedAsset.candidate.id
    );
    assert.ok(resolvedAssetProposal, "resolved workbench source should create an asset entity proposal");
    const resolvedAssetDetail = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      displayName: assetName,
      entityType: "asset",
      note: "Create canonical asset for resolved workbench packet.",
      proposalId: resolvedAssetProposal.proposal.id
    });
    assert.ok(resolvedAssetDetail.currentEntityLink, "resolved asset truth should attach to a canonical asset");
    const assetEntityId = resolvedAssetDetail.currentEntityLink.canonicalEntityId;
    canonicalEntityIds.add(assetEntityId);

    entityQueue = await listEntityResolutionQueue();
    const resolvedOrganizationProposal = entityQueue.items.find(
      (item) => item.proposal.sourceCandidateId === acceptedOrganization.candidate.id
    );
    assert.ok(resolvedOrganizationProposal, "resolved workbench source should create an organization entity proposal");
    const resolvedOrganizationDetail = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      displayName: organizationName,
      entityType: "organization",
      note: "Create canonical organization for resolved workbench packet.",
      proposalId: resolvedOrganizationProposal.proposal.id
    });
    assert.ok(resolvedOrganizationDetail.currentEntityLink, "resolved organization truth should attach to a canonical organization");
    const organizationEntityId = resolvedOrganizationDetail.currentEntityLink.canonicalEntityId;
    canonicalEntityIds.add(organizationEntityId);

    const relationshipQueue = await listAssetOrganizationRelationshipQueue({
      relationshipType: "all",
      lifecycle: "all",
      linkState: "all",
      proposalState: "all"
    });
    const resolvedRelationshipProposal = relationshipQueue.items.find(
      (item) => item.proposal.sourceCandidateId === acceptedRelationship.candidate.id
    );
    assert.ok(resolvedRelationshipProposal, "resolved workbench source should create a relationship proposal");

    const resolvedRelationshipDetail = await reviewAssetOrganizationRelationshipProposal({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      canonicalAssetEntityId: assetEntityId,
      canonicalOrganizationEntityId: organizationEntityId,
      note: "Attach broker relationship for resolved workbench packet.",
      proposalId: resolvedRelationshipProposal.proposal.id
    });
    assert.ok(resolvedRelationshipDetail.currentRelationshipLink, "resolved workbench packet should attach a broker relationship");

    const unresolvedPacket = await createFixtureSourcePacket({
      connectionId: sourceConnection.id,
      fileName: "sample-broker.eml",
      fixture,
      objectKey: `fixtures/sample-broker-unresolved-${tenantId}.eml`,
      tenantId
    });
    sourceItemIds.push(unresolvedPacket.registration.sourceItemId);
    ingestionRunIds.push(unresolvedPacket.registration.ingestionRunId);
    workflowRunIds.push(unresolvedPacket.registration.workflowRunId);
    artifactIds.push(unresolvedPacket.artifactBlobId);

    const unresolvedCandidates = await seedWorkbenchCandidates({
      anchorIds: unresolvedPacket.anchorIds,
      artifactBlobId: unresolvedPacket.artifactBlobId,
      assetName,
      messageId: unresolvedPacket.messageId,
      organizationName,
      tenantId
    });

    await completeIngestion({
      actorId: "actor_screening_test",
      artifactBlobId: unresolvedPacket.artifactBlobId,
      contentType: "message/rfc822",
      ingestionRunId: unresolvedPacket.registration.ingestionRunId,
      sourceItemId: unresolvedPacket.registration.sourceItemId,
      workflowRunId: unresolvedPacket.registration.workflowRunId
    });

    const unresolvedAcceptedAsset = await reviewCandidate({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      candidateId: unresolvedCandidates.get("probable_asset_name_mention")!.id,
      note: "Accept asset truth for unresolved workbench packet."
    });
    const unresolvedAcceptedOrganization = await reviewCandidate({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      candidateId: unresolvedCandidates.get("probable_originating_organization_name")!.id,
      note: "Accept organization truth for unresolved workbench packet."
    });
    const unresolvedAcceptedRelationship = await reviewCandidate({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      candidateId: unresolvedCandidates.get("probable_broker_organization_for_asset")!.id,
      note: "Accept broker relationship truth for unresolved workbench packet."
    });

    entityQueue = await listEntityResolutionQueue();
    const unresolvedAssetProposal = entityQueue.items.find(
      (item) => item.proposal.sourceCandidateId === unresolvedAcceptedAsset.candidate.id
    );
    assert.ok(unresolvedAssetProposal, "unresolved workbench source should create an asset entity proposal");
    await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      note: "Attach asset truth for unresolved workbench packet to the existing canonical asset.",
      proposalId: unresolvedAssetProposal.proposal.id,
      targetEntityId: assetEntityId
    });

    entityQueue = await listEntityResolutionQueue();
    const unresolvedOrganizationProposal = entityQueue.items.find(
      (item) => item.proposal.sourceCandidateId === unresolvedAcceptedOrganization.candidate.id
    );
    assert.ok(unresolvedOrganizationProposal, "unresolved workbench source should create an organization entity proposal");
    await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_screening_test",
      actorName: "Screening Test",
      note: "Attach organization truth for unresolved workbench packet to the existing canonical organization.",
      proposalId: unresolvedOrganizationProposal.proposal.id,
      targetEntityId: organizationEntityId
    });

    const resolvedWorkbench = await getDealScreeningWorkbench(resolvedPacket.registration.sourceItemId);
    assert.ok(resolvedWorkbench, "fixture-backed resolved source should produce a screening workbench");
    assert.equal(resolvedWorkbench.sourceItem.fileName, "sample-broker.eml");
    assert.equal(resolvedWorkbench.sourceItem.normalizedContent.emailThread?.subject, fixture.subject);
    assert.equal(resolvedWorkbench.readiness.status, "ready");
    assert.ok(
      resolvedWorkbench.readiness.about.toLowerCase().includes("broker relationship"),
      "resolved workbench should state what the intake package is about using deterministic relationship context"
    );
    assert.equal(resolvedWorkbench.acceptedTruth.counts.all, 3);
    assert.equal(resolvedWorkbench.readiness.assetIdentity.resolvedCurrent, 1);
    assert.equal(resolvedWorkbench.readiness.organizationIdentity.resolvedCurrent, 1);
    assert.equal(resolvedWorkbench.readiness.relationships.resolvedCurrent, 1);
    assert.equal(resolvedWorkbench.readiness.needsAttention.length, 0);
    assert.equal(resolvedWorkbench.relationships.currentItems.length, 1);
    assert.equal(
      resolvedWorkbench.relationships.currentItems[0]?.currentRelationshipLink?.relationshipType,
      "broker_organization_for_asset"
    );

    const unresolvedWorkbench = await getDealScreeningWorkbench(unresolvedPacket.registration.sourceItemId);
    assert.ok(unresolvedWorkbench, "fixture-backed unresolved source should produce a screening workbench");
    assert.equal(unresolvedWorkbench.readiness.status, "needs_review");
    assert.equal(unresolvedWorkbench.acceptedTruth.counts.all, 3);
    assert.equal(unresolvedWorkbench.readiness.assetIdentity.resolvedCurrent, 1);
    assert.equal(unresolvedWorkbench.readiness.organizationIdentity.resolvedCurrent, 1);
    assert.equal(unresolvedWorkbench.readiness.relationships.currentTotal, 1);
    assert.equal(unresolvedWorkbench.readiness.relationships.resolvedCurrent, 0);
    assert.equal(unresolvedWorkbench.readiness.relationships.unresolvedCurrent, 1);
    assert.ok(
      unresolvedWorkbench.readiness.needsAttention.some((issue) => issue.kind === "relationship_review"),
      "unresolved workbench should clearly surface the remaining relationship reconciliation blocker"
    );
    assert.equal(unresolvedWorkbench.relationships.currentItems[0]?.currentRelationshipLink, null);
    assert.equal(
      unresolvedWorkbench.relationships.currentItems[0]?.proposal.sourceCandidateId,
      unresolvedAcceptedRelationship.candidate.id
    );
  } finally {
    if (sourceItemIds.length > 0) {
      await sql`delete from intake_events where source_item_id in ${sql(sourceItemIds)}`;
      await sql`delete from review_items where source_item_id in ${sql(sourceItemIds)}`;
      await sql`delete from workflow_runs where source_item_id in ${sql(sourceItemIds)}`;
      await sql`delete from ingestion_runs where source_item_id in ${sql(sourceItemIds)}`;
      await sql`delete from source_items where id in ${sql(sourceItemIds)}`;
    }

    await sql`delete from source_connections where id = ${sourceConnection.id}`;

    if (artifactIds.length > 0) {
      await sql`delete from derived_artifacts where artifact_blob_id in ${sql([...new Set(artifactIds)])}`;
      await sql`delete from normalization_results where artifact_blob_id in ${sql([...new Set(artifactIds)])}`;
      await sql`delete from documents where artifact_blob_id in ${sql([...new Set(artifactIds)])}`;
      await sql`delete from workbooks where artifact_blob_id in ${sql([...new Set(artifactIds)])}`;
      await sql`delete from email_threads where artifact_blob_id in ${sql([...new Set(artifactIds)])}`;
      await sql`delete from artifact_blobs where id in ${sql([...new Set(artifactIds)])}`;
    }

    if (canonicalEntityIds.size > 0) {
      await sql`delete from canonical_entities where id in ${sql([...canonicalEntityIds])}`;
    }
  }
});
