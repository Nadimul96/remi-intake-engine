"use client";

import type { CandidateReviewDetail } from "@remi/domain";
import { Check, FileSearch, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useState, useTransition } from "react";

import { postJson } from "../../lib/client-api";
import { formatCandidateValue, formatDateTime, formatPercent, humanize } from "../../lib/format";
import { cellRefFromHint, ProvenancePanel, type ProvenanceTarget } from "../provenance/provenance-panel";
import { Badge, statusTone } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

type EditableValue = { kind: "text"; text: string } | { kind: "number"; value: number; base: Record<string, unknown> };

function editable(value: unknown): EditableValue | null {
  if (typeof value === "string") {
    return { kind: "text", text: value };
  }
  const record = value as Record<string, unknown> | null;
  if (record && typeof record.value === "number") {
    return { kind: "number", value: record.value, base: record };
  }
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{children}</dd>
    </div>
  );
}

export function ReviewDetail({ detail }: { detail: CandidateReviewDetail }): ReactElement {
  const router = useRouter();
  const { candidate, artifact } = detail;
  const [trace, setTrace] = useState<ProvenanceTarget | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const initial = editable(candidate.candidateValue);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const metadata = candidate.citationPacket.extractionMetadata;
  const locatorHint = typeof metadata.locatorHint === "string" ? metadata.locatorHint : null;
  const display = formatCandidateValue(candidate.candidateValue);
  const isPending = candidate.reviewStatus === "pending_review";

  const decide = (action: "accept" | "reject" | "edit_and_accept"): void => {
    setError(null);
    let reviewedValue: unknown;
    if (action === "edit_and_accept" && draft) {
      reviewedValue =
        draft.kind === "text"
          ? draft.text
          : { ...draft.base, value: draft.value, display: draft.value.toLocaleString("en-US") };
    }
    startTransition(async () => {
      try {
        await postJson(`/review/candidates/${candidate.id}/decision`, {
          action,
          note: note.trim() || null,
          ...(action === "edit_and_accept" ? { reviewedValue } : {})
        });
        setEditing(false);
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
          <Badge tone={statusTone(candidate.reviewStatus)}>{humanize(candidate.reviewStatus)}</Badge>
          <Badge tone={candidate.extractionMethod === "model_assisted" ? "accent" : "neutral"}>
            {candidate.extractionMethod === "model_assisted" ? "Model-assisted" : humanize(candidate.extractionMethod)}
          </Badge>
          {!candidate.currentExtraction ? <Badge tone="warning">Superseded</Badge> : null}
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums break-words text-fg">{display}</p>
        <p className="text-sm text-muted">{candidate.summary}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1 sm:grid-cols-4">
          <Field label="Field">{candidate.fieldName}</Field>
          <Field label="Confidence">{formatPercent(candidate.confidence)}</Field>
          <Field label="Rule">{candidate.extractionMethodDetail}</Field>
          <Field label="Source file">
            <span title={artifact.originalFileName}>{artifact.originalFileName}</span>
          </Field>
        </dl>
      </div>

      <div className="space-y-2 px-4 py-4 sm:px-5">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Evidence</h3>
        <blockquote className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed break-words text-fg">
          {candidate.citationPacket.evidencePreview}
        </blockquote>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() =>
              setTrace({
                anchorIds: candidate.citationPacket.provenanceAnchorIds,
                label: display,
                cellRef: cellRefFromHint(locatorHint),
                highlight:
                  typeof metadata.matchedValue === "string" ? metadata.matchedValue : display.replace(/^\$/, "")
              })
            }
          >
            <FileSearch className="size-3.5" />
            View source
          </Button>
          <span className="text-xs text-faint">
            {candidate.citationPacket.provenanceAnchorIds.length} anchor
            {candidate.citationPacket.provenanceAnchorIds.length === 1 ? "" : "s"}
            {locatorHint ? ` · ${locatorHint}` : ""}
          </span>
        </div>
      </div>

      <div className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
        {isPending ? (
          <>
            {editing && draft ? (
              <label className="block">
                <span className="text-xs font-medium text-muted">Corrected value</span>
                <input
                  type={draft.kind === "number" ? "number" : "text"}
                  value={draft.kind === "number" ? draft.value : draft.text}
                  onChange={(event) =>
                    setDraft(
                      draft.kind === "number"
                        ? { ...draft, value: Number(event.target.value) }
                        : { kind: "text", text: event.target.value }
                    )
                  }
                  className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg focus:border-accent focus:outline-none"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="text-xs font-medium text-muted">Note</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional, kept in the review history"
                className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <Button variant="primary" onClick={() => decide("edit_and_accept")} disabled={pending}>
                  <Check className="size-4" />
                  Accept corrected value
                </Button>
              ) : (
                <Button variant="primary" onClick={() => decide("accept")} disabled={pending}>
                  <Check className="size-4" />
                  Accept
                </Button>
              )}
              {initial ? (
                <Button onClick={() => setEditing((value) => !value)} disabled={pending}>
                  <Pencil className="size-4" />
                  {editing ? "Cancel edit" : "Edit"}
                </Button>
              ) : null}
              <Button variant="danger" onClick={() => decide("reject")} disabled={pending}>
                <X className="size-4" />
                Reject
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            {humanize(candidate.reviewStatus)} by {candidate.reviewedByActorName ?? "an operator"}{" "}
            {formatDateTime(candidate.reviewedAt)}
            {candidate.reviewNote ? <span className="mt-1 block text-fg">“{candidate.reviewNote}”</span> : null}
          </p>
        )}
        {error ? <p className="text-sm text-danger-text">{error}</p> : null}
      </div>

      {detail.reviewHistory.length > 0 ? (
        <div className="border-t border-border px-4 py-4 sm:px-5">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">History</h3>
          <ol className="mt-2 space-y-2">
            {detail.reviewHistory.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={statusTone(entry.newReviewStatus)}>{humanize(entry.action)}</Badge>
                <span className="text-muted">
                  {entry.reviewerActorName} · {formatDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <ProvenancePanel target={trace} onClose={() => setTrace(null)} />
    </Card>
  );
}
