import type { CandidateReviewDetail, CandidateReviewQueueItem, CandidateReviewQueueResponse } from "@remi/domain";
import { ChevronLeft, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

import { ReviewDetail } from "../../components/review/review-detail";
import { Badge, statusTone } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { Segmented } from "../../components/ui/segmented";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { apiGet } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatCandidateValue, formatPercent, humanize } from "../../lib/format";

export const metadata: Metadata = { title: "Review" };

const STATUS_FILTERS = ["pending", "accepted", "rejected", "all"] as const;
const TYPE_FILTERS = ["all", "metric", "classification", "relationship"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type TypeFilter = (typeof TYPE_FILTERS)[number];

const TYPE_OF: Record<CandidateReviewQueueItem["candidateType"], TypeFilter> = {
  metric_fact_candidate: "metric",
  classification_candidate: "classification",
  relationship_assertion_candidate: "relationship"
};

function matchesStatus(item: CandidateReviewQueueItem, filter: StatusFilter): boolean {
  switch (filter) {
    case "pending":
      return item.reviewStatus === "pending_review";
    case "accepted":
      return item.reviewStatus === "accepted" || item.reviewStatus === "edited_and_accepted";
    case "rejected":
      return item.reviewStatus === "rejected";
    default:
      return true;
  }
}

/** "metric.landscaping_grounds" -> "Landscaping grounds"; "probable_asset_name_mention" -> "Asset name mention". */
function fieldLabel(fieldName: string): string {
  return humanize(fieldName.replace(/^metric\./, "").replace(/^probable_/, ""));
}

export default async function ReviewPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; type?: string; id?: string }>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const status = STATUS_FILTERS.find((value) => value === params.status) ?? "pending";
  const type = TYPE_FILTERS.find((value) => value === params.type) ?? "all";
  const queue = await apiGet<CandidateReviewQueueResponse>("/api/review/candidates");

  const header = (
    <PageHeader
      title="Candidate review"
      description="Every extracted value waits here with its citation. Accepting one makes it accepted truth; nothing is overwritten."
    />
  );
  if (!queue.ok) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="The review queue is unavailable" message={queue.error} />
      </div>
    );
  }

  const byStatus = queue.data.items.filter((item) => matchesStatus(item, status));
  const visible = type === "all" ? byStatus : byStatus.filter((item) => TYPE_OF[item.candidateType] === type);
  const selectedId = visible.find((item) => item.candidateId === params.id)?.candidateId ?? visible[0]?.candidateId;
  const detail = selectedId
    ? await apiGet<CandidateReviewDetail>(`/api/review/candidates/${encodeURIComponent(selectedId)}`)
    : null;

  const href = (next: { status?: string; type?: string; id?: string }): string => {
    const query = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextType = next.type ?? type;
    if (nextStatus !== "pending") query.set("status", nextStatus);
    if (nextType !== "all") query.set("type", nextType);
    if (next.id) query.set("id", next.id);
    const text = query.toString();
    return text ? `/review?${text}` : "/review";
  };
  const counts = queue.data.counts;

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          active={status}
          items={[
            { key: "pending", label: "Pending", count: counts.pendingReview, href: href({ status: "pending" }) },
            {
              key: "accepted",
              label: "Accepted",
              count: counts.accepted + counts.editedAndAccepted,
              href: href({ status: "accepted" })
            },
            { key: "rejected", label: "Rejected", count: counts.rejected, href: href({ status: "rejected" }) },
            { key: "all", label: "All", count: queue.data.items.length, href: href({ status: "all" }) }
          ]}
        />
        <Segmented
          active={type}
          items={TYPE_FILTERS.map((value) => ({
            key: value,
            label: value === "all" ? "Any type" : humanize(value),
            count:
              value === "all"
                ? byStatus.length
                : byStatus.filter((item) => TYPE_OF[item.candidateType] === value).length,
            href: href({ type: value })
          }))}
        />
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={status === "pending" ? "Nothing waiting for review" : "No candidates match these filters"}
            description="Candidates appear here as documents finish extraction."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
          <Card className={cn("overflow-hidden lg:sticky lg:top-6", params.id && "hidden lg:block")}>
            <p className="border-b border-border px-4 py-2 text-xs text-muted tabular-nums">
              {visible.length} candidate{visible.length === 1 ? "" : "s"}
            </p>
            <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
              {visible.map((item) => {
                const selected = item.candidateId === selectedId;
                return (
                  <li key={item.candidateId}>
                    <Link
                      href={href({ id: item.candidateId })}
                      scroll={false}
                      className={cn(
                        "block px-4 py-2.5 transition-colors",
                        selected ? "bg-accent-soft/60" : "hover:bg-surface"
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium tabular-nums text-fg">
                          {formatCandidateValue(item.candidateValue)}
                        </span>
                        <span className="shrink-0 text-xs text-faint tabular-nums">
                          {formatPercent(item.confidence)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span className="truncate">{fieldLabel(item.fieldName)}</span>
                        <span className="text-faint">·</span>
                        <span className="truncate text-faint" title={item.artifactFileName}>
                          {item.artifactFileName}
                        </span>
                        {status === "all" ? (
                          <Badge tone={statusTone(item.reviewStatus)} className="ml-auto">
                            {humanize(item.reviewStatus)}
                          </Badge>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <div className={cn("space-y-3", !params.id && "hidden lg:block")}>
            <Link
              href={href({})}
              scroll={false}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg lg:hidden"
            >
              <ChevronLeft className="size-4" />
              All candidates
            </Link>
            {detail?.ok ? (
              <ReviewDetail key={detail.data.candidate.id} detail={detail.data} />
            ) : detail ? (
              <ErrorState title="Could not load this candidate" message={detail.error} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
