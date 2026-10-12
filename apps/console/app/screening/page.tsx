import type { ConflictListResponse, DealScreeningWorkbench, IntakeQueueItem } from "@remi/domain";
import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

import { DocumentPicker } from "../../components/screening/document-picker";
import { RefreshButton } from "../../components/screening/refresh-button";
import { ScreeningWorkbench } from "../../components/screening/screening-workbench";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { apiGet } from "../../lib/api";

export const metadata: Metadata = { title: "Screening" };

export default async function ScreeningPage({
  searchParams
}: {
  searchParams: Promise<{ id?: string }>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const [intake, conflicts] = await Promise.all([
    apiGet<{ items: IntakeQueueItem[] }>("/api/intake"),
    apiGet<ConflictListResponse>("/api/conflicts")
  ]);

  const header = (
    <PageHeader
      title="Deal screening"
      description="How close one document is to a trusted screening output: what has been accepted, what is still open, and where to go next."
      actions={intake.ok && intake.data.items.length > 0 ? <RefreshButton /> : undefined}
    />
  );

  if (!intake.ok) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="Documents are unavailable" message={intake.error} />
      </div>
    );
  }

  const items = intake.data.items;
  if (items.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={Inbox}
            title="No documents to screen"
            description="Screening reads one ingested document at a time. Upload files on the Intake page, or seed the demo with pnpm seed."
            action={
              <Link
                href="/intake"
                className="inline-flex h-7 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg shadow-card hover:opacity-90"
              >
                Go to intake
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const selected =
    items.find((item) => item.id === params.id) ?? items.find((item) => item.status === "completed") ?? items[0];
  const workbench = await apiGet<DealScreeningWorkbench>(`/api/screening/${encodeURIComponent(selected.id)}`);

  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start">
        <DocumentPicker
          documents={items.map(({ id, fileName, contentType, status, updatedAt }) => ({
            id,
            fileName,
            contentType,
            status,
            updatedAt
          }))}
          selectedId={selected.id}
        />
        {workbench.ok ? (
          <ScreeningWorkbench workbench={workbench.data} conflicts={conflicts.ok ? conflicts.data.items : []} />
        ) : (
          <ErrorState title={`Screening is unavailable for ${selected.fileName}`} message={workbench.error} />
        )}
      </div>
    </div>
  );
}
