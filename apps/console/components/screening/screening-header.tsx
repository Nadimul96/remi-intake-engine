import type { DealScreeningWorkbench } from "@remi/domain";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { formatBytes, formatDateTime, humanize } from "../../lib/format";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { documentIcon, READINESS } from "./labels";
import { ProgressBar } from "./progress-bar";

function Meta({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-fg">{children}</dd>
    </div>
  );
}

/** Decisions taken versus decisions the document needs, across every lane. */
export function decisionProgress(workbench: DealScreeningWorkbench): { done: number; total: number } {
  const signals = workbench.candidateSignals;
  const { assetIdentity, organizationIdentity, relationships } = workbench.readiness;
  const reviewed = signals.accepted + signals.editedAndAccepted + signals.rejected;
  const candidates = reviewed + signals.pendingReview;
  return {
    done:
      reviewed + assetIdentity.resolvedCurrent + organizationIdentity.resolvedCurrent + relationships.resolvedCurrent,
    total: candidates + assetIdentity.currentTotal + organizationIdentity.currentTotal + relationships.currentTotal
  };
}

function contentSummary(workbench: DealScreeningWorkbench): string {
  const content = workbench.sourceItem.normalizedContent;
  if (content.emailMessages.length > 0) {
    const attachments = content.attachments.length;
    return `${content.emailMessages.length} message${content.emailMessages.length === 1 ? "" : "s"}${
      attachments > 0 ? `, ${attachments} attachment${attachments === 1 ? "" : "s"}` : ""
    }`;
  }
  if (content.worksheets.length > 0) {
    return `${content.worksheets.length} worksheet${content.worksheets.length === 1 ? "" : "s"}`;
  }
  if (content.documentPages.length > 0) {
    return `${content.documentPages.length} page${content.documentPages.length === 1 ? "" : "s"}`;
  }
  return humanize(content.contentKind);
}

export function ScreeningHeader({ workbench }: { workbench: DealScreeningWorkbench }): ReactElement {
  const { sourceItem, readiness } = workbench;
  const meta = READINESS[readiness.status];
  const Icon = documentIcon(sourceItem.contentType, sourceItem.fileName);
  const progress = decisionProgress(workbench);
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  const subject = sourceItem.normalizedContent.emailThread?.subject;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface text-muted">
            <Icon className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="min-w-0 truncate text-base font-semibold tracking-tight text-fg"
                title={sourceItem.fileName}
              >
                {sourceItem.fileName}
              </h2>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-fg">{readiness.about}</p>
            <p className="mt-0.5 text-xs text-muted">{meta.description}</p>
          </div>
        </div>
        <div className="w-full shrink-0 sm:w-44">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted">Decisions made</span>
            <span className="text-sm font-semibold tabular-nums text-fg">{percent}%</span>
          </div>
          <ProgressBar className="mt-1.5" value={progress.done} total={progress.total} label="Decisions made" />
          <p className="mt-1 text-[11px] text-faint tabular-nums">
            {progress.done} of {progress.total} resolved
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border bg-surface px-4 py-3 sm:grid-cols-3 sm:px-5 xl:grid-cols-6">
        <Meta label="Source">{sourceItem.sourceConnectionName}</Meta>
        <Meta label="Content">{contentSummary(workbench)}</Meta>
        <Meta label="Size">{formatBytes(sourceItem.sizeBytes)}</Meta>
        <Meta label="Support tier">{humanize(sourceItem.supportTier)}</Meta>
        <Meta label="Parser">{humanize(sourceItem.parserTarget)}</Meta>
        <Meta label="Provenance anchors">
          <span className="tabular-nums">{sourceItem.provenanceAnchors.totalCount}</span>
        </Meta>
      </dl>

      <div className="flex flex-col gap-2 border-t border-border px-4 py-2.5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="min-w-0">
          {subject ? <span className="text-fg">“{subject}” · </span> : null}
          {sourceItem.candidateExtractionResult.summary}
          <span className="text-faint"> · updated {formatDateTime(sourceItem.updatedAt)}</span>
        </p>
        <Link
          href={`/intake?id=${encodeURIComponent(sourceItem.id)}`}
          className="inline-flex shrink-0 items-center gap-1 font-medium text-accent-text hover:underline"
        >
          Intake detail <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </Card>
  );
}
