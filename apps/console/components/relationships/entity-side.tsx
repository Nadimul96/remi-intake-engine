import type { CanonicalEntitySummary, RelationshipEntityMatchCandidate } from "@remi/domain";
import { Briefcase, Building2, Check } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatPercent } from "../../lib/format";
import { Badge } from "../ui/badge";
import { SIGNAL_LABEL } from "./labels";

export type EntityKind = "asset" | "organization";

interface EntityOption {
  id: string;
  displayName: string;
  signals: RelationshipEntityMatchCandidate[];
  aliases: string[];
}

/** Matching entities plus any signalled candidate the matching list does not already include, strongest first. */
function buildOptions(
  candidates: RelationshipEntityMatchCandidate[],
  matching: CanonicalEntitySummary[]
): EntityOption[] {
  const options = new Map<string, EntityOption>();
  for (const entity of matching) {
    options.set(entity.id, {
      id: entity.id,
      displayName: entity.displayName,
      signals: [],
      aliases: entity.aliases.map((alias) => alias.aliasValue)
    });
  }
  for (const candidate of candidates) {
    const option = options.get(candidate.entityId) ?? {
      id: candidate.entityId,
      displayName: candidate.entityDisplayName,
      signals: [],
      aliases: []
    };
    option.signals.push(candidate);
    options.set(candidate.entityId, option);
  }
  const strength = (option: EntityOption): number => Math.max(0, ...option.signals.map((signal) => signal.confidence));
  return [...options.values()].sort((a, b) => strength(b) - strength(a));
}

function OptionRow({
  option,
  kind,
  selectable,
  selected,
  linked,
  onSelect
}: {
  option: EntityOption;
  kind: EntityKind;
  selectable: boolean;
  selected: boolean;
  linked: boolean;
  onSelect: () => void;
}): ReactElement {
  const best = option.signals.reduce<RelationshipEntityMatchCandidate | null>(
    (top, signal) => (top === null || signal.confidence > top.confidence ? signal : top),
    null
  );
  const content = (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-fg">{option.displayName}</span>
        {linked ? (
          <Badge tone="success">
            <Check className="size-3" />
            Attached
          </Badge>
        ) : null}
        {option.signals.map((signal) => (
          <Badge key={signal.signalType} tone="accent">
            {SIGNAL_LABEL[signal.signalType]}
          </Badge>
        ))}
        {best ? (
          <span className="ml-auto text-xs text-faint tabular-nums">{formatPercent(best.confidence)}</span>
        ) : null}
      </span>
      {best ? (
        <span className="mt-1 block text-xs text-muted">
          {best.rationale}
          <span className="text-faint">
            {" "}
            · matched “{best.matchedName}” from {best.matchedFrom}
          </span>
        </span>
      ) : (
        <span className="mt-1 block text-xs text-faint">
          No direct signal; listed as a canonical {kind} with a similar name
          {option.aliases.length > 0 ? ` (aliases: ${option.aliases.slice(0, 3).join(", ")})` : ""}.
        </span>
      )}
    </>
  );

  if (!selectable) {
    return <div className={cn("px-3 py-2.5", linked && "bg-success-soft/40")}>{content}</div>;
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 px-3 py-2.5 transition-colors",
        selected ? "bg-accent-soft/50" : "hover:bg-surface"
      )}
    >
      <input
        type="radio"
        name={`relationship-${kind}`}
        checked={selected}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1">{content}</span>
    </label>
  );
}

export function EntitySide({
  kind,
  writtenName,
  candidates,
  matching,
  selectable,
  selectedId,
  linkedId,
  onSelect
}: {
  kind: EntityKind;
  writtenName: string | null;
  candidates: RelationshipEntityMatchCandidate[];
  matching: CanonicalEntitySummary[];
  selectable: boolean;
  selectedId: string;
  linkedId: string | null;
  onSelect: (entityId: string) => void;
}): ReactElement {
  const options = buildOptions(candidates, matching);
  const Icon = kind === "asset" ? Building2 : Briefcase;

  return (
    <section className="min-w-0 rounded-lg border border-border">
      <header className="flex items-start gap-2.5 border-b border-border px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface text-muted">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-faint uppercase">
            {kind === "asset" ? "Asset" : "Organization"}
          </p>
          <p className="truncate text-sm text-fg" title={writtenName ?? undefined}>
            {writtenName ? `“${writtenName}”` : "Not named in the source"}
          </p>
        </div>
        <span className="ml-auto shrink-0 text-xs text-faint tabular-nums">
          {options.length} match{options.length === 1 ? "" : "es"}
        </span>
      </header>
      {options.length > 0 ? (
        <div className="divide-y divide-border">
          {options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              kind={kind}
              selectable={selectable}
              selected={selectedId === option.id}
              linked={linkedId === option.id}
              onSelect={() => onSelect(option.id)}
            />
          ))}
        </div>
      ) : (
        <p className="px-3 py-4 text-xs leading-relaxed text-muted">
          No canonical {kind} matches this name yet. Create it or add an alias on{" "}
          <Link href="/entities" className="font-medium text-accent-text hover:underline">
            Entities
          </Link>
          , then come back to attach the relationship.
        </p>
      )}
    </section>
  );
}
