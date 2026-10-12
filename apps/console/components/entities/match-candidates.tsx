import type { CanonicalEntitySummary, EntityResolutionMatchCandidate } from "@remi/domain";
import { Sparkles } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatPercent } from "../../lib/format";
import { Badge } from "../ui/badge";
import { SIGNAL_LABEL, SIGNAL_TONE } from "./labels";

/** Five pips instead of a width-styled bar, so no inline style is needed. */
export function ConfidenceBar({ value }: { value: number }): ReactElement {
  const filled = Math.round(value * 5);
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((pip) => (
          <span key={pip} className={cn("h-1.5 w-2.5 rounded-full", pip < filled ? "bg-accent" : "bg-subtle")} />
        ))}
      </span>
      <span className="text-xs text-muted tabular-nums">{formatPercent(value)}</span>
    </span>
  );
}

function CandidateRow({
  candidate,
  entity,
  chosen
}: {
  candidate: EntityResolutionMatchCandidate;
  entity: CanonicalEntitySummary | undefined;
  chosen: boolean;
}): ReactElement {
  return (
    <li className={cn("space-y-1.5 px-4 py-3 sm:px-5", chosen && "bg-accent-soft/50")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-fg">{candidate.entityDisplayName}</span>
        <Badge tone={SIGNAL_TONE[candidate.signalType]}>{SIGNAL_LABEL[candidate.signalType]}</Badge>
        {chosen ? <Badge tone="accent">Suggested</Badge> : null}
        <span className="ml-auto">
          <ConfidenceBar value={candidate.confidence} />
        </span>
      </div>
      <p className="text-sm text-muted">{candidate.rationale}</p>
      <p className="text-xs text-faint">
        Matched <span className="font-medium text-fg">{candidate.matchedName}</span> from {candidate.matchedFrom}
        {candidate.aliasValue ? ` via alias "${candidate.aliasValue}"` : ""}
      </p>
      {entity && entity.aliases.length > 0 ? (
        <ul className="flex flex-wrap gap-1 pt-0.5">
          {entity.aliases.map((alias) => (
            <li
              key={alias.id}
              className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-muted"
            >
              {alias.aliasValue}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function MatchCandidates({
  candidates,
  entities,
  suggestedId
}: {
  candidates: EntityResolutionMatchCandidate[];
  entities: CanonicalEntitySummary[];
  suggestedId: string | null;
}): ReactElement {
  if (candidates.length === 0) {
    return (
      <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-faint" />
        <p className="text-sm text-muted">
          No existing entity matches this name. Accepting creates a new canonical entity, or attach it to one you know
          is the same property.
        </p>
      </div>
    );
  }
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  return (
    <ul className="divide-y divide-border">
      {sorted.map((candidate) => (
        <CandidateRow
          key={`${candidate.entityId}-${candidate.signalType}-${candidate.aliasId ?? "name"}`}
          candidate={candidate}
          entity={byId.get(candidate.entityId)}
          chosen={candidate.entityId === suggestedId}
        />
      ))}
    </ul>
  );
}
