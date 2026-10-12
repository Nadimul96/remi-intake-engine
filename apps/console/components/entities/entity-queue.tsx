import type { EntityResolutionQueueItem } from "@remi/domain";
import { FileText, Link2 } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatPercent } from "../../lib/format";
import { Badge } from "../ui/badge";
import { CATEGORY_LABEL, CATEGORY_TONE, effectiveState, STATE_LABEL, STATE_TONE } from "./labels";

interface QueueGroup {
  key: string;
  name: string;
  items: EntityResolutionQueueItem[];
}

/** Mentions of the same observed name sit together so a whole name can be reconciled in one pass. */
function groupByName(items: EntityResolutionQueueItem[]): QueueGroup[] {
  const groups = new Map<string, QueueGroup>();
  for (const item of items) {
    const key = item.proposal.normalizedDisplayName;
    const group = groups.get(key) ?? { key, name: item.proposal.proposedDisplayName, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function QueueRow({
  item,
  selected,
  showState,
  href
}: {
  item: EntityResolutionQueueItem;
  selected: boolean;
  showState: boolean;
  href: string;
}): ReactElement {
  const { proposal } = item;
  const linkedTo = item.currentEntityLink?.canonicalEntityDisplayName ?? null;
  const state = effectiveState(proposal);
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "block border-l-2 py-2.5 pr-4 pl-[14px] transition-colors",
          selected ? "border-accent bg-accent-soft/60" : "border-transparent hover:bg-surface"
        )}
      >
        <span className="flex items-center gap-2">
          <FileText className="size-3.5 shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate text-sm text-fg" title={item.artifactFileName}>
            {item.artifactFileName}
          </span>
          <span className="shrink-0 text-xs text-faint tabular-nums">{formatPercent(proposal.confidence)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 pl-5.5">
          <Badge tone={CATEGORY_TONE[proposal.matchCategory]}>{CATEGORY_LABEL[proposal.matchCategory]}</Badge>
          {showState ? <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge> : null}
          {linkedTo ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-xs text-success-text">
              <Link2 className="size-3 shrink-0" />
              <span className="truncate">{linkedTo}</span>
            </span>
          ) : proposal.targetEntityDisplayName ? (
            <span className="truncate text-xs text-muted">to {proposal.targetEntityDisplayName}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function EntityQueue({
  items,
  selectedId,
  showState,
  hrefFor
}: {
  items: EntityResolutionQueueItem[];
  selectedId: string | null;
  showState: boolean;
  hrefFor: (id: string) => string;
}): ReactElement {
  const groups = groupByName(items);
  return (
    <div>
      <p className="border-b border-border px-4 py-2 text-xs text-muted tabular-nums">
        {items.length} mention{items.length === 1 ? "" : "s"} · {groups.length} distinct name
        {groups.length === 1 ? "" : "s"}
      </p>
      <div className="max-h-[32rem] overflow-y-auto lg:max-h-[calc(100dvh-12rem)]">
        {groups.map((group) => (
          <section key={group.key} className="border-b border-border last:border-b-0">
            <h3 className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 py-1.5 backdrop-blur">
              <span className="truncate text-xs font-semibold text-fg">{group.name}</span>
              <span className="shrink-0 text-[11px] text-faint tabular-nums">{group.items.length}</span>
            </h3>
            <ul className="divide-y divide-border">
              {group.items.map((item) => (
                <QueueRow
                  key={item.proposal.id}
                  item={item}
                  selected={item.proposal.id === selectedId}
                  showState={showState}
                  href={hrefFor(item.proposal.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
