import type {
  AcceptedTruthBrowserResponse,
  CandidateReviewQueueResponse,
  ConflictListResponse,
  IntakeQueueItem
} from "@remi/domain";
import { ArrowRight, GitCompareArrows, Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { KIND_LABEL } from "../components/conflicts/labels";
import { Badge, statusTone } from "../components/ui/badge";
import { Card, CardHeader } from "../components/ui/card";
import { PageHeader } from "../components/ui/page-header";
import { Stat } from "../components/ui/stat";
import { EmptyState, ErrorState } from "../components/ui/states";
import { Table, Td, Th, Tr } from "../components/ui/table";
import { apiGet } from "../lib/api";
import { formatRelative, humanize } from "../lib/format";

const SEVERITY_DOT = { high: "bg-danger", medium: "bg-warning", low: "bg-border-strong" } as const;

export default async function OverviewPage(): Promise<ReactElement> {
  const [intake, review, conflicts, truth] = await Promise.all([
    apiGet<{ items: IntakeQueueItem[] }>("/api/intake"),
    apiGet<CandidateReviewQueueResponse>("/api/review/candidates"),
    apiGet<ConflictListResponse>("/api/conflicts"),
    apiGet<AcceptedTruthBrowserResponse>("/api/truth")
  ]);

  const header = (
    <PageHeader
      title="Overview"
      description="Documents in, evidence-backed candidates out, and every disagreement between them surfaced with its source."
    />
  );

  if (!intake.ok || !review.ok || !conflicts.ok || !truth.ok) {
    const failure = [intake, review, conflicts, truth].find((result) => !result.ok);
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          title="The API is not answering"
          message={failure && !failure.ok ? failure.error : "Unknown error"}
        />
      </div>
    );
  }

  const items = intake.data.items;
  const completed = items.filter((item) => item.status === "completed").length;
  const openConflicts = conflicts.data.items.filter((conflict) => conflict.status === "open");
  const highSeverity = openConflicts.filter((conflict) => conflict.severity === "high").length;

  return (
    <div className="space-y-6">
      {header}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Documents processed" value={completed} hint={`${items.length} registered`} />
        <Stat
          label="Open conflicts"
          value={openConflicts.length}
          hint={`${highSeverity} high severity`}
          tone={openConflicts.length > 0 ? "danger" : "default"}
        />
        <Stat
          label="Candidates to review"
          value={review.data.counts.pendingReview}
          hint={`${review.data.counts.accepted + review.data.counts.editedAndAccepted} accepted`}
          tone={review.data.counts.pendingReview > 0 ? "warning" : "default"}
        />
        <Stat label="Accepted truth" value={truth.data.counts.all} hint={`${truth.data.counts.fact} facts`} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Conflicts needing attention"
            description="Highest severity first"
            actions={
              <Link
                href="/conflicts"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
              >
                All conflicts <ArrowRight className="size-3" />
              </Link>
            }
          />
          {openConflicts.length === 0 ? (
            <EmptyState
              icon={GitCompareArrows}
              title="No open conflicts"
              description="Every detected disagreement has been reviewed."
            />
          ) : (
            <ul className="divide-y divide-border">
              {openConflicts.slice(0, 7).map((conflict) => (
                <li key={conflict.id}>
                  <Link
                    href={`/conflicts?id=${conflict.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface"
                  >
                    <span className={`size-2 shrink-0 rounded-full ${SEVERITY_DOT[conflict.severity]}`} />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{conflict.title}</span>
                    <Badge className="hidden sm:inline-flex">{KIND_LABEL[conflict.kind]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent intake"
            description="Latest files through the pipeline"
            actions={
              <Link
                href="/intake"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
              >
                Intake <ArrowRight className="size-3" />
              </Link>
            }
          />
          {items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing ingested yet"
              description="Run pnpm seed or upload files on the Intake page."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>File</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Updated</Th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 8).map((item) => (
                  <Tr key={item.id}>
                    <Td className="max-w-0 w-full">
                      <Link
                        href={`/intake?id=${item.id}`}
                        className="block truncate hover:underline"
                        title={item.fileName}
                      >
                        {item.fileName}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={statusTone(item.status)}>{humanize(item.status)}</Badge>
                    </Td>
                    <Td className="text-right text-xs whitespace-nowrap text-muted">
                      {formatRelative(item.updatedAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
