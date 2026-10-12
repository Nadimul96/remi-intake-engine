import type { AcceptedTruthDetail } from "@remi/domain";
import type { ReactElement, ReactNode } from "react";

import { formatBytes, formatCandidateValue, formatDateTime, formatPercent, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";
import { Card } from "../ui/card";
import { fieldLabel, RECORD_TYPE_DESCRIPTION, RECORD_TYPE_LABEL } from "./labels";
import { TruthAnchors } from "./truth-anchors";
import { TruthHistory } from "./truth-history";
import { TruthLineage } from "./truth-lineage";

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }): ReactElement {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{children}</dd>
    </div>
  );
}

function ReviewDecision({ detail }: { detail: AcceptedTruthDetail }): ReactElement {
  const record = detail.acceptedRecord;
  // History is newest first.
  const latest = detail.reviewHistory[0] ?? null;
  return (
    <section className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
      <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Review decision</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Field label="Status">
          <Badge tone={statusTone(record.reviewStatus)}>{humanize(record.reviewStatus)}</Badge>
        </Field>
        <Field label="Action">{latest ? humanize(latest.action) : "—"}</Field>
        <Field label="Reviewer">
          <span title={record.reviewerActorId}>{record.reviewerActorName}</span>
        </Field>
        <Field label="Reviewed">
          <time dateTime={record.reviewedAt}>{formatDateTime(record.reviewedAt)}</time>
        </Field>
      </dl>
      {record.reviewNote ? (
        <p className="rounded-lg border-l-2 border-border-strong bg-surface px-3 py-2 text-sm text-fg">
          {record.reviewNote}
        </p>
      ) : (
        <p className="text-xs text-faint">The reviewer left no note.</p>
      )}
    </section>
  );
}

export function TruthDetail({ detail }: { detail: AcceptedTruthDetail }): ReactElement {
  const { acceptedRecord: record, artifact, sourceCandidate } = detail;
  const display = formatCandidateValue(record.acceptedValue);
  const corrected = record.reviewStatus === "edited_and_accepted";
  const extracted = formatCandidateValue(sourceCandidate.candidateValue);

  return (
    <Card className="overflow-hidden">
      <div className="space-y-4 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{RECORD_TYPE_LABEL[record.acceptedRecordType]}</Badge>
          <Badge tone={statusTone(record.reviewStatus)}>{humanize(record.reviewStatus)}</Badge>
          {detail.lineage.sourceCandidateCurrentExtraction ? (
            <Badge tone="success">Current source</Badge>
          ) : (
            <Badge tone="warning">Superseded source</Badge>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted">{fieldLabel(record.fieldName)}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums break-words text-fg">{display}</p>
          {corrected && extracted !== display ? (
            <p className="mt-1 text-sm text-muted">
              Corrected by the reviewer from <span className="text-fg line-through">{extracted}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">{sourceCandidate.summary}</p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Field label="Field" wide>
            <span className="font-mono text-xs" title={record.fieldName}>
              {record.fieldName}
            </span>
          </Field>
          <Field label="Record type">
            <span title={RECORD_TYPE_DESCRIPTION[record.acceptedRecordType]}>
              {RECORD_TYPE_LABEL[record.acceptedRecordType]} · {humanize(record.valueType)}
            </span>
          </Field>
          <Field label="Extraction">
            <span title={humanize(record.citationPacket.extractionMethodDetail)}>
              {humanize(record.citationPacket.extractionMethod)} ·{" "}
              {formatPercent(record.citationPacket.confidenceScore)}
            </span>
          </Field>
          <Field label="Source file" wide>
            <span title={artifact.originalFileName}>{artifact.originalFileName}</span>
          </Field>
          <Field label="File" wide>
            <span className="text-muted">
              {artifact.contentType ?? "Unknown type"} · {formatBytes(artifact.sizeBytes)} ·{" "}
              <span className="font-mono text-xs" title={artifact.sha256}>
                {artifact.sha256.slice(0, 12)}
              </span>
            </span>
          </Field>
        </dl>
      </div>

      <TruthAnchors record={record} anchors={detail.provenanceAnchors} />
      <ReviewDecision detail={detail} />
      <TruthLineage lineage={detail.lineage} />
      <TruthHistory entries={detail.reviewHistory} />

      <p className="border-t border-border bg-surface px-4 py-2 font-mono text-[11px] break-all text-faint sm:px-5">
        {record.id}
      </p>
    </Card>
  );
}
