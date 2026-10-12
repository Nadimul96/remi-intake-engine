import type { ConflictKind, ConflictListResponse } from "@remi/domain";
import { ChevronLeft, GitCompareArrows } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

import { ConflictDetail } from "../../components/conflicts/conflict-detail";
import { ConflictList } from "../../components/conflicts/conflict-list";
import { KIND_LABEL } from "../../components/conflicts/labels";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { Segmented } from "../../components/ui/segmented";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { apiGet } from "../../lib/api";
import { cn } from "../../lib/cn";

export const metadata: Metadata = { title: "Conflicts" };

const FILTERS: ("all" | ConflictKind)[] = [
  "all",
  "value_mismatch",
  "version_conflict",
  "covenant_breach",
  "budget_variance",
  "name_variants"
];

export default async function ConflictsPage({
  searchParams
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const kind = FILTERS.find((filter) => filter === params.kind) ?? "all";
  const result = await apiGet<ConflictListResponse>("/api/conflicts");

  const header = (
    <PageHeader
      title="Conflicts"
      description="Deterministic checks across every ingested document. Each reading links to the page line or cell it came from."
    />
  );

  if (!result.ok) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="Conflicts are unavailable" message={result.error} />
      </div>
    );
  }

  const { items, counts } = result.data;
  const visible = kind === "all" ? items : items.filter((item) => item.kind === kind);
  const selected = visible.find((item) => item.id === params.id) ?? visible[0] ?? null;
  const href = (next: { kind?: string; id?: string }): string => {
    const query = new URLSearchParams();
    const nextKind = next.kind ?? kind;
    if (nextKind !== "all") {
      query.set("kind", nextKind);
    }
    if (next.id) {
      query.set("id", next.id);
    }
    const text = query.toString();
    return text ? `/conflicts?${text}` : "/conflicts";
  };

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          active={kind}
          items={FILTERS.map((filter) => ({
            key: filter,
            href: href({ kind: filter }),
            label: filter === "all" ? "All" : KIND_LABEL[filter],
            count: filter === "all" ? items.length : items.filter((item) => item.kind === filter).length
          }))}
        />
        <p className="text-xs text-muted tabular-nums">
          {counts.open} open · {counts.resolved} resolved · {counts.dismissed} dismissed
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="No conflicts detected"
            description="Conflicts appear once two documents disagree. Seed the demo with pnpm seed, or upload files on the Intake page."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          {/* On phones the list and the detail are separate views; ?id= switches to the detail. */}
          <Card className={cn("overflow-hidden lg:sticky lg:top-6", params.id && "hidden lg:block")}>
            {visible.length === 0 ? (
              <EmptyState icon={GitCompareArrows} title="Nothing in this category" />
            ) : (
              <ConflictList conflicts={visible} selectedId={selected?.id ?? null} hrefFor={(id) => href({ id })} />
            )}
          </Card>
          {selected ? (
            <div className={cn("space-y-3", !params.id && "hidden lg:block")}>
              <Link
                href={href({})}
                scroll={false}
                className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg lg:hidden"
              >
                <ChevronLeft className="size-4" />
                All conflicts
              </Link>
              <ConflictDetail key={selected.id} conflict={selected} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
