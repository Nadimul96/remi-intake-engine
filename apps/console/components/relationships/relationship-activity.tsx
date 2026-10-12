import type {
  AssetOrganizationRelationshipDetail,
  RelationshipResolutionProposalState,
  ReviewHistoryEntry
} from "@remi/domain";
import { Bot, Check, type LucideIcon, ScrollText, X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { formatDateTime } from "../../lib/format";
import { Badge, statusTone, type Tone } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { EVENT_LABEL, STATE_LABEL } from "./labels";

interface ActivityEntry {
  id: string;
  at: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  source: string;
  body: ReactNode;
}

const REVIEW_VERB: Record<ReviewHistoryEntry["action"], string> = {
  accept: "accepted",
  reject: "rejected",
  edit_and_accept: "edited and accepted"
};

const DOT_TONE: Record<Tone, string> = {
  neutral: "bg-subtle text-muted",
  accent: "bg-accent-soft text-accent-text",
  danger: "bg-danger-soft text-danger-text",
  warning: "bg-warning-soft text-warning-text",
  success: "bg-success-soft text-success-text",
  info: "bg-info-soft text-info-text"
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function StateChange({
  from,
  to
}: {
  from: RelationshipResolutionProposalState | null;
  to: RelationshipResolutionProposalState | null;
}): ReactElement | null {
  if (!from || !to || from === to) {
    return null;
  }
  return (
    <span className="text-xs text-faint">
      {STATE_LABEL[from]} → {STATE_LABEL[to]}
    </span>
  );
}

function Pair({ asset, organization }: { asset: string | null; organization: string | null }): ReactElement | null {
  if (!asset && !organization) {
    return null;
  }
  return (
    <span className="block text-xs text-muted">
      {asset ?? "No asset"} ↔ {organization ?? "No organization"}
    </span>
  );
}

function Note({ text }: { text: string | null }): ReactElement | null {
  return text ? <span className="mt-1 block text-sm text-fg">“{text}”</span> : null;
}

function buildEntries(detail: AssetOrganizationRelationshipDetail): ActivityEntry[] {
  const decisions = detail.reconciliationHistory.map<ActivityEntry>((entry) => ({
    id: `decision-${entry.id}`,
    at: entry.createdAt,
    icon: entry.action === "accept" ? Check : X,
    tone: entry.action === "accept" ? "success" : "danger",
    title: entry.action === "accept" ? "Relationship attached" : "Proposal rejected",
    source: entry.reviewerActorName,
    body: (
      <>
        <StateChange from={entry.previousProposalState} to={entry.newProposalState} />
        <Pair
          asset={entry.chosenCanonicalAssetDisplayName}
          organization={entry.chosenCanonicalOrganizationDisplayName}
        />
        <Note text={entry.reviewNote} />
      </>
    )
  }));
  const events = detail.systemEvents.map<ActivityEntry>((event) => ({
    id: `event-${event.id}`,
    at: event.createdAt,
    icon: Bot,
    tone: event.eventType === "stale_link_removed" ? "warning" : "info",
    title: EVENT_LABEL[event.eventType],
    source: "System sync",
    body: (
      <>
        <span className="block text-sm text-muted">{event.summary}</span>
        <StateChange from={event.previousProposalState} to={event.newProposalState} />
        <Pair asset={event.canonicalAssetDisplayName} organization={event.canonicalOrganizationDisplayName} />
      </>
    )
  }));
  const reviews = detail.reviewHistory.map<ActivityEntry>((entry) => ({
    id: `review-${entry.id}`,
    at: entry.createdAt,
    icon: ScrollText,
    tone: statusTone(entry.newReviewStatus),
    title: `Candidate ${REVIEW_VERB[entry.action]} on Review`,
    source: entry.reviewerActorName,
    body: <Note text={entry.reviewNote} />
  }));
  return [...decisions, ...events, ...reviews].sort((a, b) => b.at.localeCompare(a.at));
}

/** One newest-first timeline: operator decisions, system sync events and the original candidate review. */
export function RelationshipActivity({ detail }: { detail: AssetOrganizationRelationshipDetail }): ReactElement {
  const entries = buildEntries(detail);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Activity"
        description="Operator decisions, system sync events and the candidate review that created this record."
        actions={
          <span className="flex gap-1">
            <Badge>{plural(detail.reconciliationHistory.length, "decision")}</Badge>
            <Badge>{plural(detail.systemEvents.length, "event")}</Badge>
          </span>
        }
      />
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted sm:px-5">
          No decisions yet. Attaching or rejecting this proposal, and any later sync changes, will be recorded here.
        </p>
      ) : (
        <ol className="px-4 py-2 sm:px-5">
          {entries.map((entry, index) => (
            <li key={entry.id} className="relative flex gap-3 py-3">
              {index < entries.length - 1 ? (
                <span className="absolute top-10 bottom-0 left-3.5 w-px bg-border" aria-hidden="true" />
              ) : null}
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", DOT_TONE[entry.tone])}>
                <entry.icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-fg">{entry.title}</span>
                  <span className="text-xs text-faint">
                    {entry.source} · {formatDateTime(entry.at)}
                  </span>
                </p>
                <div className="mt-0.5 space-y-0.5">{entry.body}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
