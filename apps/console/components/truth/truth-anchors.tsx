"use client";

import type { AcceptedRecordSummary, ProvenanceAnchorSummary } from "@remi/domain";
import { FileSearch, FileSpreadsheet, FileText, Mail } from "lucide-react";
import { type ReactElement, useState } from "react";

import { formatCandidateValue, humanize } from "../../lib/format";
import { cellRefFromHint, ProvenancePanel, type ProvenanceTarget } from "../provenance/provenance-panel";
import { Button } from "../ui/button";

function anchorIcon(anchorKind: string): typeof FileText {
  if (anchorKind.startsWith("worksheet")) {
    return FileSpreadsheet;
  }
  if (anchorKind.includes("message") || anchorKind.includes("email")) {
    return Mail;
  }
  return FileText;
}

/** The citation evidence for an accepted record, with every anchor it cites and a way to open the source. */
export function TruthAnchors({
  record,
  anchors
}: {
  record: AcceptedRecordSummary;
  anchors: ProvenanceAnchorSummary[];
}): ReactElement {
  const [trace, setTrace] = useState<ProvenanceTarget | null>(null);
  const packet = record.citationPacket;
  const metadata = packet.extractionMetadata;
  const locatorHint = typeof metadata.locatorHint === "string" ? metadata.locatorHint : null;
  const display = formatCandidateValue(record.acceptedValue);
  const anchorIds = record.provenanceAnchorIds.length > 0 ? record.provenanceAnchorIds : packet.provenanceAnchorIds;
  const highlight = typeof metadata.matchedValue === "string" ? metadata.matchedValue : display.replace(/^\$/, "");

  const open = (ids: string[]): void =>
    setTrace({ anchorIds: ids, label: display, cellRef: cellRefFromHint(locatorHint), highlight });

  return (
    <section className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Provenance</h3>
        <Button size="sm" onClick={() => open(anchorIds)} disabled={anchorIds.length === 0}>
          <FileSearch className="size-3.5" />
          View source
        </Button>
      </div>
      <blockquote className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed break-words text-fg">
        {packet.evidencePreview}
      </blockquote>
      <p className="text-xs text-faint">
        Read by the {humanize(packet.extractionMethodDetail).toLowerCase()}{" "}
        {packet.extractionMethod === "rule" ? "rule" : "extractor"}
        {locatorHint ? ` at ${locatorHint}` : ""}
      </p>

      {anchors.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {anchors.map((anchor) => {
            const Icon = anchorIcon(anchor.anchorKind);
            return (
              <li key={anchor.id} className="flex items-center gap-3 px-3 py-2">
                <Icon className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg" title={anchor.title}>
                    {anchor.title || humanize(anchor.anchorKind)}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {humanize(anchor.anchorKind)}
                    {anchor.summary ? <span className="text-faint"> · {anchor.summary}</span> : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => open([anchor.id])}
                  aria-label={`View the source anchor ${anchor.title}`}
                >
                  Open
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          This record cites {anchorIds.length} anchor{anchorIds.length === 1 ? "" : "s"} that could not be loaded.
        </p>
      )}

      <ProvenancePanel target={trace} onClose={() => setTrace(null)} />
    </section>
  );
}
