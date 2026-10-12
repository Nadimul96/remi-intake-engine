import type { EntityResolutionDetail } from "@remi/domain";
import { Bot, Check, ClipboardCheck, type LucideIcon, X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { formatDateTime, humanize } from "../../lib/format";
import { SYSTEM_EVENT_LABEL } from "./labels";

interface TimelineEntry {
  id: string;
  at: string;
  icon: LucideIcon;
  iconClass: string;
  title: ReactNode;
  meta: string;
  note: string | null;
}

function entriesOf(detail: EntityResolutionDetail): TimelineEntry[] {
  const decisions: TimelineEntry[] = detail.reconciliationHistory.map((entry) => {
    const accepted = entry.action === "accept";
    const target = entry.chosenEntityDisplayName;
    const aliases = entry.createdAliasValues.length > 0 ? ` · alias ${entry.createdAliasValues.join(", ")}` : "";
    return {
      id: entry.id,
      at: entry.createdAt,
      icon: accepted ? Check : X,
      iconClass: accepted ? "bg-success-soft text-success-text" : "bg-danger-soft text-danger-text",
      title: accepted ? (
        <>
          {entry.chosenEntityCreated ? "Created" : "Attached to"}{" "}
          <span className="font-semibold">{target ?? "entity"}</span>
        </>
      ) : (
        "Rejected the proposal"
      ),
      meta: `${entry.reviewerActorName}${aliases}`,
      note: entry.reviewNote
    };
  });

  const events: TimelineEntry[] = detail.systemEvents.map((event) => ({
    id: event.id,
    at: event.createdAt,
    icon: Bot,
    iconClass: "bg-info-soft text-info-text",
    title: SYSTEM_EVENT_LABEL[event.eventType],
    meta: event.summary,
    note: null
  }));

  const reviews: TimelineEntry[] = detail.reviewHistory.map((entry) => ({
    id: entry.id,
    at: entry.createdAt,
    icon: ClipboardCheck,
    iconClass: "bg-subtle text-muted",
    title: `Candidate ${humanize(entry.newReviewStatus).toLowerCase()} as truth`,
    meta: entry.reviewerActorName,
    note: entry.reviewNote
  }));

  return [...decisions, ...events, ...reviews].sort((a, b) => b.at.localeCompare(a.at));
}

export function EntityTimeline({ detail }: { detail: EntityResolutionDetail }): ReactElement | null {
  const entries = entriesOf(detail);
  if (entries.length === 0) {
    return null;
  }
  return (
    <ol className="space-y-3">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <li key={entry.id} className="flex gap-3">
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", entry.iconClass)}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{entry.title}</p>
              <p className="text-xs break-words text-muted">
                {entry.meta} · <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
              </p>
              {entry.note ? <p className="mt-1 text-xs text-fg">&ldquo;{entry.note}&rdquo;</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
