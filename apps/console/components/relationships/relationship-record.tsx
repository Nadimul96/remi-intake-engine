import type { AssetOrganizationRelationshipDetail } from "@remi/domain";
import { FileSearch, FileText } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { formatBytes, formatDateTime, humanize } from "../../lib/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { RECORD_STATUS_TONE } from "./labels";

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm wrap-anywhere text-fg">{children}</dd>
    </div>
  );
}

/** The accepted relationship truth behind the proposal, the file it came from, and its cited evidence. */
export function RelationshipRecord({
  detail,
  anchorCount,
  locatorHint,
  onViewSource
}: {
  detail: AssetOrganizationRelationshipDetail;
  anchorCount: number;
  locatorHint: string | null;
  onViewSource: () => void;
}): ReactElement {
  const { acceptedRecord, artifact, sourceCandidate } = detail;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Accepted record"
        description="The reviewed relationship this proposal attaches. It is never edited here."
        actions={
          <Badge tone={RECORD_STATUS_TONE[detail.acceptedRecordStatus]}>{humanize(detail.acceptedRecordStatus)}</Badge>
        }
      />
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Field label="Field">{acceptedRecord.fieldName}</Field>
          <Field label="Value type">{humanize(acceptedRecord.valueType)}</Field>
          <Field label="Accepted by">{acceptedRecord.reviewerActorName}</Field>
          <Field label="Accepted">{formatDateTime(acceptedRecord.reviewedAt)}</Field>
        </dl>
        <p className="text-sm text-muted">{detail.acceptedRecordStatusExplanation}</p>
        {acceptedRecord.reviewNote ? (
          <p className="text-sm text-fg">
            <span className="text-muted">Review note: </span>“{acceptedRecord.reviewNote}”
          </p>
        ) : null}

        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg" title={artifact.originalFileName}>
              {artifact.originalFileName}
            </p>
            <p className="truncate text-xs text-muted">
              {[artifact.contentType, formatBytes(artifact.sizeBytes), artifact.sourceItemFileName]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Link
            href={`/review?status=all&type=relationship&id=${encodeURIComponent(sourceCandidate.id)}`}
            className="shrink-0 text-xs font-medium text-accent-text hover:underline"
          >
            Candidate
          </Link>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Evidence</h3>
          <blockquote className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-fg">
            {acceptedRecord.citationPacket.evidencePreview}
          </blockquote>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onViewSource} disabled={anchorCount === 0}>
              <FileSearch className="size-3.5" />
              View source
            </Button>
            <span className="text-xs text-faint">
              {anchorCount} anchor{anchorCount === 1 ? "" : "s"}
              {locatorHint ? ` · ${locatorHint}` : ""} · {humanize(sourceCandidate.extractionMethod)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
