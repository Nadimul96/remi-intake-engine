import type {
  AcceptedTruthBrowserResponse,
  AcceptedTruthDetail,
  AcceptedTruthFilter,
  AcceptedTruthListItem,
  CandidateReviewQueueResponse
} from "@remi/domain";
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { CANDIDATE_TYPE_FOR, FILTER_LABEL, TRUTH_FILTERS } from "../../components/truth/labels";
import { TruthDetail } from "../../components/truth/truth-detail";
import { TruthEmpty } from "../../components/truth/truth-empty";
import { TruthList } from "../../components/truth/truth-list";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { Segmented } from "../../components/ui/segmented";
import { Stat } from "../../components/ui/stat";
import { ErrorState } from "../../components/ui/states";
import { apiGet } from "../../lib/api";

export const metadata: Metadata = { title: "Accepted truth" };

/** How many candidates of the filtered kind are still waiting for review, for a helpful empty state. */
async function pendingCandidates(filter: AcceptedTruthFilter): Promise<number | null> {
  const queue = await apiGet<CandidateReviewQueueResponse>("/api/review/candidates");
  if (!queue.ok) {
    return null;
  }
  return queue.data.items.filter(
    (item) =>
      item.reviewStatus === "pending_review" && (filter === "all" || item.candidateType === CANDIDATE_TYPE_FOR[filter])
  ).length;
}

function TruthStats({ items }: { items: AcceptedTruthListItem[] }): ReactElement {
  const documents = new Set(items.map((item) => item.artifactBlobId)).size;
  const current = items.filter((item) => item.sourceCandidateCurrentExtraction).length;
  const corrected = items.filter((item) => item.latestReviewAction === "edit_and_accept").length;
  const anchors = items.reduce((total, item) => total + item.provenanceAnchorCount, 0);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Accepted records" value={items.length} hint={`${anchors} anchors cited`} />
      <Stat label="Source documents" value={documents} hint="Files with accepted values" />
      <Stat
        label="Current lineage"
        value={`${current}/${items.length}`}
        hint={current === items.length ? "All sources current" : `${items.length - current} superseded`}
        tone={current === items.length ? "default" : "warning"}
      />
      <Stat label="Corrected on accept" value={corrected} hint="Edited by a reviewer" />
    </div>
  );
}

export default async function TruthPage({
  searchParams
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const filter = TRUTH_FILTERS.find((value) => value === params.type) ?? "all";
  const result = await apiGet<AcceptedTruthBrowserResponse>("/api/truth?type=all");

  const header = (
    <PageHeader
      title="Accepted truth"
      description="Values a reviewer has approved, each with the citation it was read from, who accepted it and whether the source has changed since."
    />
  );

  if (!result.ok) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="Accepted truth is unavailable" message={result.error} />
      </div>
    );
  }

  const { items, counts } = result.data;
  const visible = filter === "all" ? items : items.filter((item) => item.acceptedRecordType === filter);
  const selected = visible.find((item) => item.acceptedRecordId === params.id) ?? visible[0] ?? null;
  const [detail, pending] = await Promise.all([
    selected
      ? apiGet<AcceptedTruthDetail>(
          `/api/truth/${selected.acceptedRecordType}/${encodeURIComponent(selected.acceptedRecordId)}`
        )
      : null,
    visible.length === 0 ? pendingCandidates(filter) : null
  ]);

  const href = (next: { type?: AcceptedTruthFilter; id?: string }): string => {
    const query = new URLSearchParams();
    const nextType = next.type ?? filter;
    if (nextType !== "all") {
      query.set("type", nextType);
    }
    if (next.id) {
      query.set("id", next.id);
    }
    const text = query.toString();
    return text ? `/truth?${text}` : "/truth";
  };

  return (
    <div className="space-y-6">
      {header}

      {items.length > 0 ? <TruthStats items={items} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          active={filter}
          items={TRUTH_FILTERS.map((value) => ({
            key: value,
            href: href({ type: value }),
            label: FILTER_LABEL[value],
            count: counts[value]
          }))}
        />
        <p className="text-xs text-muted">Accepted records are append-only; nothing here is overwritten.</p>
      </div>

      {visible.length === 0 ? (
        <Card>
          <TruthEmpty filter={filter} pending={pending} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
          <Card className="overflow-hidden lg:sticky lg:top-6">
            <p className="border-b border-border px-4 py-2 text-xs text-muted tabular-nums">
              {visible.length} accepted record{visible.length === 1 ? "" : "s"}
            </p>
            <TruthList
              items={visible}
              selectedId={selected?.acceptedRecordId ?? null}
              showType={filter === "all" && new Set(items.map((item) => item.acceptedRecordType)).size > 1}
              hrefFor={(item) => href({ id: item.acceptedRecordId })}
            />
          </Card>
          {detail?.ok ? (
            <TruthDetail key={detail.data.acceptedRecord.id} detail={detail.data} />
          ) : detail ? (
            <ErrorState title="Could not load this record" message={detail.error} />
          ) : null}
        </div>
      )}
    </div>
  );
}
