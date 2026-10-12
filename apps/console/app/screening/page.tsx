import type { DealScreeningWorkbench, IntakeQueueItem } from "@remi/domain";
import type { ReactElement } from "react";

import { ScreeningWorkbench } from "../../components/screening-workbench";
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

async function getInitialWorkbench(sourceItemId: string | null): Promise<DealScreeningWorkbench | null> {
  if (!sourceItemId) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/api/screening/${sourceItemId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as DealScreeningWorkbench;
}

export default async function ScreeningPage(): Promise<ReactElement> {
  const initialItems = await getInitialItems();
  const initialWorkbench = await getInitialWorkbench(initialItems[0]?.id ?? null);

  return <ScreeningWorkbench apiBaseUrl={apiBaseUrl} initialItems={initialItems} initialWorkbench={initialWorkbench} />;
}
