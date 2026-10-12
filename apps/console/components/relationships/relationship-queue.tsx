import type { AssetOrganizationRelationshipQueueItem } from "@remi/domain";
import { ArrowLeftRight, Link2 } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatPercent } from "../../lib/format";
import { Badge } from "../ui/badge";
import {
  organizationLabel,
  READINESS_LABEL,
  READINESS_TONE,
  readRelationshipValue,
  STATE_LABEL,
  STATE_TONE,
  TYPE_LABEL
} from "./labels";

function QueueRow({
  item,
  selected,
  href
}: {
  item: AssetOrganizationRelationshipQueueItem;
  selected: boolean;
  href: string;
}): ReactElement {
  const { proposal } = item;
  const value = readRelationshipValue(item.acceptedValue);
  const showReadiness = proposal.proposalState === "pending_review";

  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "block px-4 py-3 transition-colors",
        selected ? "bg-accent-soft/60" : "hover:bg-surface",
        !proposal.currentProposal && "opacity-70"
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
        <span className="truncate" title={value.assetName ?? undefined}>
          {value.assetName ?? proposal.assetEntityDisplayName ?? "Unnamed asset"}
        </span>
        <ArrowLeftRight className="size-3.5 shrink-0 text-faint" aria-label="related to" />
        <span className="truncate" title={organizationLabel(value)}>
          {organizationLabel(value)}
        </span>
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={selected ? "accent" : "neutral"}>{TYPE_LABEL[proposal.relationshipType]}</Badge>
        <Badge tone={STATE_TONE[proposal.proposalState]}>{STATE_LABEL[proposal.proposalState]}</Badge>
        {showReadiness ? (
          <Badge tone={READINESS_TONE[proposal.resolutionReadiness]}>
            {READINESS_LABEL[proposal.resolutionReadiness]}
          </Badge>
        ) : null}
        {item.currentRelationshipLink ? (
          <Link2 className="size-3.5 text-success-text" aria-label="Attached to canonical entities" />
        ) : null}
      </span>
      <span className="mt-1 flex items-center gap-2 text-xs text-faint">
        <span className="truncate" title={item.artifactFileName}>
          {item.artifactFileName}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">{formatPercent(proposal.confidence)}</span>
      </span>
    </Link>
  );
}

export function RelationshipQueue({
  items,
  selectedId,
  hrefFor
}: {
  items: AssetOrganizationRelationshipQueueItem[];
  selectedId: string | null;
  hrefFor: (id: string) => string;
}): ReactElement {
  return (
    <>
      <p className="border-b border-border px-4 py-2 text-xs text-muted tabular-nums">
        {items.length} proposal{items.length === 1 ? "" : "s"}
      </p>
      <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto lg:max-h-[calc(100dvh-16rem)]">
        {items.map((item) => (
          <li key={item.proposal.id}>
            <QueueRow item={item} selected={item.proposal.id === selectedId} href={hrefFor(item.proposal.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}
