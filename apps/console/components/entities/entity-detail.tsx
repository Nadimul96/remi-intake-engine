"use client";

import type { EntityResolutionDetail } from "@remi/domain";
import { ArrowRight, FileSearch, Link2, Pencil } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";

import { formatCandidateValue, formatDateTime, humanize } from "../../lib/format";
import { cellRefFromHint, ProvenancePanel, type ProvenanceTarget } from "../provenance/provenance-panel";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { type AttachOption, DecisionForm } from "./decision-form";
import { EntityTimeline } from "./entity-timeline";
import {
  CATEGORY_DESCRIPTION,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  effectiveState,
  fieldLabel,
  KIND_LABEL,
  observedName,
  STATE_LABEL,
  STATE_TONE
} from "./labels";
import { ConfidenceBar, MatchCandidates } from "./match-candidates";

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{children}</dd>
    </div>
  );
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{children}</h3>
      {aside}
    </div>
  );
}

function LinkedOutcome({ detail, onChange }: { detail: EntityResolutionDetail; onChange?: () => void }): ReactElement {
  const { proposal, currentEntityLink } = detail;
  const rejected = proposal.proposalState === "rejected";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 text-sm">
        {currentEntityLink ? (
          <p className="flex flex-wrap items-center gap-1.5 text-fg">
            <Link2 className="size-4 text-success-text" />
            Linked to <span className="font-semibold">{currentEntityLink.canonicalEntityDisplayName}</span>
          </p>
        ) : (
          <p className="text-fg">
            {rejected ? "Rejected. This mention is not linked to any entity." : "Not linked to an entity."}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted">
          {proposal.reviewedAt
            ? `${humanize(proposal.proposalState)} by ${proposal.reviewedByActorName ?? "an operator"} ${formatDateTime(proposal.reviewedAt)}`
            : proposal.statusExplanation}
        </p>
        {proposal.reviewNote ? <p className="mt-1 text-sm text-fg">&ldquo;{proposal.reviewNote}&rdquo;</p> : null}
      </div>
      {onChange ? (
        <Button size="sm" onClick={onChange}>
          <Pencil className="size-3.5" />
          Change decision
        </Button>
      ) : null}
    </div>
  );
}

export function EntityDetail({
  detail,
  options
}: {
  detail: EntityResolutionDetail;
  options: AttachOption[];
}): ReactElement {
  const { proposal, acceptedRecord, artifact, sourceCandidate } = detail;
  const [trace, setTrace] = useState<ProvenanceTarget | null>(null);
  const [revising, setRevising] = useState(false);
  const name = observedName(acceptedRecord.acceptedValue, proposal.proposedDisplayName);
  const metadata = acceptedRecord.citationPacket.extractionMetadata;
  const locatorHint = typeof metadata.locatorHint === "string" ? metadata.locatorHint : null;
  const anchorIds =
    acceptedRecord.provenanceAnchorIds.length > 0
      ? acceptedRecord.provenanceAnchorIds
      : detail.provenanceAnchors.map((anchor) => anchor.id);
  const reviewable = proposal.currentProposal && proposal.proposalState !== "superseded";
  const isPending = proposal.proposalState === "pending_review";
  const suggestedId = proposal.resolvedEntityId ?? proposal.targetEntityId;
  const state = effectiveState(proposal);

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
          <Badge tone={CATEGORY_TONE[proposal.matchCategory]}>{CATEGORY_LABEL[proposal.matchCategory]}</Badge>
          <Badge>{KIND_LABEL[proposal.proposalKind]}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-2xl font-semibold tracking-tight break-words text-fg">{name}</p>
          {proposal.targetEntityDisplayName && proposal.targetEntityDisplayName !== name ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <ArrowRight className="size-4" />
              {proposal.targetEntityDisplayName}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted">{proposal.rationale}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1 sm:grid-cols-4">
          <Field label="Confidence">
            <ConfidenceBar value={proposal.confidence} />
          </Field>
          <Field label="Strategy">{humanize(proposal.matchStrategy)}</Field>
          <Field label="Entity type">{humanize(proposal.entityType)}</Field>
          <Field label="Source file">
            <span title={artifact.originalFileName}>{artifact.originalFileName}</span>
          </Field>
        </dl>
        <p className="text-xs text-faint">
          {CATEGORY_DESCRIPTION[proposal.matchCategory]} {proposal.statusExplanation}
        </p>
      </div>

      <div className="space-y-2 px-4 py-4 sm:px-5">
        <SectionTitle aside={<span className="text-xs text-faint">{fieldLabel(acceptedRecord.fieldName)}</span>}>
          Accepted truth
        </SectionTitle>
        <p className="text-sm text-fg">{sourceCandidate.summary}</p>
        <blockquote className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed break-words text-fg">
          {acceptedRecord.citationPacket.evidencePreview}
        </blockquote>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={anchorIds.length === 0}
            onClick={() =>
              setTrace({
                anchorIds,
                label: `"${name}"`,
                cellRef: cellRefFromHint(locatorHint),
                highlight: name
              })
            }
          >
            <FileSearch className="size-3.5" />
            View source
          </Button>
          <span className="text-xs text-faint">
            {anchorIds.length} anchor{anchorIds.length === 1 ? "" : "s"}
            {locatorHint ? ` · ${locatorHint}` : ""} · value {formatCandidateValue(acceptedRecord.acceptedValue)}
          </span>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="px-4 pt-4 pb-2 sm:px-5">
          <SectionTitle
            aside={<span className="text-xs text-faint tabular-nums">{proposal.matchingCandidates.length}</span>}
          >
            Matching entities
          </SectionTitle>
        </div>
        <MatchCandidates
          candidates={proposal.matchingCandidates}
          entities={detail.matchingEntities}
          suggestedId={suggestedId}
        />
      </div>

      <div className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
        <SectionTitle>Decision</SectionTitle>
        {reviewable && (isPending || revising) ? (
          <DecisionForm
            key={`${proposal.id}-${proposal.updatedAt}`}
            proposal={proposal}
            options={options}
            onCancel={isPending ? undefined : () => setRevising(false)}
          />
        ) : (
          <LinkedOutcome detail={detail} onChange={reviewable ? () => setRevising(true) : undefined} />
        )}
      </div>

      {detail.reconciliationHistory.length + detail.systemEvents.length + detail.reviewHistory.length > 0 ? (
        <div className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
          <SectionTitle>History</SectionTitle>
          <EntityTimeline detail={detail} />
        </div>
      ) : null}

      <ProvenancePanel target={trace} onClose={() => setTrace(null)} />
    </Card>
  );
}
