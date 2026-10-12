import type { EntityResolutionDetail, EntityResolutionQueueResponse } from "@remi/domain";
import type { ReactElement } from "react";

import { EntityReconciliationConsole } from "../../components/entity-reconciliation-console";
import { getApiBaseUrl } from "../../lib/config";

const apiBaseUrl = getApiBaseUrl();

async function getInitialQueue(): Promise<EntityResolutionQueueResponse> {
  const response = await fetch(`${apiBaseUrl}/api/entities/reconciliation`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      counts: {
        pendingReview: 0,
        accepted: 0,
        rejected: 0,
        superseded: 0,
        attachedAcceptedTruths: 0,
        unattachedAcceptedTruths: 0,
        unsupportedAcceptedTruths: 0,
        canonicalEntities: 0
      },
      items: []
    };
  }

  return (await response.json()) as EntityResolutionQueueResponse;
}

async function getInitialDetail(proposalId: string | null): Promise<EntityResolutionDetail | null> {
  if (!proposalId) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/api/entities/reconciliation/${proposalId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as EntityResolutionDetail;
}

export default async function EntityResolutionPage(): Promise<ReactElement> {
  const initialQueue = await getInitialQueue();
  const initialDetail = await getInitialDetail(initialQueue.items[0]?.proposal.id ?? null);

  return <EntityReconciliationConsole apiBaseUrl={apiBaseUrl} initialDetail={initialDetail} initialQueue={initialQueue} />;
}
