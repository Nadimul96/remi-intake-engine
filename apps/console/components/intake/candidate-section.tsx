"use client";

import type { CandidateExtractionResult, ExtractedCandidateSummary } from "@remi/domain";
import { ArrowUpRight, FileSearch } from "lucide-react";
import Link from "next/link";
import { type ReactElement, useState } from "react";

import { formatCandidateValue, formatPercent, humanize } from "../../lib/format";
import { cellRefFromHint, ProvenancePanel, type ProvenanceTarget } from "../provenance/provenance-panel";
import { Badge, statusTone } from "../ui/badge";
import { Button } from "../ui/button";
import { candidateFieldKey } from "./labels";
import { ReasonCodes, Section, Warnings } from "./section";

function traceTarget(candidate: ExtractedCandidateSummary): ProvenanceTarget {
  const metadata = candidate.citationPacket.extractionMetadata;
  const locatorHint = typeof metadata.locatorHint === "string" ? metadata.locatorHint : null;
  const display = formatCandidateValue(candidate.candidateValue);
  return {
    anchorIds: candidate.citationPacket.provenanceAnchorIds,
    label: display,
    cellRef: cellRefFromHint(locatorHint),
    highlight: typeof metadata.matchedValue === "string" ? metadata.matchedValue : display.replace(/^\$/, "")
  };
}

function CandidateRow({
  candidate,
  onTrace
}: {
  candidate: ExtractedCandidateSummary;
  onTrace: () => void;
}): ReactElement {
  const display = formatCandidateValue(candidate.candidateValue);
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold tabular-nums text-fg" title={display}>
            {display}
          </span>
          <Badge tone={statusTone(candidate.reviewStatus)}>{humanize(candidate.reviewStatus)}</Badge>
          {!candidate.currentExtraction ? <Badge tone="warning">Superseded</Badge> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {humanize(candidateFieldKey(candidate.fieldName))}
          <span className="text-faint">
            {" "}
            · {formatPercent(candidate.confidence)} ·{" "}
            {candidate.extractionMethod === "model_assisted" ? "Model-assisted" : humanize(candidate.extractionMethod)}
          </span>
        </p>
      </div>
      <div className="-ml-2.5 flex shrink-0 items-center gap-1 sm:ml-0">
        <Button size="sm" variant="ghost" onClick={onTrace} aria-label={`View the source of ${display}`}>
          <FileSearch className="size-3.5" />
          Source
        </Button>
        <Link
          href={`/review?status=all&id=${encodeURIComponent(candidate.id)}`}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted transition-colors hover:bg-subtle hover:text-fg"
        >
          Review
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </li>
  );
}

export function CandidateSection({
  result,
  candidates
}: {
  result: CandidateExtractionResult;
  candidates: ExtractedCandidateSummary[];
}): ReactElement {
  const [trace, setTrace] = useState<ProvenanceTarget | null>(null);
  const pending = candidates.filter((candidate) => candidate.reviewStatus === "pending_review").length;

  return (
    <Section
      title={`Candidates · ${result.candidateCount}`}
      aside={<Badge tone={statusTone(result.status)}>{humanize(result.status)}</Badge>}
    >
      <p className="text-sm text-fg">
        {result.summary}
        {pending > 0 ? <span className="text-muted"> {pending} waiting for review.</span> : null}
      </p>
      <ReasonCodes codes={result.reasonCodes.filter((code) => code !== "candidate_extraction_completed")} />
      <Warnings warnings={result.warnings} />
      {candidates.length > 0 ? (
        <ul className="divide-y divide-border border-t border-border">
          {candidates.map((candidate) => (
            <CandidateRow key={candidate.id} candidate={candidate} onTrace={() => setTrace(traceTarget(candidate))} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No evidence-backed candidates were stored for this file. Unsupported or empty files skip extraction.
        </p>
      )}
      <ProvenancePanel target={trace} onClose={() => setTrace(null)} />
    </Section>
  );
}
