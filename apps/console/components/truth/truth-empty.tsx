import type { AcceptedRecordType, AcceptedTruthFilter } from "@remi/domain";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { EmptyState } from "../ui/states";
import { REVIEW_TYPE_FOR } from "./labels";

const TITLE: Record<AcceptedTruthFilter, string> = {
  all: "No accepted truth yet",
  fact: "No accepted facts yet",
  relationship: "No accepted relationships yet",
  classification: "No accepted classifications yet"
};

const EXPLANATION: Record<AcceptedRecordType, string> = {
  fact: "Facts are metrics such as NOI, occupancy or rent that a reviewer has accepted from a document.",
  relationship: "Relationships link an asset to a sponsor, lender or broker once a reviewer accepts the assertion.",
  classification: "Classifications record what a document is about, such as the asset it names."
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? " is" : "s are"}`;
}

/**
 * Explains why a filter is empty and where the missing records come from.
 * `pending` is how many candidates of this kind are waiting in the review queue, when known.
 */
export function TruthEmpty({ filter, pending }: { filter: AcceptedTruthFilter; pending: number | null }): ReactElement {
  const reviewHref = filter === "all" ? "/review" : `/review?type=${REVIEW_TYPE_FOR[filter]}`;
  const noun = filter === "fact" ? "metric candidate" : filter === "all" ? "candidate" : `${filter} candidate`;
  const waiting =
    pending === null
      ? "Accept candidates on the Review page and they appear here with their citation."
      : pending > 0
        ? `${plural(pending, noun)} waiting on the Review page. Accept one and it appears here with its citation.`
        : "None are waiting for review either; they appear once documents finish extraction.";
  const lead =
    filter === "all"
      ? "Nothing becomes accepted truth until a reviewer approves an extracted candidate."
      : EXPLANATION[filter];

  return (
    <EmptyState
      icon={ShieldCheck}
      title={TITLE[filter]}
      description={`${lead} ${waiting}`}
      action={
        pending === 0 ? null : (
          <Link
            href={reviewHref}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-raised px-3.5 text-sm font-medium text-fg shadow-card transition-colors hover:bg-subtle"
          >
            Open the review queue
            <ArrowUpRight className="size-4" />
          </Link>
        )
      }
    />
  );
}
