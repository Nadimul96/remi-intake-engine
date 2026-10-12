"use client";

import type { ConflictSide, ConflictSummary } from "@remi/domain";
import { Check, FileSearch, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useMemo, useState, useTransition } from "react";

import { postJson } from "../../lib/client-api";
import { cn } from "../../lib/cn";
import { formatDateTime, humanize } from "../../lib/format";
import { cellRefFromHint, ProvenancePanel, type ProvenanceTarget } from "../provenance/provenance-panel";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { KIND_DESCRIPTION, KIND_LABEL, SEVERITY_TONE, STATUS_TONE, VALUE_SWATCHES } from "./labels";

function swatchIndex(sides: ConflictSide[]): Map<string, number> {
  const distinct = [...new Set(sides.map((side) => side.display))];
  return new Map(distinct.map((display, index) => [display, index % VALUE_SWATCHES.length]));
}

function SideRow({
  side,
  swatch,
  chosen,
  resolved,
  selectable,
  onChoose,
  onTrace
}: {
  side: ConflictSide;
  swatch: string | null;
  chosen: boolean;
  resolved: boolean;
  selectable: boolean;
  onChoose: () => void;
  onTrace: () => void;
}): ReactElement {
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,9rem)_1fr_auto] sm:items-center",
        chosen && "bg-accent-soft/50"
      )}
    >
      <div className="row-span-2 flex items-center sm:row-span-1">
        {selectable ? (
          <input
            type="radio"
            name="trusted-side"
            checked={chosen}
            onChange={onChoose}
            aria-label={`Trust ${side.display} from ${side.fileName}`}
            className="size-4 accent-[var(--accent)]"
          />
        ) : (
          <span className={cn("block size-2.5 rounded-full", swatch ?? "bg-border-strong")} />
        )}
      </div>
      <div className="flex items-center gap-2">
        {selectable && swatch ? <span className={cn("block size-2 shrink-0 rounded-full", swatch)} /> : null}
        <span className="text-sm font-semibold tabular-nums text-fg">{side.display}</span>
        {resolved && chosen ? (
          <Badge tone="success">
            <Check className="size-3" />
            Trusted
          </Badge>
        ) : null}
      </div>
      <div className="col-start-2 min-w-0 sm:col-start-auto">
        <p className="truncate text-sm text-fg" title={side.fileName}>
          {side.fileName}
        </p>
        <p className="truncate text-xs text-muted">
          {humanize(side.label)}
          {side.locatorHint ? <span className="text-faint"> · {side.locatorHint}</span> : null}
        </p>
      </div>
      <div className="col-start-2 sm:col-start-auto">
        <Button size="sm" variant="ghost" onClick={onTrace} aria-label={`View the source of ${side.display}`}>
          <FileSearch className="size-3.5" />
          Source
        </Button>
      </div>
    </li>
  );
}

export function ConflictDetail({ conflict }: { conflict: ConflictSummary }): ReactElement {
  const router = useRouter();
  const [trace, setTrace] = useState<ProvenanceTarget | null>(null);
  const [chosen, setChosen] = useState<string | null>(conflict.resolvedCandidateId);
  const [note, setNote] = useState(conflict.resolutionNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const swatches = useMemo(() => swatchIndex(conflict.sides), [conflict.sides]);
  const comparable = conflict.kind === "value_mismatch" || conflict.kind === "version_conflict";
  const isOpen = conflict.status === "open";

  const decide = (action: "resolve" | "dismiss" | "reopen"): void => {
    setError(null);
    startTransition(async () => {
      try {
        await postJson(`/conflicts/${conflict.id}/decision`, {
          action,
          candidateId: action === "resolve" ? chosen : null,
          note: note.trim() || null
        });
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The decision could not be saved.");
      }
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={SEVERITY_TONE[conflict.severity]}>{humanize(conflict.severity)} severity</Badge>
          <Badge tone="accent">{KIND_LABEL[conflict.kind]}</Badge>
          <Badge tone={STATUS_TONE[conflict.status]}>{humanize(conflict.status)}</Badge>
          {conflict.period ? <Badge>{conflict.period}</Badge> : null}
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-balance text-fg">{conflict.title}</h2>
        <p className="text-sm leading-relaxed text-muted">{conflict.summary}</p>
        <p className="text-xs text-faint">
          {KIND_DESCRIPTION[conflict.kind]} First detected {formatDateTime(conflict.firstDetectedAt)}.
        </p>
      </div>

      <div className="flex items-center justify-between px-4 pt-4 pb-2 sm:px-5">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">
          {conflict.kind === "name_variants" ? "Names" : "Evidence"} · {conflict.sides.length}
        </h3>
        {comparable && isOpen ? <p className="text-xs text-faint">Pick the reading you trust</p> : null}
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {conflict.sides.map((side) => (
          <SideRow
            key={`${side.candidateId}-${side.display}`}
            side={side}
            swatch={comparable ? VALUE_SWATCHES[swatches.get(side.display) ?? 0] : null}
            chosen={chosen === side.candidateId}
            resolved={conflict.status === "resolved"}
            selectable={comparable && isOpen}
            onChoose={() => setChosen(side.candidateId)}
            onTrace={() =>
              setTrace({
                anchorIds: side.provenanceAnchorIds.slice(0, 1),
                label: `${side.display} in ${side.fileName}`,
                cellRef: cellRefFromHint(side.locatorHint),
                highlight: side.display.replace(/^\$/, "")
              })
            }
          />
        ))}
      </ul>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {isOpen ? (
          <>
            <label className="block">
              <span className="text-xs font-medium text-muted">Resolution note</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Why this reading is right, or why the difference is expected"
                className="mt-1 block w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => decide("resolve")} disabled={pending || (comparable && !chosen)}>
                <Check className="size-4" />
                {comparable ? "Resolve with selected" : "Mark resolved"}
              </Button>
              <Button variant="secondary" onClick={() => decide("dismiss")} disabled={pending}>
                <X className="size-4" />
                Dismiss
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {humanize(conflict.status)} {conflict.resolvedAt ? formatDateTime(conflict.resolvedAt) : ""}
              {conflict.resolutionNote ? <span className="block text-fg">“{conflict.resolutionNote}”</span> : null}
            </p>
            <Button variant="secondary" onClick={() => decide("reopen")} disabled={pending}>
              <RotateCcw className="size-4" />
              Reopen
            </Button>
          </div>
        )}
        {error ? <p className="text-sm text-danger-text">{error}</p> : null}
      </div>

      <ProvenancePanel target={trace} onClose={() => setTrace(null)} />
    </Card>
  );
}
