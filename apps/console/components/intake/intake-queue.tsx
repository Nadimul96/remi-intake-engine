import type { IntakeQueueItem } from "@remi/domain";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatBytes, formatRelative, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";
import { isInFlight, PARSER_LABEL, parserIcon, STAGE_LABEL } from "./labels";

const TIER_DOT: Record<string, string> = {
  supported: "bg-success",
  best_effort: "bg-warning",
  deferred: "bg-warning",
  unsupported: "bg-danger"
};

function QueueRow({ item, selected, href }: { item: IntakeQueueItem; selected: boolean; href: string }): ReactElement {
  const Icon = parserIcon(item.parserTarget);
  const moving = isInFlight(item);

  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors",
        selected ? "bg-accent-soft/60" : "hover:bg-surface"
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border",
          selected ? "bg-raised text-accent-text" : "bg-surface text-muted"
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium text-fg" title={item.fileName}>
            {item.fileName}
          </span>
          <Badge tone={statusTone(item.status)} className="shrink-0">
            {humanize(item.status)}
          </Badge>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className={cn(moving && "font-medium text-info-text")}>{STAGE_LABEL[item.ingestionStage]}</span>
          <span className="text-faint">·</span>
          <span className="inline-flex items-center gap-1.5">
            {item.supportTier ? (
              <span
                className={cn("size-1.5 rounded-full", TIER_DOT[item.supportTier] ?? "bg-border-strong")}
                title={humanize(item.supportTier)}
              />
            ) : null}
            {item.parserTarget ? PARSER_LABEL[item.parserTarget] : "Pending"}
            {item.supportTier && item.supportTier !== "supported" ? (
              <span className="text-faint">({humanize(item.supportTier).toLowerCase()})</span>
            ) : null}
          </span>
          <span className="text-faint">·</span>
          <span className="tabular-nums">{formatBytes(item.sizeBytes)}</span>
          <span className="ml-auto text-faint tabular-nums" title={item.updatedAt}>
            {formatRelative(item.updatedAt)}
          </span>
        </span>
      </span>
    </Link>
  );
}

export function IntakeQueue({
  items,
  selectedId,
  hrefFor
}: {
  items: IntakeQueueItem[];
  selectedId: string | null;
  hrefFor: (id: string) => string;
}): ReactElement {
  return (
    <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto lg:max-h-[calc(100dvh-16rem)]">
      {items.map((item) => (
        <li key={item.id}>
          <QueueRow item={item} selected={item.id === selectedId} href={hrefFor(item.id)} />
        </li>
      ))}
    </ul>
  );
}
