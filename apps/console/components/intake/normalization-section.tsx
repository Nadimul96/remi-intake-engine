import type { AttachmentSummary, IntakeDetail } from "@remi/domain";
import { Paperclip } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { formatBytes, formatDateTime, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";
import { ReasonCodes, Section, Warnings } from "./section";

type NormalizedContent = IntakeDetail["normalizedContent"];

function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{children}</dd>
    </div>
  );
}

function ContentFacts({ content }: { content: NormalizedContent }): ReactElement | null {
  if (content.document) {
    const { document } = content;
    return (
      <>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Fact label="Title">
            <span title={document.title ?? undefined}>{document.title ?? "Untitled"}</span>
          </Fact>
          <Fact label="Pages">{document.pageCount}</Fact>
          <Fact label="Native text">{document.textAvailable ? "Available" : "Not found"}</Fact>
        </dl>
        {document.textPreview ? (
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="line-clamp-3 font-mono text-xs leading-relaxed break-words text-muted">
              {document.textPreview}
            </p>
          </div>
        ) : null}
      </>
    );
  }
  if (content.emailThread) {
    const message = content.emailMessages[0];
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact label="Subject">
          <span title={content.emailThread.subject ?? undefined}>{content.emailThread.subject ?? "No subject"}</span>
        </Fact>
        <Fact label="Messages">{content.emailThread.messageCount}</Fact>
        {message ? <Fact label="From">{message.sender ?? "Unknown"}</Fact> : null}
        {message ? <Fact label="To">{message.to.join(", ") || "None"}</Fact> : null}
        {message ? (
          <Fact label="Sent">{message.sentAt ? formatDateTime(message.sentAt) : (message.sentAtRaw ?? "Unknown")}</Fact>
        ) : null}
        {message ? <Fact label="Attachments">{message.attachmentCount}</Fact> : null}
      </dl>
    );
  }
  if (content.workbook) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-fg">
          {content.workbook.sheetCount} sheet{content.workbook.sheetCount === 1 ? "" : "s"}
          {content.structuredTables.length > 0 ? (
            <span className="text-muted"> · {content.structuredTables.length} structured tables</span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {content.worksheets.map((sheet) => (
            <span
              key={sheet.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg"
            >
              {sheet.name}
              <span className="text-faint tabular-nums">
                {sheet.maxRow ?? 0}×{sheet.maxColumn ?? 0}
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

function AttachmentRow({ attachment }: { attachment: AttachmentSummary }): ReactElement {
  const promoted = attachment.promotedArtifact;
  return (
    <li className="flex items-start gap-3 py-2">
      <Paperclip className="mt-0.5 size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{attachment.fileName ?? `Part ${attachment.partIndex}`}</p>
        <p className="truncate text-xs text-muted">
          {attachment.contentType ?? "Unknown type"}
          {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ""}
          {promoted?.summary
            ? ` · ${promoted.summary}`
            : attachment.promotionSummary
              ? ` · ${attachment.promotionSummary}`
              : ""}
        </p>
      </div>
      <Badge
        tone={
          attachment.promotionStatus === "promotion_failed"
            ? "danger"
            : attachment.promotionStatus === "embedded_only"
              ? "neutral"
              : "success"
        }
      >
        {humanize(attachment.promotionStatus)}
      </Badge>
    </li>
  );
}

export function NormalizationSection({ detail }: { detail: IntakeDetail }): ReactElement {
  const result = detail.normalizationResult;
  const content = detail.normalizedContent;
  const flags = [
    result.retryRecommended ? "Retry recommended" : null,
    result.reprocessRecommended ? "Reprocess recommended" : null
  ].filter((flag): flag is string => flag !== null);

  return (
    <Section title="Normalization" aside={<Badge tone={statusTone(result.status)}>{humanize(result.status)}</Badge>}>
      <p className="text-sm text-fg">{result.summary}</p>
      <ReasonCodes codes={result.reasonCodes} />
      <Warnings warnings={result.warnings} />
      {flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((flag) => (
            <Badge key={flag} tone="warning">
              {flag}
            </Badge>
          ))}
        </div>
      ) : null}
      <ContentFacts content={content} />
      {content.attachments.length > 0 ? (
        <div>
          <h4 className="text-xs font-medium text-muted">Attachments · {content.attachments.length}</h4>
          <ul className="divide-y divide-border">
            {content.attachments.map((attachment) => (
              <AttachmentRow key={attachment.id} attachment={attachment} />
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}
