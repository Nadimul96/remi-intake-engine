import type { ReviewHistoryEntry } from "@remi/domain";
import { ArrowRight } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatCandidateValue, formatDateTime, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";

const DOT: Record<string, string> = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info-text",
  neutral: "bg-border-strong",
  accent: "bg-accent"
};

export function TruthHistory({ entries }: { entries: ReviewHistoryEntry[] }): ReactElement {
  return (
    <section className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
      <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Review history · {entries.length}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No review events were recorded for the source candidate.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-border">
          {entries.map((entry) => (
            <li key={entry.id} className="relative pl-5">
              <span
                className={cn(
                  "absolute top-1.5 left-0 size-[7px] rounded-full ring-2 ring-raised",
                  DOT[statusTone(entry.newReviewStatus)]
                )}
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium text-fg">{humanize(entry.action)}</span>
                <span className="inline-flex items-center gap-1">
                  <Badge>{humanize(entry.previousReviewStatus)}</Badge>
                  <ArrowRight className="size-3 text-faint" />
                  <Badge tone={statusTone(entry.newReviewStatus)}>{humanize(entry.newReviewStatus)}</Badge>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {entry.reviewerActorName} · <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              </p>
              {entry.editedValue !== null && entry.editedValue !== undefined ? (
                <p className="mt-1 text-xs text-muted">
                  Corrected to <span className="font-medium text-fg">{formatCandidateValue(entry.editedValue)}</span>
                </p>
              ) : null}
              {entry.reviewNote ? <p className="mt-1 text-sm text-fg">“{entry.reviewNote}”</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
