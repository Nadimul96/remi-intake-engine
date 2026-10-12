import type { IntakeDetail as IntakeDetailData, IntakeQueueItem } from "@remi/domain";
import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { IntakeDetail } from "../../components/intake/intake-detail";
import { IntakeQueue } from "../../components/intake/intake-queue";
import {
  isInFlight,
  matchesFilter,
  STATUS_FILTER_LABEL,
  STATUS_FILTERS,
  type StatusFilter
} from "../../components/intake/labels";
import { LiveRefresh } from "../../components/intake/live-refresh";
import { UploadPanel } from "../../components/intake/upload-panel";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { Segmented } from "../../components/ui/segmented";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { apiGet } from "../../lib/api";

export const metadata: Metadata = { title: "Intake" };

export default async function IntakePage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; id?: string }>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const status: StatusFilter = STATUS_FILTERS.find((value) => value === params.status) ?? "all";
  const queue = await apiGet<{ items: IntakeQueueItem[] }>("/api/intake");
  const inFlight = queue.ok ? queue.data.items.filter(isInFlight).length : 0;

  const header = (
    <PageHeader
      title="Intake"
      description="Every file is stored immutably by hash, inspected, normalized, anchored line by line, and mined for evidence-backed candidates."
      actions={queue.ok ? <LiveRefresh inFlight={inFlight} /> : null}
    />
  );

  if (!queue.ok) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="The intake queue is unavailable" message={queue.error} />
      </div>
    );
  }

  const items = queue.data.items;
  const visible = items.filter((item) => matchesFilter(item, status));
  const selectedId = visible.find((item) => item.id === params.id)?.id ?? visible[0]?.id ?? null;
  const detail = selectedId ? await apiGet<IntakeDetailData>(`/api/intake/${encodeURIComponent(selectedId)}`) : null;

  const href = (next: { status?: string; id?: string }): string => {
    const query = new URLSearchParams();
    const nextStatus = next.status ?? status;
    if (nextStatus !== "all") query.set("status", nextStatus);
    if (next.id) query.set("id", next.id);
    const text = query.toString();
    return text ? `/intake?${text}` : "/intake";
  };

  return (
    <div className="space-y-6">
      {header}
      <UploadPanel />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="No files ingested yet"
            description="Drop a PDF, email, workbook or text file above, or seed the demo with pnpm seed, to watch it move through the pipeline."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
          <Card className="overflow-hidden lg:sticky lg:top-6">
            <div className="border-b border-border p-2">
              <Segmented
                active={status}
                items={STATUS_FILTERS.map((value) => ({
                  key: value,
                  label: STATUS_FILTER_LABEL[value],
                  count: items.filter((item) => matchesFilter(item, value)).length,
                  href: href({ status: value })
                }))}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={`No ${STATUS_FILTER_LABEL[status].toLowerCase()} files`}
                description="Switch filters to see the rest of the queue."
              />
            ) : (
              <IntakeQueue items={visible} selectedId={selectedId} hrefFor={(id) => href({ id })} />
            )}
          </Card>
          {detail?.ok ? (
            <IntakeDetail key={detail.data.id} detail={detail.data} />
          ) : detail ? (
            <ErrorState title="Could not load this file" message={detail.error} />
          ) : null}
        </div>
      )}
    </div>
  );
}
