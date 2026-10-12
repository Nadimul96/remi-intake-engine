import type { CandidateReviewDetail, CandidateReviewQueueResponse } from "@remi/domain";
import type { ReactElement } from "react";

import { ReviewConsole } from "../../components/review-console";
import { getApiBaseUrl } from "../../lib/config";

const apiBaseUrl = getApiBaseUrl();

async function getInitialQueue(): Promise<CandidateReviewQueueResponse> {
  const response = await fetch(`${apiBaseUrl}/api/review/candidates`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      counts: {
        pendingReview: 0,
        accepted: 0,
        rejected: 0,
        editedAndAccepted: 0
      },
      items: []
    };
  }

  return (await response.json()) as CandidateReviewQueueResponse;
}

async function getInitialDetail(candidateId: string | null): Promise<CandidateReviewDetail | null> {
  if (!candidateId) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/api/review/candidates/${candidateId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as CandidateReviewDetail;
}

export default async function ReviewPage(): Promise<ReactElement> {
  const initialQueue = await getInitialQueue();
  const initialDetail = await getInitialDetail(initialQueue.items[0]?.candidateId ?? null);

  return <ReviewConsole apiBaseUrl={apiBaseUrl} initialDetail={initialDetail} initialQueue={initialQueue} />;
}
