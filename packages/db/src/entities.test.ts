import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { createId } from "@remi/domain";

import { closeDb, getDb } from "./client";
import type { PersistExtractedCandidateInput } from "./candidates";
import { replaceExtractedCandidates } from "./candidates";
import { getAcceptedTruthDetail } from "./truth";
import {
  getEntityResolutionDetail,
  listCanonicalEntities,
  listEntityResolutionQueue,
  reviewEntityResolutionProposal
} from "./entities";
import { reviewCandidate } from "./reviews";

const sql = getDb();

after(async () => {
  await closeDb();
});

test("entity reconciliation supports create-new, alias-match, and possible-match asset flows without regressing accepted truth attachment", async () => {
  const tenantId = "tenant_entity_alias_test";
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
        ${"application/octet-stream"},
        ${1024}
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
        ${"artifact_blob"},
        ${artifactId},
        ${"excerpt"},
        ${"primary"},
        ${`${name} anchor`},
        ${`Verification anchor for ${name}`},
        ${JSON.stringify({ sample: name, section: "body" })}::jsonb,
        ${JSON.stringify({ verification: true })}::jsonb
      )
    `;

    return { artifactId, anchorId };
  }

  function packet(input: { anchorId: string; artifactId: string; assetName: string }) {
    return {
      candidateType: "classification_candidate" as const,
      fieldName: "probable_asset_name_mention",
      candidateValue: input.assetName,
      confidenceScore: 0.88,
      sourceArtifactBlobId: input.artifactId,
      sourceSemanticObjectType: null,
      sourceSemanticObjectId: null,
      provenanceAnchorIds: [input.anchorId],
      evidencePreview: `Accepted asset mention ${input.assetName}`,
      extractionMethod: "rule" as const,
      extractionMethodDetail: "entity_alias_test_rule",
      extractionMetadata: {
        verification: true
      },
      createdAt: new Date().toISOString()
    };
  }

  async function createAcceptedAssetTruth(input: {
    assetName: string;
    documentTitle?: string;
    fileStem: string;
    originalFileName?: string;
  }) {
    const artifactName = input.originalFileName ?? `${input.fileStem}-${suffix}.eml`;
    const artifact = await createArtifact(artifactName);
    const candidateEntries: PersistExtractedCandidateInput[] = [
      {
        artifactBlobId: artifact.artifactId,
        candidateKey: `${input.fileStem}-${input.assetName}`,
        candidateType: "classification_candidate" as const,
        fieldName: "probable_asset_name_mention",
        valueType: "text",
        candidateValue: input.assetName,
        confidence: 0.88,
        extractionMethod: "rule" as const,
        extractionMethodDetail: "entity_alias_test_rule",
        summary: `Accepted truth candidate for ${input.assetName}`,
        reviewReady: true,
        sourceSemanticObjectType: null,
        sourceSemanticObjectId: null,
        citationPacket: packet({
          artifactId: artifact.artifactId,
          anchorId: artifact.anchorId,
          assetName: input.assetName
        }),
        metadata: {
          scenario: "entity-alias-test"
        },
        tenantId
      }
    ];

    if (input.documentTitle) {
      candidateEntries.push({
        artifactBlobId: artifact.artifactId,
        candidateKey: `${input.fileStem}-title-${input.documentTitle}`,
        candidateType: "classification_candidate" as const,
        fieldName: "probable_document_title",
        valueType: "text",
        candidateValue: input.documentTitle,
        confidence: 0.84,
        extractionMethod: "parser" as const,
        extractionMethodDetail: "entity_alias_test_title_parser",
        summary: `Document title candidate for ${input.documentTitle}`,
        reviewReady: true,
        sourceSemanticObjectType: null,
        sourceSemanticObjectId: null,
        citationPacket: {
          ...packet({
            artifactId: artifact.artifactId,
            anchorId: artifact.anchorId,
            assetName: input.documentTitle
          }),
          fieldName: "probable_document_title",
          candidateValue: input.documentTitle,
          extractionMethod: "parser",
          extractionMethodDetail: "entity_alias_test_title_parser",
          evidencePreview: input.documentTitle
        },
        metadata: {
          scenario: "entity-alias-test-title"
        },
        tenantId
      });
    }

    const createdCandidates = await replaceExtractedCandidates({
      artifactBlobId: artifact.artifactId,
      tenantId,
      candidates: candidateEntries
    });

    const assetCandidate = createdCandidates.find((candidate) => candidate.fieldName === "probable_asset_name_mention");
    assert.ok(assetCandidate, "asset-name candidate should exist");

    if (input.documentTitle) {
      const titleCandidate = createdCandidates.find((candidate) => candidate.fieldName === "probable_document_title");
      assert.ok(titleCandidate, "document-title candidate should exist");
      await reviewCandidate({
        action: "accept",
        actorId: "actor_test",
        actorName: "Entity Alias Test",
        candidateId: titleCandidate.id,
        note: `Accept title ${input.documentTitle} as reviewed truth.`
      });
    }

    const reviewDetail = await reviewCandidate({
      action: "accept",
      actorId: "actor_test",
      actorName: "Entity Alias Test",
      candidateId: assetCandidate.id,
      note: `Accept ${input.assetName} as reviewed truth.`
    });

    assert.ok(reviewDetail.acceptedRecord, "accepted truth record should exist after review acceptance");

    return {
      acceptedRecord: reviewDetail.acceptedRecord,
      artifact,
      candidate: reviewDetail.candidate
    };
  }

  try {
    const primaryName = `Harbor Pointe Apartments ${suffix}`;
    const primary = await createAcceptedAssetTruth({
      assetName: primaryName,
      documentTitle: `${primaryName} OM`,
      fileStem: "asset-primary"
    });

    let queue = await listEntityResolutionQueue();
    const primaryQueueItem = queue.items.find((item) => item.proposal.sourceCandidateId === primary.candidate.id);

    assert.ok(primaryQueueItem, "first accepted asset truth should generate a reconciliation proposal");
    assert.equal(primaryQueueItem.proposal.proposalKind, "create_entity");
    assert.equal(primaryQueueItem.proposal.matchCategory, "create_new");
    assert.equal(primaryQueueItem.proposal.matchingCandidates.length, 0);
    assert.equal(primaryQueueItem.currentEntityLink, null);

    const primaryResolved = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_test",
      actorName: "Entity Alias Test",
      proposalId: primaryQueueItem.proposal.id,
      note: "Create canonical asset from the first accepted truth."
    });

    assert.ok(primaryResolved.currentEntityLink, "first proposal acceptance should create an entity link");
    const primaryCanonicalEntityId = primaryResolved.currentEntityLink.canonicalEntityId;
    canonicalEntityIds.add(primaryCanonicalEntityId);
    assert.equal(primaryResolved.reconciliationHistory.length, 1, "first accepted entity proposal should record reconciliation history");
    assert.equal(primaryResolved.reconciliationHistory[0].previousProposalState, "pending_review");
    assert.equal(primaryResolved.reconciliationHistory[0].newProposalState, "accepted");
    assert.equal(primaryResolved.reconciliationHistory[0].chosenEntityCreated, true);

    await listEntityResolutionQueue();
    await listEntityResolutionQueue();
    const primaryDetail = await getEntityResolutionDetail(primaryQueueItem.proposal.id);
    assert.ok(primaryDetail, "accepted proposal detail should remain available after sync refresh");
    assert.equal(
      primaryDetail.systemEvents.filter((entry) => entry.eventType === "active_link_preserved").length,
      1,
      "repeated sync runs should not duplicate active-link-preserved events"
    );
    assert.equal(primaryDetail.reconciliationHistory.length, 1, "human reconciliation history should remain intact after sync refresh");

    const possibleMatchName = `Harbor Pointe ${suffix}`;
    const possible = await createAcceptedAssetTruth({
      assetName: possibleMatchName,
      fileStem: "asset-possible"
    });

    queue = await listEntityResolutionQueue();
    const possibleQueueItem = queue.items.find((item) => item.proposal.sourceCandidateId === possible.candidate.id);

    assert.ok(possibleQueueItem, "possible-match asset truth should generate a reconciliation proposal");
    assert.equal(possibleQueueItem.proposal.proposalKind, "attach_to_existing");
    assert.equal(possibleQueueItem.proposal.matchCategory, "possible_match");
    assert.equal(possibleQueueItem.proposal.matchingCandidates.length, 1);
    assert.equal(possibleQueueItem.proposal.matchingCandidates[0].entityId, primaryCanonicalEntityId);
    assert.equal(possibleQueueItem.currentEntityLink, null);

    const possibleResolved = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_test",
      actorName: "Entity Alias Test",
      proposalId: possibleQueueItem.proposal.id,
      targetEntityId: primaryCanonicalEntityId,
      note: "Attach possible match to the existing canonical asset."
    });

    assert.ok(possibleResolved.currentEntityLink, "possible-match truth should attach after operator review");
    assert.equal(possibleResolved.currentEntityLink.canonicalEntityId, primaryCanonicalEntityId);
    assert.deepEqual(
      possibleResolved.reconciliationHistory[0].createdAliasValues,
      [possibleMatchName],
      "attaching a distinct reviewed name should record alias creation in history"
    );

    const alias = await createAcceptedAssetTruth({
      assetName: possibleMatchName,
      fileStem: "asset-alias"
    });

    queue = await listEntityResolutionQueue();
    const aliasQueueItem = queue.items.find((item) => item.proposal.sourceCandidateId === alias.candidate.id);

    assert.ok(aliasQueueItem, "repeat alias truth should generate a reconciliation proposal");
    assert.equal(aliasQueueItem.proposal.proposalKind, "attach_to_existing");
    assert.equal(aliasQueueItem.proposal.matchCategory, "alias_match");
    assert.equal(aliasQueueItem.proposal.matchingCandidates.length, 1);
    assert.equal(aliasQueueItem.proposal.matchingCandidates[0].entityId, primaryCanonicalEntityId);
    assert.equal(aliasQueueItem.proposal.matchingCandidates[0].signalType, "alias_match");
    assert.equal(aliasQueueItem.proposal.matchingCandidates[0].aliasValue, possibleMatchName);

    const aliasResolved = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_test",
      actorName: "Entity Alias Test",
      proposalId: aliasQueueItem.proposal.id,
      targetEntityId: primaryCanonicalEntityId,
      note: "Attach alias match to the existing canonical asset."
    });

    assert.ok(aliasResolved.currentEntityLink, "alias match should attach after acceptance");
    assert.equal(aliasResolved.currentEntityLink.canonicalEntityId, primaryCanonicalEntityId);
    assert.deepEqual(aliasResolved.reconciliationHistory[0].createdAliasValues, [possibleMatchName]);

    const createNew = await createAcceptedAssetTruth({
      assetName: `Oak Terrace Villas ${suffix}`,
      fileStem: "asset-create-new"
    });

    queue = await listEntityResolutionQueue();
    const createNewQueueItem = queue.items.find((item) => item.proposal.sourceCandidateId === createNew.candidate.id);

    assert.ok(createNewQueueItem, "unmatched asset truth should stay reviewable");
    assert.equal(createNewQueueItem.proposal.proposalKind, "create_entity");
    assert.equal(createNewQueueItem.proposal.matchCategory, "create_new");
    assert.equal(createNewQueueItem.currentEntityLink, null);

    const rejectedCreateNew = await reviewEntityResolutionProposal({
      action: "reject",
      actorId: "actor_test",
      actorName: "Entity Alias Test",
      proposalId: createNewQueueItem.proposal.id,
      note: "Reject before reconciling this asset."
    });

    assert.equal(rejectedCreateNew.currentEntityLink, null);
    assert.equal(rejectedCreateNew.reconciliationHistory.length, 1);
    assert.equal(rejectedCreateNew.reconciliationHistory[0].previousProposalState, "pending_review");
    assert.equal(rejectedCreateNew.reconciliationHistory[0].newProposalState, "rejected");

    const acceptedAfterReject = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_test",
      actorName: "Entity Alias Test",
      proposalId: createNewQueueItem.proposal.id,
      displayName: `Oak Terrace Villas ${suffix}`,
      note: "Create canonical asset after prior rejection."
    });

    assert.ok(acceptedAfterReject.currentEntityLink, "re-reviewing a rejected proposal should be allowed and append history");
    canonicalEntityIds.add(acceptedAfterReject.currentEntityLink.canonicalEntityId);
    assert.equal(acceptedAfterReject.reconciliationHistory.length, 2);
    assert.equal(acceptedAfterReject.reconciliationHistory[0].previousProposalState, "rejected");
    assert.equal(acceptedAfterReject.reconciliationHistory[0].newProposalState, "accepted");
    assert.equal(acceptedAfterReject.reconciliationHistory[0].chosenEntityCreated, true);
    assert.equal(acceptedAfterReject.reconciliationHistory[1].newProposalState, "rejected");

    const canonicalEntities = await listCanonicalEntities();
    const primaryEntity = canonicalEntities.find((entity) => entity.id === primaryCanonicalEntityId);

    assert.ok(primaryEntity, "primary canonical asset should be listed");
    assert.ok(
      primaryEntity.aliases.some((aliasEntry) => aliasEntry.aliasValue === possibleMatchName),
      "accepted alias attachment should persist a source-observed alias"
    );

    const truthDetail = await getAcceptedTruthDetail({
      acceptedRecordId: alias.acceptedRecord.id,
      acceptedRecordType: alias.acceptedRecord.acceptedRecordType
    });

    assert.ok(truthDetail, "accepted truth detail should still load after alias attachment");
    assert.ok(truthDetail.reviewHistory.length >= 1, "accepted truth review history should remain intact after alias attachment");

    await sql`delete from accepted_classification_records where id = ${possible.acceptedRecord.id}`;

    queue = await listEntityResolutionQueue();
    const supersededPossibleQueueItem = queue.items.find((item) => item.proposal.id === possibleQueueItem.proposal.id);
    assert.ok(supersededPossibleQueueItem, "superseded proposals should remain visible in the entity lane after source truth disappears");
    assert.equal(supersededPossibleQueueItem.proposal.currentProposal, false);
    assert.equal(supersededPossibleQueueItem.currentEntityLink, null, "stale entity links should be removed when source truth disappears");

    await listEntityResolutionQueue();
    const supersededPossibleDetail = await getEntityResolutionDetail(possibleQueueItem.proposal.id);
    assert.ok(supersededPossibleDetail, "proposal detail should fall back to source-candidate state after accepted truth removal");
    assert.equal(
      supersededPossibleDetail.acceptedRecord.metadata.acceptedRecordMissing,
      true,
      "superseded proposal detail should flag reconstructed accepted-truth snapshots"
    );
    assert.equal(supersededPossibleDetail.proposal.currentProposal, false);
    assert.ok(
      supersededPossibleDetail.systemEvents.some((entry) => entry.eventType === "proposal_superseded"),
      "truth disappearance should record a proposal-superseded system event"
    );
    assert.ok(
      supersededPossibleDetail.systemEvents.some((entry) => entry.eventType === "stale_link_removed"),
      "truth disappearance should record stale entity-link removal"
    );
    const removedAliasEvent = supersededPossibleDetail.systemEvents.find((entry) => entry.eventType === "alias_removed");
    assert.ok(removedAliasEvent, "truth disappearance should record alias removal when observed aliases are cleaned up");
    assert.deepEqual(removedAliasEvent.aliasValues, [possibleMatchName]);
    assert.equal(
      supersededPossibleDetail.systemEvents.filter((entry) => entry.eventType === "proposal_superseded").length,
      1,
      "repeated sync runs should not duplicate supersede events"
    );
    assert.equal(
      supersededPossibleDetail.systemEvents.filter((entry) => entry.eventType === "stale_link_removed").length,
      1,
      "repeated sync runs should not duplicate stale-link removal events"
    );
    assert.equal(
      supersededPossibleDetail.systemEvents.filter((entry) => entry.eventType === "alias_removed").length,
      1,
      "repeated sync runs should not duplicate alias-removal events"
    );

    queue = await listEntityResolutionQueue();
    assert.equal(queue.counts.attachedAcceptedTruths, 3, "only current accepted truths should count as attached after one source truth disappears");
    assert.equal(queue.counts.unattachedAcceptedTruths, 0, "no accepted truths should remain unattached after final acceptance");
    assert.equal(queue.counts.pendingReview, 0, "no entity proposals should remain pending after final acceptance");
  } finally {
    if (artifactIds.length > 0) {
      await sql`delete from artifact_blobs where id in ${sql([...new Set(artifactIds)])}`;
    }

    if (canonicalEntityIds.size > 0) {
      await sql`delete from canonical_entities where id in ${sql([...canonicalEntityIds])}`;
    }
  }
});

test("entity reconciliation supports narrow organization domain and name flows without regressing existing asset behavior", async () => {
  const tenantId = "tenant_entity_org_test";
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
        ${"artifact_blob"},
        ${artifactId},
        ${"email_header"},
        ${"primary"},
        ${`${name} header`},
        ${`Verification header for ${name}`},
        ${JSON.stringify({ sample: name, section: "header" })}::jsonb,
        ${JSON.stringify({ verification: true })}::jsonb
      )
    `;

    return { artifactId, anchorId };
  }

  function packet(input: { anchorId: string; artifactId: string; fieldName: string; value: string }) {
    return {
      candidateType: "classification_candidate" as const,
      fieldName: input.fieldName,
      candidateValue: input.value,
      confidenceScore: 0.9,
      sourceArtifactBlobId: input.artifactId,
      sourceSemanticObjectType: "email_message",
      sourceSemanticObjectId: "emailmsg_test",
      provenanceAnchorIds: [input.anchorId],
      evidencePreview: `${input.fieldName}: ${input.value}`,
      extractionMethod: "rule" as const,
      extractionMethodDetail: "organization_identity_test_rule",
      extractionMetadata: {
        verification: true
      },
      createdAt: new Date().toISOString()
    };
  }

  async function createAcceptedOrganizationTruth(input: {
    domain?: string;
    fileStem: string;
    name?: string;
  }) {
    const artifact = await createArtifact(`${input.fileStem}-${suffix}.eml`);
    const candidates: PersistExtractedCandidateInput[] = [];

    if (input.domain) {
      candidates.push({
        artifactBlobId: artifact.artifactId,
        candidateKey: `${input.fileStem}-domain-${input.domain}`,
        candidateType: "classification_candidate" as const,
        fieldName: "probable_originating_organization_domain",
        valueType: "domain",
        candidateValue: input.domain,
        confidence: 0.95,
        extractionMethod: "rule" as const,
        extractionMethodDetail: "organization_domain_test_rule",
        summary: `Accepted organization-domain candidate for ${input.domain}`,
        reviewReady: true,
        sourceSemanticObjectType: "email_message",
        sourceSemanticObjectId: "emailmsg_test",
        citationPacket: packet({
          artifactId: artifact.artifactId,
          anchorId: artifact.anchorId,
          fieldName: "probable_originating_organization_domain",
          value: input.domain
        }),
        metadata: {
          scenario: "entity-organization-test"
        },
        tenantId
      });
    }

    if (input.name) {
      candidates.push({
        artifactBlobId: artifact.artifactId,
        candidateKey: `${input.fileStem}-name-${input.name}`,
        candidateType: "classification_candidate" as const,
        fieldName: "probable_originating_organization_name",
        valueType: "text",
        candidateValue: input.name,
        confidence: 0.9,
        extractionMethod: "rule" as const,
        extractionMethodDetail: "organization_name_test_rule",
        summary: `Accepted organization-name candidate for ${input.name}`,
        reviewReady: true,
        sourceSemanticObjectType: "email_message",
        sourceSemanticObjectId: "emailmsg_test",
        citationPacket: packet({
          artifactId: artifact.artifactId,
          anchorId: artifact.anchorId,
          fieldName: "probable_originating_organization_name",
          value: input.name
        }),
        metadata: {
          scenario: "entity-organization-test"
        },
        tenantId
      });
    }

    const createdCandidates = await replaceExtractedCandidates({
      artifactBlobId: artifact.artifactId,
      tenantId,
      candidates
    });

    const acceptedRecords = new Map<string, NonNullable<Awaited<ReturnType<typeof reviewCandidate>>["acceptedRecord"]>>();
    const acceptedCandidates = new Map<string, Awaited<ReturnType<typeof reviewCandidate>>["candidate"]>();
    for (const candidate of createdCandidates) {
      const reviewDetail = await reviewCandidate({
        action: "accept",
        actorId: "actor_org_test",
        actorName: "Entity Organization Test",
        candidateId: candidate.id,
        note: `Accept ${candidate.fieldName} for organization reconciliation.`
      });

      assert.ok(reviewDetail.acceptedRecord, "accepted organization truth should exist after review");
      acceptedRecords.set(candidate.fieldName, reviewDetail.acceptedRecord);
      acceptedCandidates.set(candidate.fieldName, reviewDetail.candidate);
    }

    return {
      acceptedCandidates,
      acceptedRecords,
      artifact
    };
  }

  try {
    const primary = await createAcceptedOrganizationTruth({
      name: "Creston Capital",
      domain: "crestoncapital.com",
      fileStem: "org-primary"
    });

    let queue = await listEntityResolutionQueue();
    const createOrgQueueItem = queue.items.find(
      (item) =>
        item.proposal.sourceCandidateId ===
        primary.acceptedCandidates.get("probable_originating_organization_domain")?.id
    );
    assert.ok(createOrgQueueItem, "accepted organization-domain truth should generate a reconciliation proposal");
    assert.equal(createOrgQueueItem.proposal.entityType, "organization");
    assert.equal(createOrgQueueItem.proposal.proposalKind, "create_entity");
    assert.equal(createOrgQueueItem.proposal.matchCategory, "create_new");

    const createdOrganization = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_org_test",
      actorName: "Entity Organization Test",
      proposalId: createOrgQueueItem.proposal.id,
      note: "Create canonical organization from accepted domain truth."
    });

    assert.ok(createdOrganization.currentEntityLink, "organization create-new flow should create a canonical entity link");
    assert.equal(createdOrganization.currentEntityLink.canonicalEntityType, "organization");
    assert.equal(createdOrganization.currentEntityLink.canonicalEntityDisplayName, "Creston Capital");
    const organizationEntityId = createdOrganization.currentEntityLink.canonicalEntityId;
    canonicalEntityIds.add(organizationEntityId);

    queue = await listEntityResolutionQueue();
    const nameQueueItem = queue.items.find(
      (item) =>
        item.proposal.sourceCandidateId ===
        primary.acceptedCandidates.get("probable_originating_organization_name")?.id
    );
    assert.ok(nameQueueItem, "accepted organization-name truth should also generate a reconciliation proposal");
    assert.equal(nameQueueItem.proposal.entityType, "organization");
    assert.equal(nameQueueItem.proposal.matchCategory, "exact_match");
    assert.equal(nameQueueItem.proposal.matchingCandidates[0]?.signalType, "exact_name_match");

    const attachedByName = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_org_test",
      actorName: "Entity Organization Test",
      proposalId: nameQueueItem.proposal.id,
      targetEntityId: organizationEntityId,
      note: "Attach organization-name truth to the existing canonical organization."
    });

    assert.ok(attachedByName.currentEntityLink, "organization-name truth should attach to the existing organization");
    assert.equal(attachedByName.currentEntityLink.canonicalEntityId, organizationEntityId);

    const duplicateDomain = await createAcceptedOrganizationTruth({
      domain: "crestoncapital.com",
      fileStem: "org-duplicate-domain"
    });

    queue = await listEntityResolutionQueue();
    const attachExistingQueueItem = queue.items.find(
      (item) =>
        item.proposal.sourceCandidateId ===
        duplicateDomain.acceptedCandidates.get("probable_originating_organization_domain")?.id
    );

    assert.ok(attachExistingQueueItem, "duplicate accepted organization domain should generate another reconciliation proposal");
    assert.equal(attachExistingQueueItem.proposal.entityType, "organization");
    assert.equal(attachExistingQueueItem.proposal.proposalKind, "attach_to_existing");
    assert.equal(attachExistingQueueItem.proposal.matchCategory, "exact_match");
    assert.equal(attachExistingQueueItem.proposal.matchingCandidates[0]?.signalType, "exact_domain_match");
    assert.equal(attachExistingQueueItem.proposal.matchingCandidates[0]?.entityId, organizationEntityId);

    const attachedByDomain = await reviewEntityResolutionProposal({
      action: "accept",
      actorId: "actor_org_test",
      actorName: "Entity Organization Test",
      proposalId: attachExistingQueueItem.proposal.id,
      targetEntityId: organizationEntityId,
      note: "Attach organization-domain truth to the existing canonical organization."
    });

    assert.ok(attachedByDomain.currentEntityLink, "organization-domain truth should attach to the existing organization");
    assert.equal(attachedByDomain.currentEntityLink.canonicalEntityId, organizationEntityId);

    const canonicalEntities = await listCanonicalEntities();
    const createdOrganizationEntity = canonicalEntities.find((entity) => entity.id === organizationEntityId);

    assert.ok(createdOrganizationEntity, "created organization should be listed as a canonical entity");
    assert.equal(createdOrganizationEntity.entityType, "organization");
    assert.ok(
      createdOrganizationEntity.aliases.some(
        (aliasEntry) => aliasEntry.aliasType === "observed_domain" && aliasEntry.aliasValue === "crestoncapital.com"
      ),
      "organization reconciliation should persist the reviewed sender domain as an observed-domain alias"
    );

    const acceptedOrgTruth = await getAcceptedTruthDetail({
      acceptedRecordId: primary.acceptedRecords.get("probable_originating_organization_domain")!.id,
      acceptedRecordType: primary.acceptedRecords.get("probable_originating_organization_domain")!.acceptedRecordType
    });

    assert.ok(acceptedOrgTruth, "accepted organization truth should be browsable after review acceptance");
    assert.equal(acceptedOrgTruth.acceptedRecord.fieldName, "probable_originating_organization_domain");
    assert.equal(acceptedOrgTruth.acceptedRecord.acceptedValue, "crestoncapital.com");

    queue = await listEntityResolutionQueue();
    assert.equal(queue.counts.pendingReview, 0, "no organization reconciliation proposals should remain pending after review");
  } finally {
    if (artifactIds.length > 0) {
      await sql`delete from artifact_blobs where id in ${sql([...new Set(artifactIds)])}`;
    }

    if (canonicalEntityIds.size > 0) {
      await sql`delete from canonical_entities where id in ${sql([...canonicalEntityIds])}`;
    }
  }
});
