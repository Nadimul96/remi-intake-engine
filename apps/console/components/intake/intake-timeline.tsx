import type { TimelineEvent } from "@remi/domain";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatDateTime } from "../../lib/format";

function eventTone(type: TimelineEvent["eventType"]): string {
  if (type.endsWith("_failed")) return "bg-danger";
  if (type.endsWith("_skipped")) return "bg-warning";
  if (type === "ingestion_completed") return "bg-success";
  if (type.endsWith("_completed") || type === "artifact_promoted") return "bg-success/70";
  return "bg-border-strong";
}

function offset(from: string, to: string): string {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60_000) return `+${(ms / 1000).toFixed(1)}s`;
  return `+${Math.round(ms / 60_000)}m`;
}

/** Every pipeline event in order, timed relative to registration so slow stages stand out. */
export function IntakeTimeline({ events }: { events: TimelineEvent[] }): ReactElement {
  const start = events[0]?.createdAt;
  return (
    <div className="relative">
      <span aria-hidden="true" className="absolute top-2 bottom-2 left-[3px] w-px bg-border" />
      <ol className="space-y-0.5">
        {events.map((event, index) => (
          <li key={event.id} className="relative flex items-baseline gap-3 py-1 pl-5">
            <span
              className={cn(
                "absolute top-[0.6rem] left-0 size-[7px] rounded-full ring-2 ring-raised",
                eventTone(event.eventType)
              )}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn("block text-sm", event.eventType.endsWith("_failed") ? "text-danger-text" : "text-fg")}
              >
                {event.message}
              </span>
              <code className="block truncate font-mono text-[11px] text-faint">{event.eventType}</code>
            </span>
            <span className="shrink-0 text-xs text-muted tabular-nums" title={event.createdAt}>
              {index === 0 || !start ? formatDateTime(event.createdAt) : offset(start, event.createdAt)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
