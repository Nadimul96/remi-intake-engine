import type { ProvenanceAnchorsSummary } from "@remi/domain";
import type { ReactElement } from "react";

import { kindLabel } from "./labels";

/** Anchor counts by kind, with a bar per kind so the shape of the citation surface reads at a glance. */
export function AnchorSummary({ anchors }: { anchors: ProvenanceAnchorsSummary }): ReactElement {
  if (anchors.totalCount === 0) {
    return <p className="text-sm text-muted">No provenance anchors are recorded for this file yet.</p>;
  }
  const groups = [...anchors.groups].sort((a, b) => b.count - a.count);
  const max = Math.max(...groups.map((group) => group.count), 1);

  return (
    <ul className="space-y-2">
      {groups.map((group) => (
        <li key={group.anchorKind} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-sm text-fg">{kindLabel(group.anchorKind)}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-subtle">
            <progress
              value={group.count}
              max={max}
              aria-label={`${group.count} ${kindLabel(group.anchorKind)} anchors`}
              className="block h-full w-full appearance-none [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent"
            />
          </span>
          <span className="w-10 text-right text-sm text-muted tabular-nums">{group.count}</span>
        </li>
      ))}
    </ul>
  );
}
