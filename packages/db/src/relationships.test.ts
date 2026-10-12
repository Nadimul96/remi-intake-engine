import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { createId } from "@remi/domain";

import { closeDb, getDb } from "./client";
import type { PersistExtractedCandidateInput } from "./candidates";
import { replaceExtractedCandidates } from "./candidates";
import { listEntityResolutionQueue, reviewEntityResolutionProposal } from "./entities";
import {
  getAssetOrganizationRelationshipDetail,
  listAssetOrganizationRelationshipQueue,
  reviewAssetOrganizationRelationshipProposal
} from "./relationships";
import { reviewCandidate } from "./reviews";
import { getAcceptedTruthDetail } from "./truth";

const sql = getDb();

after(async () => {
  await closeDb();
});

test("accepted asset-organization relationship truth can attach to canonical asset and organization entities", async () => {
  const tenantId = "tenant_relationship_skeleton_test";
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const artifactIds: string[] = [];
  const canonicalEntityIds = new Set<string>();

  async function createArtifact(name: string): Promise<{ anchorId: string; artifactId: string }> {
    const artifactId = createId("artifact");
    artifactIds.push(artifactId);

    await sql`
      insert into artifact_blobs (
        id,
        tenant_id,
        sha256,
        storage_bucket,
        storage_key,
        original_file_name,
        content_type,
        size_bytes
      ) values (
        ${artifactId},
        ${tenantId},
        ${`sha-${suffix}-${name}`},
        ${"verification"},
        ${`tests/${name}`},
        ${name},
        ${"message/rfc822"},
        ${2048}
      )
    `;

    const anchorId = createId("anchor");
    await sql`
      insert into provenance_anchors (
        id,
        tenant_id,
        artifact_blob_id,
        owner_type,
        owner_id,
        anchor_kind,
        anchor_key,
        title,
        summary,
        locator_json,
        metadata_json
      ) values (
        ${anchorId},
        ${tenantId},
        ${artifactId},
        ${"email_message"},
        ${"emailmsg_test"},
        ${"email_header"},
        ${"header"},
        ${`${name} header`},
        ${`Verification header anchor for ${name}`},
        ${JSON.stringify({ section: "header" })}::jsonb,
        ${JSON.stringify({ verification: true })}::jsonb
      )
    `;

    return { artifactId, anchorId };
  }

  function packet(input: { anchorId: string; artifactId: string; fieldName: string; value: unknown }) {
    return {
      candidateType:
        input.fieldName === "probable_originating_organization_for_asset" ||
        input.fieldName === "probable_broker_organization_for_asset"
        ? ("relationship_assertion_candidate" as const)
        : ("classification_candidate" as const),
      fieldName: input.fieldName,
      candidateValue: input.value,
      confidenceScore: 0.9,
      sourceArtifactBlobId: input.artifactId,
      sourceSemanticObjectType: "email_message",
      sourceSemanticObjectId: "emailmsg_test",
      provenanceAnchorIds: [input.anchorId],
      evidencePreview: JSON.stringify(input.value),
      extractionMethod: "rule" as const,
      extractionMethodDetail: "relationship_skeleton_test_rule",
      extractionMetadata: {
        verification: true
      },
      createdAt: new Date().toISOString()
    };
  }

  try {
    const assetName = `Sycamore Ridge ${suffix}`;
    const organizationName = `Creston Capital ${suffix}`;
    const organizationDomain = `crestoncapital-${suffix}.com`;
    const artifact = await createArtifact(`relationship-${suffix}.eml`);

    const createdCandidates = await replaceExtractedCandidates({
      artifactBlobId: artifact.artifactId,
      tenantId,
      candidates: [
        {
          artifactBlobId: artifact.artifactId,
          candidateKey: `asset-${suffix}`,
          candidateType: "classification_candidate",
          fieldName: "probable_asset_name_mention",
          valueType: "text",
          candidateValue: assetName,
          confidence: 0.9,
          extractionMethod: "rule",
          extractionMethodDetail: "relationship_skeleton_asset_rule",
          summary: `Accepted asset truth candidate for ${assetName}`,
          reviewReady: true,
          sourceSemanticObjectType: "email_message",
          sourceSemanticObjectId: "emailmsg_test",
          citationPacket: packet({
            artifactId: artifact.artifactId,
            anchorId: artifact.anchorId,
            fieldName: "probable_asset_name_mention",
            value: assetName
          }),
          metadata: {
            scenario: "relationship-skeleton-asset"
          },
          tenantId
        },
        {
          artifactBlobId: artifact.artifactId,
          candidateKey: `org-domain-${suffix}`,
          candidateType: "classification_candidate",
          fieldName: "probable_originating_organization_domain",
          valueType: "domain",
          candidateValue: organizationDomain,
          confidence: 0.95,
          extractionMethod: "rule",
          extractionMethodDetail: "relationship_skeleton_org_domain_rule",
          summary: `Accepted organization domain candidate for ${organizationDomain}`,
          reviewReady: true,
          sourceSemanticObjectType: "email_message",
          sourceSemanticObjectId: "emailmsg_test",
          citationPacket: packet({
            artifactId: artifact.artifactId,
            anchorId: artifact.anchorId,
            fieldName: "probable_originating_organization_domain",
            value: organizationDomain
          }),
          metadata: {
            scenario: "relationship-skeleton-org-domain"
          },
          tenantId
        },
        {
          artifactBlobId: artifact.artifactId,
          candidateKey: `org-name-${suffix}`,
          candidateType: "classification_candidate",
          fieldName: "probable_originating_organization_name",
          valueType: "text",
          candidateValue: organizationName,
          confidence: 0.92,
          extractionMethod: "rule",
          extractionMethodDetail: "relationship_skeleton_org_name_rule",
          summary: `Accepted organization name candidate for ${organizationName}`,
          reviewReady: true,
          sourceSemanticObjectType: "email_message",
          sourceSemanticObjectId: "emailmsg_test",
          citationPacket: packet({
            artifactId: artifact.artifactId,
            anchorId: artifact.anchorId,
            fieldName: "probable_originating_organization_name",
            value: organizationName
          }),
          metadata: {
            scenario: "relationship-skeleton-org-name"
          },
          tenantId
        },
        {
          artifactBlobId: artifact.artifactId,
          candidateKey: `relationship-${suffix}`,
          candidateType: "relationship_assertion_candidate",
          fieldName: "probable_originating_organization_for_asset",
          valueType: "relationship",
          candidateValue: {
            relationshipType: "originating_organization_for_asset",
            assetName,
            organizationName,
            organizationDomain,
            emailMessageId: "emailmsg_test"
          },
          confidence: 0.88,
          extractionMethod: "rule",
          extractionMethodDetail: "relationship_skeleton_relationship_rule",
          summary: `Accepted relationship candidate linking ${organizationName} to ${assetName}`,
          reviewReady: true,
          sourceSemanticObjectType: "email_message",
          sourceSemanticObjectId: "emailmsg_test",
          citationPacket: packet({
            artifactId: artifact.artifactId,
            anchorId: artifact.anchorId,
            fieldName: "probable_originating_organization_for_asset",
            value: {
              relationshipType: "originating_organization_for_asset",
              assetName,
              organizationName,
              organizationDomain
            }
          }),
          metadata: {
            scenario: "relationship-skeleton"
          },
          tenantId
        },
        {
          artifactBlobId: artifact.artifactId,
          candidateKey: `broker-relationship-${suffix}`,
          candidateType: "relationship_assertion_candidate",
          fieldName: "probable_broker_organization_for_asset",
          valueType: "relationship",
          candidateValue: {
            relationshipType: "broker_organization_for_asset",
            assetName,
            organizationName,
            organizationDomain,
            emailMessageId: "emailmsg_test"
          },
          confidence: 0.93,
          extractionMethod: "rule",
          extractionMethodDetail: "relationship_skeleton_broker_relationship_rule",
          summary: `Accepted broker relationship candidate linking ${organizationName} to ${assetName}`,
          reviewReady: true,
          sourceSemanticObjectType: "email_message",
          sourceSemanticObjectId: "emailmsg_test",
          citationPacket: packet({
            artifactId: artifact.artifactId,
            anchorId: artifact.anchorId,
            fieldName: "probable_broker_organization_for_asset",
            value: {
              relationshipType: "broker_organization_for_asset",
              assetName,
              organizationName,
              organizationDomain
            }
          }),
          metadata: {
            scenario: "relationship-skeleton-broker"
          },
          tenantId
        }
      ] satisfies PersistExtractedCandidateInput[]
    });

    const byField = new Map(createdCandidates.map((candidate) => [candidate.fieldName, candidate]));
    const acceptedAsset = await reviewCandidate({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      candidateId: byField.get("probable_asset_name_mention")!.id,
      note: "Accept reviewed asset truth."
    });
    const acceptedOrgDomain = await reviewCandidate({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      candidateId: byField.get("probable_originating_organization_domain")!.id,
      note: "Accept reviewed organization domain truth."
    });
    const acceptedOrgName = await reviewCandidate({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      candidateId: byField.get("probable_originating_organization_name")!.id,
      note: "Accept reviewed organization name truth."
    });
    const acceptedRelationship = await reviewCandidate({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      candidateId: byField.get("probable_originating_organization_for_asset")!.id,
      note: "Accept reviewed asset-organization relationship truth."
    });
    const acceptedBrokerRelationship = await reviewCandidate({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      candidateId: byField.get("probable_broker_organization_for_asset")!.id,
      note: "Accept reviewed broker asset-organization relationship truth."
    });

    assert.ok(acceptedRelationship.acceptedRecord, "accepted relationship truth should be persisted");
    assert.equal(acceptedRelationship.acceptedRecord.acceptedRecordType, "relationship");
    assert.ok(acceptedBrokerRelationship.acceptedRecord, "accepted broker relationship truth should be persisted");
    assert.equal(acceptedBrokerRelationship.acceptedRecord.acceptedRecordType, "relationship");

    let entityQueue = await listEntityResolutionQueue();
    const assetProposal = entityQueue.items.find((item) => item.proposal.sourceCandidateId === acceptedAsset.candidate.id);
    assert.ok(assetProposal, "accepted asset truth should produce an entity reconciliation proposal");

    const resolvedAsset = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      proposalId: assetProposal.proposal.id,
      note: "Create canonical asset for relationship skeleton."
    });
    assert.ok(resolvedAsset.currentEntityLink, "asset reconciliation should create a canonical asset link");
    const assetEntityId = resolvedAsset.currentEntityLink.canonicalEntityId;
    canonicalEntityIds.add(assetEntityId);

    entityQueue = await listEntityResolutionQueue();
    const orgProposal = entityQueue.items.find((item) => item.proposal.sourceCandidateId === acceptedOrgDomain.candidate.id);
    assert.ok(orgProposal, "accepted organization domain truth should produce an entity reconciliation proposal");

    const resolvedOrg = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      proposalId: orgProposal.proposal.id,
      note: "Create canonical organization for relationship skeleton."
    });
    assert.ok(resolvedOrg.currentEntityLink, "organization reconciliation should create a canonical organization link");
    const organizationEntityId = resolvedOrg.currentEntityLink.canonicalEntityId;
    canonicalEntityIds.add(organizationEntityId);

    entityQueue = await listEntityResolutionQueue();
    const orgNameProposal = entityQueue.items.find((item) => item.proposal.sourceCandidateId === acceptedOrgName.candidate.id);
    assert.ok(orgNameProposal, "accepted organization name truth should also produce an entity reconciliation proposal");

    await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      proposalId: orgNameProposal.proposal.id,
      targetEntityId: organizationEntityId,
      note: "Attach reviewed organization name truth to the canonical organization."
    });

    let relationshipQueue = await listAssetOrganizationRelationshipQueue();
    const relationshipProposal = relationshipQueue.items.find(
      (item) => item.proposal.sourceCandidateId === acceptedRelationship.candidate.id
    );
    const brokerRelationshipProposal = relationshipQueue.items.find(
      (item) => item.proposal.sourceCandidateId === acceptedBrokerRelationship.candidate.id
    );
    assert.ok(relationshipProposal, "accepted relationship truth should produce a relationship reconciliation proposal");
    assert.ok(brokerRelationshipProposal, "accepted broker relationship truth should produce a relationship reconciliation proposal");
    assert.equal(relationshipProposal.proposal.resolutionReadiness, "ready_to_attach");
    assert.equal(brokerRelationshipProposal.proposal.relationshipType, "broker_organization_for_asset");
    assert.equal(brokerRelationshipProposal.proposal.resolutionReadiness, "ready_to_attach");
    assert.equal(relationshipProposal.proposal.assetCandidates[0]?.signalType, "artifact_entity_link");
    assert.equal(relationshipProposal.proposal.organizationCandidates[0]?.signalType, "artifact_entity_link");
    assert.equal(brokerRelationshipProposal.proposal.assetCandidates[0]?.signalType, "artifact_entity_link");
    assert.equal(brokerRelationshipProposal.proposal.organizationCandidates[0]?.signalType, "artifact_entity_link");

    const attachedRelationship = await reviewAssetOrganizationRelationshipProposal({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      canonicalAssetEntityId: assetEntityId,
      canonicalOrganizationEntityId: organizationEntityId,
      note: "Attach the accepted originating-organization relationship.",
      proposalId: relationshipProposal.proposal.id
    });

    assert.ok(attachedRelationship.currentRelationshipLink, "accepted relationship proposal should attach to canonical asset and organization");
    assert.equal(attachedRelationship.currentRelationshipLink.canonicalAssetEntityId, assetEntityId);
    assert.equal(attachedRelationship.currentRelationshipLink.canonicalOrganizationEntityId, organizationEntityId);
    assert.equal(attachedRelationship.reconciliationHistory.length, 1, "the first relationship review action should be recorded in reconciliation history");
    assert.equal(attachedRelationship.reconciliationHistory[0]?.action, "accept");
    assert.equal(
      attachedRelationship.systemEvents.filter((entry) => entry.eventType === "active_link_preserved").length,
      1,
      "relationship sync should record one preserved-link event after attachment"
    );

    const attachedBrokerRelationship = await reviewAssetOrganizationRelationshipProposal({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      canonicalAssetEntityId: assetEntityId,
      canonicalOrganizationEntityId: organizationEntityId,
      note: "Attach the accepted broker relationship.",
      proposalId: brokerRelationshipProposal.proposal.id
    });

    assert.ok(attachedBrokerRelationship.currentRelationshipLink, "accepted broker relationship proposal should attach to canonical asset and organization");
    assert.equal(attachedBrokerRelationship.currentRelationshipLink.canonicalAssetEntityId, assetEntityId);
    assert.equal(attachedBrokerRelationship.currentRelationshipLink.canonicalOrganizationEntityId, organizationEntityId);
    assert.equal(attachedBrokerRelationship.currentRelationshipLink.relationshipType, "broker_organization_for_asset");
    assert.equal(attachedBrokerRelationship.reconciliationHistory.length, 1, "the first broker relationship review action should be recorded in reconciliation history");
    assert.equal(attachedBrokerRelationship.reconciliationHistory[0]?.action, "accept");

    const acceptedRelationshipTruth = await getAcceptedTruthDetail({
      acceptedRecordId: acceptedRelationship.acceptedRecord!.id,
      acceptedRecordType: "relationship"
    });
    assert.ok(acceptedRelationshipTruth, "accepted relationship truth should be browsable after review");
    assert.equal(acceptedRelationshipTruth.acceptedRecord.fieldName, "probable_originating_organization_for_asset");
    const acceptedBrokerRelationshipTruth = await getAcceptedTruthDetail({
      acceptedRecordId: acceptedBrokerRelationship.acceptedRecord!.id,
      acceptedRecordType: "relationship"
    });
    assert.ok(acceptedBrokerRelationshipTruth, "accepted broker relationship truth should be browsable after review");
    assert.equal(acceptedBrokerRelationshipTruth.acceptedRecord.fieldName, "probable_broker_organization_for_asset");

    const relationshipDetail = await getAssetOrganizationRelationshipDetail(relationshipProposal.proposal.id);
    const brokerRelationshipDetail = await getAssetOrganizationRelationshipDetail(brokerRelationshipProposal.proposal.id);
    assert.ok(relationshipDetail, "relationship detail should remain accessible after attachment");
    assert.ok(brokerRelationshipDetail, "broker relationship detail should remain accessible after attachment");
    assert.equal(relationshipDetail.currentRelationshipLink?.canonicalAssetEntityId, assetEntityId);
    assert.equal(relationshipDetail.currentRelationshipLink?.canonicalOrganizationEntityId, organizationEntityId);
    assert.equal(brokerRelationshipDetail.currentRelationshipLink?.canonicalAssetEntityId, assetEntityId);
    assert.equal(brokerRelationshipDetail.currentRelationshipLink?.canonicalOrganizationEntityId, organizationEntityId);
    assert.equal(brokerRelationshipDetail.currentRelationshipLink?.relationshipType, "broker_organization_for_asset");
    assert.equal(
      relationshipDetail.systemEvents.filter((entry) => entry.eventType === "active_link_preserved").length,
      1,
      "repeated detail refreshes should not duplicate preserved-link system events"
    );

    relationshipQueue = await listAssetOrganizationRelationshipQueue();
    assert.equal(relationshipQueue.counts.pendingReview, 0, "no relationship proposals should remain pending after attachment");
    const allCurrentLinkedQueue = await listAssetOrganizationRelationshipQueue({
      relationshipType: "all",
      lifecycle: "current",
      linkState: "linked",
      proposalState: "accepted"
    });
    assert.equal(allCurrentLinkedQueue.items.length, 2, "all-type relationship filters should include both current linked relationship types");
    assert.deepEqual(
      new Set(allCurrentLinkedQueue.items.map((item) => item.proposal.relationshipType)),
      new Set(["originating_organization_for_asset", "broker_organization_for_asset"])
    );

    const filteredLinkedQueue = await listAssetOrganizationRelationshipQueue({
      relationshipType: "originating_organization_for_asset",
      lifecycle: "current",
      linkState: "linked",
      proposalState: "accepted"
    });
    assert.equal(filteredLinkedQueue.items.length, 1, "linked current relationship filters should isolate the active attached relationship");
    assert.equal(filteredLinkedQueue.items[0]?.acceptedRecordStatus, "active");
    const filteredBrokerQueue = await listAssetOrganizationRelationshipQueue({
      relationshipType: "broker_organization_for_asset",
      lifecycle: "current",
      linkState: "linked",
      proposalState: "accepted"
    });
    assert.equal(filteredBrokerQueue.items.length, 1, "broker relationship filters should isolate the active broker relationship");
    assert.equal(filteredBrokerQueue.items[0]?.acceptedRecordStatus, "active");

    await sql`
      update accepted_relationship_records
      set field_name = 'unsupported_relationship_verification'
      where id = ${acceptedRelationship.acceptedRecord!.id}
    `;

    const supersededDetail = await getAssetOrganizationRelationshipDetail(relationshipProposal.proposal.id);
    assert.ok(supersededDetail, "historical relationship proposal detail should remain inspectable after sync supersedes it");
    assert.equal(supersededDetail.proposal.currentProposal, false);
    assert.equal(supersededDetail.proposal.proposalState, "superseded");
    assert.equal(supersededDetail.currentRelationshipLink, null, "stale relationship links should be removed when the accepted relationship is no longer supported");
    assert.ok(
      supersededDetail.systemEvents.some((entry) => entry.eventType === "proposal_superseded"),
      "unsupported accepted relationship truth should record a supersede system event"
    );
    assert.ok(
      supersededDetail.systemEvents.some((entry) => entry.eventType === "stale_link_removed"),
      "unsupported accepted relationship truth should record a stale-link removal event"
    );

    await sql`
      update accepted_relationship_records
      set field_name = 'probable_originating_organization_for_asset'
      where id = ${acceptedRelationship.acceptedRecord!.id}
    `;

    const reactivatedDetail = await getAssetOrganizationRelationshipDetail(relationshipProposal.proposal.id);
    assert.ok(reactivatedDetail, "relationship proposal should reactivate when the accepted relationship becomes supported again");
    assert.equal(reactivatedDetail.proposal.currentProposal, true);
    assert.equal(reactivatedDetail.proposal.proposalState, "pending_review");
    assert.ok(
      reactivatedDetail.systemEvents.some((entry) => entry.eventType === "proposal_reactivated"),
      "reactivated relationship context should record a reactivation system event"
    );

    const reattachedRelationship = await reviewAssetOrganizationRelationshipProposal({
      action: "accept",
      actorId: "actor_relationship_test",
      actorName: "Relationship Test",
      canonicalAssetEntityId: assetEntityId,
      canonicalOrganizationEntityId: organizationEntityId,
      note: "Re-attach the accepted originating-organization relationship after reactivation.",
      proposalId: relationshipProposal.proposal.id
    });

    assert.equal(reattachedRelationship.reconciliationHistory.length, 2, "re-reviewing the same relationship proposal should append reconciliation history");
    assert.equal(reattachedRelationship.reconciliationHistory[0]?.action, "accept");
    assert.equal(reattachedRelationship.reconciliationHistory[1]?.action, "accept");

    await sql`
      delete from accepted_relationship_records
      where id = ${acceptedRelationship.acceptedRecord!.id}
    `;

    const deletedRetentionQueue = await listAssetOrganizationRelationshipQueue({
      relationshipType: "originating_organization_for_asset",
      lifecycle: "historical",
      linkState: "unlinked",
      proposalState: "superseded"
    });
    const deletedRetentionItem = deletedRetentionQueue.items.find(
      (item) => item.proposal.sourceCandidateId === acceptedRelationship.candidate.id
    );
    assert.ok(deletedRetentionItem, "historical relationship queue should retain the proposal after accepted relationship deletion");
    assert.equal(deletedRetentionItem.acceptedRecordStatus, "deleted");

    const deletedDetail = await getAssetOrganizationRelationshipDetail(relationshipProposal.proposal.id);
    assert.ok(deletedDetail, "relationship detail should remain intelligible after accepted relationship deletion");
    assert.equal(deletedDetail.acceptedRecordStatus, "deleted");
    assert.equal(deletedDetail.currentRelationshipLink, null, "relationship link should be removed after accepted relationship deletion");
    assert.equal(
      deletedDetail.acceptedRecord.metadata.acceptedRecordMissing,
      true,
      "deleted accepted relationship detail should be reconstructed from retained snapshot and candidate review context"
    );
    assert.ok(
      deletedDetail.systemEvents.some(
        (entry) => entry.eventType === "stale_link_removed" && entry.summary.toLowerCase().includes("deleted")
      ),
      "deleted accepted relationship should record a stale-link removal event that explains deletion"
    );
    assert.ok(
      deletedDetail.systemEvents.some(
        (entry) => entry.eventType === "proposal_superseded" && entry.summary.toLowerCase().includes("deleted")
      ),
      "deleted accepted relationship should record a supersede event that explains deletion"
    );
    const supersedeEvents = deletedDetail.systemEvents.filter((entry) => entry.eventType === "proposal_superseded");
    assert.equal(supersedeEvents.length, 2, "unsupported and deleted retention cycles should leave two distinct supersede events behind");
    assert.equal(
      supersedeEvents.filter((entry) => entry.summary.toLowerCase().includes("no longer supported")).length,
      1,
      "unsupported relationship truth should retain its own supersede event after later deletion"
    );
    assert.equal(
      supersedeEvents.filter((entry) => entry.summary.toLowerCase().includes("deleted")).length,
      1,
      "deleted relationship truth should record its own supersede event instead of collapsing into the unsupported one"
    );
    const staleLinkRemovalEvents = deletedDetail.systemEvents.filter((entry) => entry.eventType === "stale_link_removed");
    assert.equal(
      staleLinkRemovalEvents.length,
      2,
      "unsupported and deleted retention cycles should leave two distinct stale-link removal events behind"
    );
    assert.equal(
      staleLinkRemovalEvents.filter((entry) => entry.summary.toLowerCase().includes("no longer supported")).length,
      1,
      "unsupported relationship truth should retain its own stale-link removal event after later deletion"
    );
    assert.equal(
      staleLinkRemovalEvents.filter((entry) => entry.summary.toLowerCase().includes("deleted")).length,
      1,
      "deleted relationship truth should record its own stale-link removal event instead of collapsing into the unsupported one"
    );
    assert.equal(
      deletedDetail.reconciliationHistory.length,
      2,
      "human relationship reconciliation history should remain visible after accepted relationship deletion"
    );
  } finally {
    if (artifactIds.length > 0) {
      await sql`delete from artifact_blobs where id in ${sql([...new Set(artifactIds)])}`;
    }

    if (canonicalEntityIds.size > 0) {
      await sql`delete from canonical_entities where id in ${sql([...canonicalEntityIds])}`;
    }
  }
});
