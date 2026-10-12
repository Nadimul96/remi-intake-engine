import type { ExtractedCandidateSummary, ScreeningCandidateSummary } from "@remi/domain";
import { ArrowUpRight, ListChecks } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatCandidateValue, formatPercent, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/states";
import { Table, Td, Th, Tr } from "../ui/table";
import { fieldLabel, reviewHref } from "./labels";
import { ViewSourceButton } from "./view-source-button";

const STATUS_ORDER: Record<ExtractedCandidateSummary["reviewStatus"], number> = {
  pending_review: 0,
  edited_and_accepted: 1,
  accepted: 1,
  rejected: 2
};

function sortCandidates(items: ExtractedCandidateSummary[]): ExtractedCandidateSummary[] {
  return [...items].sort(
    (a, b) =>
      Number(b.currentExtraction) - Number(a.currentExtraction) ||
      STATUS_ORDER[a.reviewStatus] - STATUS_ORDER[b.reviewStatus]
  );
}

export function CandidateTable({ signals }: { signals: ScreeningCandidateSummary }): ReactElement {
  const items = sortCandidates(signals.items);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Candidate signals"
        description={`${items.length} extracted · ${signals.pendingReview} pending review · pending first`}
        actions={
          <Link
            href="/review"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
          >
            Review queue <ArrowUpRight className="size-3" />
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={ListChecks}
          title="No candidate signals"
          description="Extraction found no evidence-backed values in this document. Check the intake detail for parser warnings."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Field</Th>
              <Th className="hidden text-right sm:table-cell">Value</Th>
              <Th className="hidden text-right sm:table-cell">Confidence</Th>
              <Th>Status</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {items.map((candidate) => {
              const value = formatCandidateValue(candidate.reviewedValue ?? candidate.candidateValue);
              return (
                <Tr key={candidate.id} className={cn(!candidate.currentExtraction && "opacity-60")}>
                  <Td className="max-w-[12rem] sm:max-w-[16rem]">
                    <Link
                      href={reviewHref(candidate.id, candidate.reviewStatus === "pending_review")}
                      className="block truncate font-medium hover:underline"
                      title={candidate.summary}
                    >
                      {fieldLabel(candidate.fieldName)}
                    </Link>
                    <span className="block truncate text-xs font-medium tabular-nums text-fg sm:hidden">
                      {value} <span className="font-normal text-faint">· {formatPercent(candidate.confidence)}</span>
                    </span>
                    <span className="hidden truncate text-xs text-faint sm:block">
                      {humanize(candidate.candidateType.replace(/_candidate$/, ""))} ·{" "}
                      {candidate.extractionMethod === "model_assisted"
                        ? "Model-assisted"
                        : candidate.extractionMethodDetail}
                    </span>
                  </Td>
                  <Td className="hidden max-w-[14rem] text-right sm:table-cell">
                    <span className="block truncate tabular-nums" title={value}>
                      {value}
                    </span>
                  </Td>
                  <Td className="hidden text-right text-xs text-muted tabular-nums sm:table-cell">
                    {formatPercent(candidate.confidence)}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1">
                      <Badge tone={statusTone(candidate.reviewStatus)}>{humanize(candidate.reviewStatus)}</Badge>
                      {!candidate.currentExtraction ? <Badge>Superseded</Badge> : null}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <ViewSourceButton packet={candidate.citationPacket} label={value} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
