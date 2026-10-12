import type { AcceptedTruthBrowserResponse, AcceptedTruthDetail } from "@remi/domain";
import type { ReactElement } from "react";

import { TruthBrowser } from "../../components/truth-browser";
import { getApiBaseUrl } from "../../lib/config";

const apiBaseUrl = getApiBaseUrl();

async function getInitialBrowser(): Promise<AcceptedTruthBrowserResponse> {
  const response = await fetch(`${apiBaseUrl}/api/truth?type=all`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      counts: {
        all: 0,
        fact: 0,
        relationship: 0,
        classification: 0
      },
      items: []
    };
  }

  return (await response.json()) as AcceptedTruthBrowserResponse;
}

async function getInitialDetail(
  item: AcceptedTruthBrowserResponse["items"][number] | null
): Promise<AcceptedTruthDetail | null> {
  if (!item) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/api/truth/${item.acceptedRecordType}/${item.acceptedRecordId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AcceptedTruthDetail;
}

export default async function TruthPage(): Promise<ReactElement> {
  const initialBrowser = await getInitialBrowser();
  const initialDetail = await getInitialDetail(initialBrowser.items[0] ?? null);

  return <TruthBrowser apiBaseUrl={apiBaseUrl} initialBrowser={initialBrowser} initialDetail={initialDetail} />;
}
