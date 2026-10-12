import type { AcceptedTruthListItem } from "@remi/domain";
import { Link2 } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatCandidateValue, formatRelative } from "../../lib/format";
import { Badge } from "../ui/badge";
import { fieldLabel, RECORD_TYPE_LABEL } from "./labels";

export function TruthList({
  items,
  selectedId,
  showType,
  hrefFor
}: {
  items: AcceptedTruthListItem[];
  selectedId: string | null;
  showType: boolean;
  hrefFor: (item: AcceptedTruthListItem) => string;
}): ReactElement {
  return (
    <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
      {items.map((item) => {
        const selected = item.acceptedRecordId === selectedId;
        return (
          <li key={item.acceptedRecordId}>
            <Link
              href={hrefFor(item)}
              scroll={false}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "block border-l-2 px-4 py-2.5 transition-colors",
                selected ? "border-accent bg-accent-soft/60" : "border-transparent hover:bg-surface"
              )}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-fg">{formatCandidateValue(item.acceptedValue)}</span>
                <span className="shrink-0 text-xs text-faint tabular-nums">{formatRelative(item.latestReviewAt)}</span>
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
                <span className="shrink-0">{fieldLabel(item.fieldName)}</span>
                <span className="text-faint">·</span>
                <span className="truncate text-faint" title={item.artifactFileName}>
                  {item.artifactFileName}
                </span>
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {showType ? <Badge>{RECORD_TYPE_LABEL[item.acceptedRecordType]}</Badge> : null}
                {item.latestReviewAction === "edit_and_accept" ? <Badge tone="info">Corrected</Badge> : null}
                {item.sourceCandidateCurrentExtraction ? null : <Badge tone="warning">Superseded source</Badge>}
                <span className="inline-flex items-center gap-1 text-[11px] text-faint tabular-nums">
                  <Link2 className="size-3" />
                  {item.provenanceAnchorCount} anchor{item.provenanceAnchorCount === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
