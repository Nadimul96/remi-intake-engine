import type { CandidateLineageSummary } from "@remi/domain";
import { ArrowUpRight, CircleCheck, History } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { formatCandidateValue, formatDateTime, formatPercent, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";
import { fieldLabel, reviewHref } from "./labels";

function LineageStatus({ lineage }: { lineage: CandidateLineageSummary }): ReactElement {
  if (lineage.sourceCandidateCurrentExtraction) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-text" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-fg">Source candidate is current</p>
          <p className="text-muted">The latest extraction of this file still produces the value that was accepted.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-warning-soft px-3 py-2.5">
      <History className="mt-0.5 size-4 shrink-0 text-warning-text" />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-warning-text">
          Source candidate superseded {formatDateTime(lineage.sourceCandidateSupersededAt)}
        </p>
        <p className="text-warning-text/80">
          The file was re-extracted after this value was accepted. The accepted record stays as reviewed; check the
          newer candidates below.
        </p>
      </div>
    </div>
  );
}

export function TruthLineage({ lineage }: { lineage: CandidateLineageSummary }): ReactElement {
  return (
    <section className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Lineage</h3>
        <Link
          href={reviewHref(lineage.sourceCandidateId)}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
        >
          Source candidate
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
      <LineageStatus lineage={lineage} />
      {lineage.newerCandidates.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs text-muted">
            {lineage.newerCandidates.length} newer candidate{lineage.newerCandidates.length === 1 ? "" : "s"} for this
            field
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {lineage.newerCandidates.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  href={reviewHref(candidate.id)}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm transition-colors hover:bg-surface"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">
                    {formatCandidateValue(candidate.candidateValue)}
                  </span>
                  <span className="text-xs text-muted">{fieldLabel(candidate.fieldName)}</span>
                  <span className="text-xs text-faint tabular-nums">{formatPercent(candidate.confidence)}</span>
                  <Badge tone={statusTone(candidate.reviewStatus)}>{humanize(candidate.reviewStatus)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-faint">No newer candidates have been extracted for this field.</p>
      )}
    </section>
  );
}
