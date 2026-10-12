import type {
  AssetOrganizationRelationshipDetail,
  AssetOrganizationRelationshipQueueResponse
} from "@remi/domain";
import type { ReactElement } from "react";

import { RelationshipConsole } from "../../components/relationship-console";
import { getApiBaseUrl } from "../../lib/config";

const apiBaseUrl = getApiBaseUrl();

async function getInitialQueue(): Promise<AssetOrganizationRelationshipQueueResponse> {
  const response = await fetch(`${apiBaseUrl}/api/relationships/reconciliation`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      counts: {
        pendingReview: 0,
        accepted: 0,
        rejected: 0,
        superseded: 0,
        attachedAcceptedRelationships: 0,
        unattachedAcceptedRelationships: 0,
        unsupportedAcceptedRelationships: 0
      },
      items: []
    };
  }

  return (await response.json()) as AssetOrganizationRelationshipQueueResponse;
}

async function getInitialDetail(proposalId: string | null): Promise<AssetOrganizationRelationshipDetail | null> {
  if (!proposalId) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/api/relationships/reconciliation/${proposalId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AssetOrganizationRelationshipDetail;
}

export default async function RelationshipsPage(): Promise<ReactElement> {
  const initialQueue = await getInitialQueue();
  const initialDetail = await getInitialDetail(initialQueue.items[0]?.proposal.id ?? null);

  return <RelationshipConsole apiBaseUrl={apiBaseUrl} initialDetail={initialDetail} initialQueue={initialQueue} />;
}
