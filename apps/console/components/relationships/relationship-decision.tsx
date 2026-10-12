"use client";

import type { AssetOrganizationRelationshipProposalSummary } from "@remi/domain";
import { Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useState, useTransition } from "react";

import { postJson } from "../../lib/client-api";
import { formatDateTime } from "../../lib/format";
import { Button } from "../ui/button";
import { STATE_LABEL } from "./labels";

function LastDecision({ proposal }: { proposal: AssetOrganizationRelationshipProposalSummary }): ReactElement | null {
  if (!proposal.reviewedAt) {
    return null;
  }
  return (
    <p className="text-sm text-muted">
      {STATE_LABEL[proposal.proposalState]} by {proposal.reviewedByActorName ?? "an operator"}{" "}
      {formatDateTime(proposal.reviewedAt)}
      {proposal.reviewNote ? <span className="mt-1 block text-fg">“{proposal.reviewNote}”</span> : null}
    </p>
  );
}

/** Attach or reject the current proposal. Historical proposals are read-only. */
export function RelationshipDecision({
  proposal,
  assetEntityId,
  organizationEntityId
}: {
  proposal: AssetOrganizationRelationshipProposalSummary;
  assetEntityId: string;
  organizationEntityId: string;
}): ReactElement {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const actionable = proposal.currentProposal && proposal.proposalState !== "superseded";
  const decided = proposal.proposalState === "accepted" || proposal.proposalState === "rejected";
  const canAttach = Boolean(assetEntityId && organizationEntityId);

  const decide = (action: "accept" | "reject"): void => {
    setError(null);
    startTransition(async () => {
      try {
        await postJson(`/relationships/reconciliation/${encodeURIComponent(proposal.id)}/decision`, {
          action,
          note: note.trim() || null,
          ...(action === "accept"
            ? { canonicalAssetEntityId: assetEntityId, canonicalOrganizationEntityId: organizationEntityId }
            : {})
        });
        setNote("");
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The decision could not be saved.");
      }
    });
  };

  if (!actionable) {
    return (
      <div className="space-y-2">
        <LastDecision proposal={proposal} />
        <p className="text-sm text-muted">
          This proposal is historical and read-only. Decisions apply only to the current proposal for this accepted
          record.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <LastDecision proposal={proposal} />
      <label className="block">
        <span className="text-xs font-medium text-muted">Decision note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Optional, kept in the activity history"
          className="mt-1 block w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => decide("accept")} disabled={pending || !canAttach}>
          <Link2 className="size-4" />
          {pending ? "Saving…" : proposal.proposalState === "accepted" ? "Update attachment" : "Attach relationship"}
        </Button>
        {proposal.proposalState !== "rejected" ? (
          <Button variant="danger" onClick={() => decide("reject")} disabled={pending}>
            <X className="size-4" />
            {decided ? "Detach and reject" : "Reject"}
          </Button>
        ) : null}
        {!canAttach ? (
          <span className="text-xs text-faint">Choose one asset and one organization to attach.</span>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger-text">{error}</p> : null}
    </div>
  );
}
