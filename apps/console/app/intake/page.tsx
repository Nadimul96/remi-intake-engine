import type { IntakeDetail, IntakeQueueItem } from "@remi/domain";
import type { ReactElement } from "react";

import { IntakeConsole } from "../../components/intake-console";
import { getApiBaseUrl } from "../../lib/config";

const apiBaseUrl = getApiBaseUrl();

async function getInitialItems(): Promise<IntakeQueueItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/intake`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    items: IntakeQueueItem[];
  };

  return payload.items;
}

async function getInitialDetail(sourceItemId: string | null): Promise<IntakeDetail | null> {
  if (!sourceItemId) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/api/intake/${sourceItemId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as IntakeDetail;
}

export default async function IntakePage(): Promise<ReactElement> {
  const initialItems = await getInitialItems();
  const initialDetail = await getInitialDetail(initialItems[0]?.id ?? null);

  return <IntakeConsole apiBaseUrl={apiBaseUrl} initialDetail={initialDetail} initialItems={initialItems} />;
}
