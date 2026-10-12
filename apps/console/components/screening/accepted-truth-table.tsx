import type { CandidateCitationPacket, ScreeningAcceptedTruthSummary } from "@remi/domain";
import { ArrowUpRight, Layers } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { formatCandidateValue, formatDateTime, humanize } from "../../lib/format";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/states";
import { Table, Td, Th, Tr } from "../ui/table";
import { fieldLabel } from "./labels";
import { ViewSourceButton } from "./view-source-button";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function AcceptedTruthTable({
  truth,
  citations
}: {
  truth: ScreeningAcceptedTruthSummary;
  /** Citation packets of this document's candidates, keyed by candidate id. */
  citations: Map<string, CandidateCitationPacket>;
}): ReactElement {
  const { counts, items } = truth;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Accepted truth"
        description={[
          plural(counts.all, "record"),
          plural(counts.fact, "fact"),
          plural(counts.classification, "classification"),
          plural(counts.relationship, "relationship")
        ].join(" · ")}
        actions={
          <Link
            href="/truth"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
          >
            Truth browser <ArrowUpRight className="size-3" />
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={Layers}
          title="No accepted truth yet"
          description="Accepting a candidate in the review queue records it here, with its citation kept intact."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Field</Th>
              <Th className="hidden text-right sm:table-cell">Value</Th>
              <Th className="hidden sm:table-cell">Type</Th>
              <Th className="hidden md:table-cell">Decision</Th>
              <Th className="hidden text-right md:table-cell">Anchors</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const value = formatCandidateValue(item.acceptedValue);
              return (
                <Tr key={item.acceptedRecordId}>
                  <Td className="max-w-[16rem]">
                    <span className="block truncate font-medium">{fieldLabel(item.fieldName)}</span>
                    <span className="block truncate text-xs tabular-nums text-muted sm:hidden">{value}</span>
                    {!item.sourceCandidateCurrentExtraction ? (
                      <span className="block text-xs text-warning-text">Source candidate superseded</span>
                    ) : null}
                  </Td>
                  <Td className="hidden max-w-[14rem] text-right sm:table-cell">
                    <span className="block truncate tabular-nums" title={value}>
                      {value}
                    </span>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <Badge>{humanize(item.acceptedRecordType)}</Badge>
                  </Td>
                  <Td className="hidden text-xs whitespace-nowrap text-muted md:table-cell">
                    {item.latestReviewAction ? humanize(item.latestReviewAction) : "Accepted"}
                    <span className="text-faint"> · {formatDateTime(item.latestReviewAt ?? item.createdAt)}</span>
                  </Td>
                  <Td className="hidden text-right text-xs text-muted tabular-nums md:table-cell">
                    {item.provenanceAnchorCount}
                  </Td>
                  <Td className="text-right">
                    <ViewSourceButton packet={citations.get(item.sourceCandidateId) ?? null} label={value} />
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
