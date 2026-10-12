import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedContentSummary, ProvenanceAnchorsSummary } from "@remi/domain";

import { extractEvidenceBackedCandidates } from "./candidate-extraction";

function buildEmailContext(input: { sender: string; subject?: string }) {
  const normalizedContent: NormalizedContentSummary = {
    contentKind: "email",
    lastNormalizedAt: new Date().toISOString(),
    document: null,
    documentPages: [],
    emailThread: {
      id: "emailthread_test",
      threadKey: "thread:test",
      subject: input.subject ?? "Sycamore Ridge",
      messageCount: 1
    },
    emailMessages: [
      {
        id: "emailmsg_test",
        position: 0,
        messageIdHeader: "<msg@test>",
        subject: input.subject ?? "Sycamore Ridge",
        sender: input.sender,
        to: ["team@syntheticcapital.com"],
        cc: [],
        sentAt: "2026-03-12T09:15:00.000Z",
        sentAtRaw: "Thu, 12 Mar 2026 09:15:00 -0500",
        bodyPreview: "Please review the current asset materials.",
        attachmentCount: 0
      }
    ],
    attachments: [],
    workbook: null,
    worksheets: [],
    structuredTables: []
  };
  const provenanceAnchors: ProvenanceAnchorsSummary = {
    totalCount: 2,
    groups: [
      {
        anchorKind: "email_header",
        count: 1
      },
      {
        anchorKind: "email_body",
        count: 1
      }
    ],
    items: [
      {
        id: "anchor_header",
        ownerType: "email_message",
        ownerId: "emailmsg_test",
        anchorKind: "email_header",
        anchorKey: "header",
        title: "Email Header",
        summary: "Header values",
        locator: {},
        metadata: {}
      },
      {
        id: "anchor_body",
        ownerType: "email_message",
        ownerId: "emailmsg_test",
        anchorKind: "email_body",
        anchorKey: "body",
        title: "Email Body",
        summary: "Body preview",
        locator: {},
        metadata: {}
      }
    ]
  };

  return {
    artifactBlobId: "artifact_test",
    fileName: "sample-broker.eml",
    normalizedContent,
    provenanceAnchors
  };
}

test("candidate extraction emits grounded organization domain and name signals for reliable corporate senders", () => {
  const candidates = extractEvidenceBackedCandidates(
    buildEmailContext({
      sender: "Creston Capital <broker@crestoncapital.com>"
    })
  );

  const organizationDomain = candidates.find(
    (candidate) => candidate.fieldName === "probable_originating_organization_domain"
  );
  const organizationName = candidates.find(
    (candidate) => candidate.fieldName === "probable_originating_organization_name"
  );

  assert.ok(organizationDomain, "corporate sender domains should produce an organization-domain candidate");
  assert.equal(organizationDomain?.candidateValue, "crestoncapital.com");
  assert.ok(organizationName, "reliable corporate sender display names should produce an organization-name candidate");
  assert.equal(organizationName?.candidateValue, "Creston Capital");
});

test("candidate extraction emits a narrow asset-organization relationship signal when asset and organization evidence coexist", () => {
  const candidates = extractEvidenceBackedCandidates(
    buildEmailContext({
      sender: "Creston Capital <team@crestoncapital.com>",
      subject: "Sycamore Ridge"
    })
  );

  const relationship = candidates.find(
    (candidate) => candidate.fieldName === "probable_originating_organization_for_asset"
  );
  assert.ok(
    relationship,
    "coexisting asset and organization evidence should produce an asset-organization relationship candidate"
  );
  assert.deepEqual(relationship?.candidateValue, {
    assetName: "Sycamore Ridge",
    emailMessageId: "emailmsg_test",
    organizationDomain: "crestoncapital.com",
    organizationName: "Creston Capital",
    relationshipType: "originating_organization_for_asset"
  });
});

test("candidate extraction emits a broker asset-organization relationship signal only when broker evidence is explicit", () => {
  const candidates = extractEvidenceBackedCandidates(
    buildEmailContext({
      sender: "Creston Capital <broker@crestoncapital.com>",
      subject: "Sycamore Ridge offering memorandum"
    })
  );

  const brokerRelationship = candidates.find(
    (candidate) => candidate.fieldName === "probable_broker_organization_for_asset"
  );
  assert.ok(
    brokerRelationship,
    "explicit broker sender evidence should produce a broker asset-organization relationship candidate"
  );
  assert.deepEqual(brokerRelationship?.candidateValue, {
    assetName: "Sycamore Ridge",
    emailMessageId: "emailmsg_test",
    organizationDomain: "crestoncapital.com",
    organizationName: "Creston Capital",
    relationshipType: "broker_organization_for_asset"
  });
  assert.equal(
    candidates.some((candidate) => candidate.fieldName === "probable_originating_organization_for_asset"),
    false,
    "explicit broker evidence should not also emit an originating-organization relationship candidate from the same sender context"
  );
});

test("candidate extraction suppresses organization identity signals for public email domains", () => {
  const candidates = extractEvidenceBackedCandidates(
    buildEmailContext({
      sender: "Jane Broker <jane.broker@gmail.com>"
    })
  );

  assert.equal(
    candidates.some((candidate) => candidate.fieldName === "probable_originating_organization_domain"),
    false,
    "public email domains should not be promoted into organization-domain candidates"
  );
  assert.equal(
    candidates.some((candidate) => candidate.fieldName === "probable_originating_organization_name"),
    false,
    "personal sender names should not be promoted into organization-name candidates without stronger evidence"
  );
});
