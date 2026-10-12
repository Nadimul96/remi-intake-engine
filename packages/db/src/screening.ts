import type {
  AcceptedTruthBrowserCounts,
  AcceptedTruthListItem,
  AssetOrganizationRelationshipQueueItem,
  DealScreeningWorkbench,
  EntityResolutionQueueItem,
  ExtractedCandidateSummary,
  ScreeningIssue,
  ScreeningLaneStatus,
  ScreeningReadinessStatus
} from "@remi/domain";
import { listEntityResolutionQueue } from "./entities";
import { getIntakeQueueItem } from "./intake";
import { listAssetOrganizationRelationshipQueue } from "./relationships";
import { listAcceptedTruthRecords } from "./truth";

const allRelationshipFilters = {
  relationshipType: "all",
  lifecycle: "all",
  linkState: "all",
  proposalState: "all"
} as const;

function emptyAcceptedTruthCounts(): AcceptedTruthBrowserCounts {
  return {
    all: 0,
    fact: 0,
    relationship: 0,
    classification: 0
  };
}

function acceptedTruthCounts(items: AcceptedTruthListItem[]): AcceptedTruthBrowserCounts {
  return {
    all: items.length,
    fact: items.filter((item) => item.acceptedRecordType === "fact").length,
    relationship: items.filter((item) => item.acceptedRecordType === "relationship").length,
    classification: items.filter((item) => item.acceptedRecordType === "classification").length
  };
}

function candidateSignalSummary(items: ExtractedCandidateSummary[]): DealScreeningWorkbench["candidateSignals"] {
  return {
    pendingReview: items.filter((item) => item.reviewStatus === "pending_review").length,
    accepted: items.filter((item) => item.reviewStatus === "accepted").length,
    rejected: items.filter((item) => item.reviewStatus === "rejected").length,
    editedAndAccepted: items.filter((item) => item.reviewStatus === "edited_and_accepted").length,
    items
  };
}

function laneStatus<T>(
  items: T[],
  isCurrent: (item: T) => boolean,
  isResolved: (item: T) => boolean
): ScreeningLaneStatus {
  const currentItems = items.filter(isCurrent);
  const resolvedCurrent = currentItems.filter(isResolved).length;
  return {
    currentTotal: currentItems.length,
    resolvedCurrent,
    unresolvedCurrent: currentItems.length - resolvedCurrent
  };
}

function acceptedString(items: AcceptedTruthListItem[], fieldName: string): string | null {
  const record = items.find((item) => item.fieldName === fieldName);
  return typeof record?.acceptedValue === "string" && record.acceptedValue.trim() ? record.acceptedValue.trim() : null;
}

function relationshipValue(item: AcceptedTruthListItem | AssetOrganizationRelationshipQueueItem | null): {
  assetName: string | null;
  organizationDomain: string | null;
  organizationName: string | null;
  relationshipType: string | null;
} | null {
  if (!item) {
    return null;
  }

  const value = item.acceptedValue;
  if (!value || typeof value !== "object") {
    return null;
  }

  const assetName = "assetName" in value && typeof value.assetName === "string" ? value.assetName.trim() : null;
  const organizationName =
    "organizationName" in value && typeof value.organizationName === "string" ? value.organizationName.trim() : null;
  const organizationDomain =
    "organizationDomain" in value && typeof value.organizationDomain === "string"
      ? value.organizationDomain.trim()
      : null;
  const relationshipType =
    "relationshipType" in value && typeof value.relationshipType === "string" ? value.relationshipType : null;

  if (!assetName && !organizationName && !organizationDomain && !relationshipType) {
    return null;
  }

  return {
    assetName,
    organizationDomain,
    organizationName,
    relationshipType
  };
}

function relationshipTypeLabel(value: string | null): string {
  switch (value) {
    case "broker_organization_for_asset":
      return "broker relationship";
    case "originating_organization_for_asset":
      return "originating organization relationship";
    default:
      return "relationship";
  }
}

function buildAboutSummary(input: {
  acceptedTruthItems: AcceptedTruthListItem[];
  relationshipItems: AssetOrganizationRelationshipQueueItem[];
  sourceItem: DealScreeningWorkbench["sourceItem"];
}): string {
  const activeRelationship =
    input.relationshipItems.find((item) => item.proposal.currentProposal && item.currentRelationshipLink !== null) ??
    input.relationshipItems.find((item) => item.proposal.currentProposal) ??
    input.acceptedTruthItems.find((item) => item.acceptedRecordType === "relationship") ??
    null;
  const relationship = relationshipValue(activeRelationship);
  const assetName =
    relationship?.assetName ??
    acceptedString(input.acceptedTruthItems, "probable_asset_name_mention") ??
    input.sourceItem.normalizedContent.emailThread?.subject ??
    input.sourceItem.fileName;
  const organizationName =
    relationship?.organizationName ??
    acceptedString(input.acceptedTruthItems, "probable_originating_organization_name");
  const organizationDomain =
    relationship?.organizationDomain ??
    acceptedString(input.acceptedTruthItems, "probable_originating_organization_domain");

  if (assetName && (organizationName || organizationDomain)) {
    return `REMI currently reads this package as ${relationshipTypeLabel(relationship?.relationshipType ?? null)} context for asset "${assetName}" and organization "${organizationName ?? organizationDomain}".`;
  }

  if (assetName) {
    return `REMI currently reads this package as screening material centered on asset "${assetName}".`;
  }

  return `REMI currently reads this package as intake context for "${input.sourceItem.fileName}", but more reviewed truth is still needed before screening output would be trustworthy.`;
}

function buildNeedsAttention(input: {
  candidateSignals: DealScreeningWorkbench["candidateSignals"];
  entityAssetItems: EntityResolutionQueueItem[];
  entityOrganizationItems: EntityResolutionQueueItem[];
  relationships: DealScreeningWorkbench["relationships"];
  sourceItem: DealScreeningWorkbench["sourceItem"];
}): ScreeningIssue[] {
  const issues: ScreeningIssue[] = [];

  if (input.sourceItem.ingestionStatus !== "completed") {
    issues.push({
      id: `intake:${input.sourceItem.id}`,
      kind: "intake_processing",
      title: "Intake processing not complete",
      summary: `Ingestion is still ${input.sourceItem.ingestionStatus} at stage ${input.sourceItem.ingestionStage}.`,
      href: "/intake"
    });
  }

  for (const candidate of input.candidateSignals.items.filter((item) => item.reviewStatus === "pending_review")) {
    issues.push({
      id: `candidate:${candidate.id}`,
      kind: "candidate_review",
      title: `Candidate review needed: ${candidate.fieldName.replaceAll("_", " ")}`,
      summary: candidate.summary,
      href: "/review"
    });
  }

  for (const item of input.entityAssetItems.filter(
    (entry) => entry.proposal.currentProposal && entry.currentEntityLink === null
  )) {
    issues.push({
      id: `asset-entity:${item.proposal.id}`,
      kind: "asset_identity",
      title: "Asset identity unresolved",
      summary: item.proposal.statusExplanation,
      href: "/entities"
    });
  }

  for (const item of input.entityOrganizationItems.filter(
    (entry) => entry.proposal.currentProposal && entry.currentEntityLink === null
  )) {
    issues.push({
      id: `organization-entity:${item.proposal.id}`,
      kind: "organization_identity",
      title: "Organization identity unresolved",
      summary: item.proposal.statusExplanation,
      href: "/entities"
    });
  }

  for (const item of input.relationships.currentItems.filter((entry) => entry.currentRelationshipLink === null)) {
    issues.push({
      id: `relationship:${item.proposal.id}`,
      kind: "relationship_review",
      title: "Relationship reconciliation unresolved",
      summary: item.proposal.statusExplanation,
      href: "/relationships"
    });
  }

  return issues;
}

function buildReadiness(input: {
  acceptedTruthItems: AcceptedTruthListItem[];
  candidateSignals: DealScreeningWorkbench["candidateSignals"];
  entityAssetItems: EntityResolutionQueueItem[];
  entityOrganizationItems: EntityResolutionQueueItem[];
  relationships: DealScreeningWorkbench["relationships"];
  sourceItem: DealScreeningWorkbench["sourceItem"];
}): DealScreeningWorkbench["readiness"] {
  const assetIdentity = laneStatus(
    input.entityAssetItems,
    (item) => item.proposal.currentProposal,
    (item) => item.currentEntityLink !== null
  );
  const organizationIdentity = laneStatus(
    input.entityOrganizationItems,
    (item) => item.proposal.currentProposal,
    (item) => item.currentEntityLink !== null
  );
  const relationships = laneStatus(
    input.relationships.currentItems,
    (item) => item.proposal.currentProposal,
    (item) => item.currentRelationshipLink !== null
  );
  const needsAttention = buildNeedsAttention(input);
  const stableProcessingContext =
    input.sourceItem.ingestionStatus === "completed" &&
    (input.sourceItem.candidateExtractionResult.status === "completed" ||
      input.sourceItem.candidateExtractionResult.status === "completed_with_warnings");

  let status: ScreeningReadinessStatus;
  if (!stableProcessingContext && input.acceptedTruthItems.length === 0) {
    status = "insufficient_context";
  } else if (needsAttention.length > 0 || input.acceptedTruthItems.length === 0) {
    status = "needs_review";
  } else {
    status = "ready";
  }

  return {
    status,
    about: buildAboutSummary({
      acceptedTruthItems: input.acceptedTruthItems,
      relationshipItems: [...input.relationships.currentItems, ...input.relationships.historicalItems],
      sourceItem: input.sourceItem
    }),
    pendingCandidateReviews: input.candidateSignals.pendingReview,
    assetIdentity,
    organizationIdentity,
    relationships,
    needsAttention
  };
}

export async function getDealScreeningWorkbench(sourceItemId: string): Promise<DealScreeningWorkbench | null> {
  const sourceItem = await getIntakeQueueItem(sourceItemId);
  if (!sourceItem) {
    return null;
  }

  const artifactBlobId = sourceItem.artifactBlobId;
  const candidateIds = new Set(sourceItem.candidateSignals.map((item) => item.id));
  const candidateSignals = candidateSignalSummary(sourceItem.candidateSignals);

  const [acceptedTruthBrowser, entityQueue, relationshipQueue] = await Promise.all([
    artifactBlobId
      ? listAcceptedTruthRecords("all")
      : Promise.resolve({ counts: emptyAcceptedTruthCounts(), items: [] }),
    candidateIds.size > 0 ? listEntityResolutionQueue() : Promise.resolve(null),
    candidateIds.size > 0 ? listAssetOrganizationRelationshipQueue(allRelationshipFilters) : Promise.resolve(null)
  ]);

  const acceptedTruthItems = artifactBlobId
    ? acceptedTruthBrowser.items.filter(
        (item) => item.artifactBlobId === artifactBlobId || candidateIds.has(item.sourceCandidateId)
      )
    : [];

  const entityItems =
    entityQueue?.items.filter(
      (item) =>
        (artifactBlobId !== null && item.artifactBlobId === artifactBlobId) ||
        candidateIds.has(item.proposal.sourceCandidateId)
    ) ?? [];
  const relationshipItems =
    relationshipQueue?.items.filter(
      (item) =>
        (artifactBlobId !== null && item.artifactBlobId === artifactBlobId) ||
        candidateIds.has(item.proposal.sourceCandidateId)
    ) ?? [];

  const entityResolution = {
    assetItems: entityItems.filter((item) => item.proposal.entityType === "asset"),
    organizationItems: entityItems.filter((item) => item.proposal.entityType === "organization")
  };
  const relationships = {
    currentItems: relationshipItems.filter((item) => item.proposal.currentProposal),
    historicalItems: relationshipItems.filter((item) => !item.proposal.currentProposal)
  };

  return {
    sourceItem,
    candidateSignals,
    acceptedTruth: {
      counts: acceptedTruthCounts(acceptedTruthItems),
      items: acceptedTruthItems
    },
    entityResolution,
    relationships,
    readiness: buildReadiness({
      acceptedTruthItems,
      candidateSignals,
      entityAssetItems: entityResolution.assetItems,
      entityOrganizationItems: entityResolution.organizationItems,
      relationships,
      sourceItem
    })
  };
}
