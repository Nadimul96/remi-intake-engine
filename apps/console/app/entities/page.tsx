import type { EntityResolutionDetail, EntityResolutionQueueItem, EntityResolutionQueueResponse } from "@remi/domain";
import { Fingerprint } from "lucide-react";
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { buildCatalog } from "../../components/entities/catalog";
import type { AttachOption } from "../../components/entities/decision-form";
import { EntityCatalog } from "../../components/entities/entity-catalog";
import { EntityDetail } from "../../components/entities/entity-detail";
import { EntityQueue } from "../../components/entities/entity-queue";
import {
  CATEGORY_FILTERS,
  CATEGORY_LABEL,
  effectiveState,
  SIGNAL_LABEL,
  STATE_FILTERS,
  STATE_LABEL,
  type StateFilter
} from "../../components/entities/labels";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { Segmented } from "../../components/ui/segmented";
import { Stat } from "../../components/ui/stat";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { apiGet } from "../../lib/api";

export const metadata: Metadata = { title: "Entities" };

function matchesState(item: EntityResolutionQueueItem, filter: StateFilter): boolean {
  return filter === "all" || effectiveState(item.proposal) === filter;
}

function attachOptions(
  detail: EntityResolutionDetail | null,
  catalog: ReturnType<typeof buildCatalog>
): AttachOption[] {
  if (!detail) {
    return [];
  }
  const options = new Map<string, AttachOption>();
  for (const candidate of [...detail.proposal.matchingCandidates].sort((a, b) => b.confidence - a.confidence)) {
    if (!options.has(candidate.entityId)) {
      options.set(candidate.entityId, {
        id: candidate.entityId,
        displayName: candidate.entityDisplayName,
        hint: SIGNAL_LABEL[candidate.signalType]
      });
    }
  }
  for (const entity of catalog) {
    if (entity.entityType === detail.proposal.entityType && !options.has(entity.id)) {
      options.set(entity.id, {
        id: entity.id,
        displayName: entity.displayName,
        hint: `${entity.mentions} mention${entity.mentions === 1 ? "" : "s"}`
      });
    }
  }
  return [...options.values()];
}

export default async function EntitiesPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string; category?: string; id?: string }>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const state = STATE_FILTERS.find((value) => value === params.state) ?? "pending_review";
  const category = CATEGORY_FILTERS.find((value) => value === params.category) ?? "all";
  const queue = await apiGet<EntityResolutionQueueResponse>("/api/entities/reconciliation");

  const header = (
    <PageHeader
      title="Entity reconciliation"
      description="Accepted asset and organization names, matched against the canonical catalog. Confirm which mentions are the same property, so every fact rolls up to one entity."
    />
  );
  if (!queue.ok) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="The reconciliation queue is unavailable" message={queue.error} />
      </div>
    );
  }

  const { items, counts } = queue.data;
  const byState = items.filter((item) => matchesState(item, state));
  const visible = category === "all" ? byState : byState.filter((item) => item.proposal.matchCategory === category);
  const selectedId = visible.find((item) => item.proposal.id === params.id)?.proposal.id ?? visible[0]?.proposal.id;
  const detailResult = selectedId
    ? await apiGet<EntityResolutionDetail>(`/api/entities/reconciliation/${encodeURIComponent(selectedId)}`)
    : null;
  const detail = detailResult?.ok ? detailResult.data : null;
  const catalog = buildCatalog(items, detail?.matchingEntities ?? []);

  const href = (next: { state?: string; category?: string; id?: string }): string => {
    const query = new URLSearchParams();
    const nextState = next.state ?? state;
    const nextCategory = next.category ?? category;
    if (nextState !== "pending_review") query.set("state", nextState);
    if (nextCategory !== "all") query.set("category", nextCategory);
    if (next.id) query.set("id", next.id);
    const text = query.toString();
    return text ? `/entities?${text}` : "/entities";
  };
  const stateCount: Record<StateFilter, number> = {
    pending_review: counts.pendingReview,
    accepted: counts.accepted,
    rejected: counts.rejected,
    superseded: items.filter((item) => matchesState(item, "superseded")).length,
    all: items.length
  };
  const distinctPending = new Set(
    items
      .filter((item) => item.proposal.currentProposal && item.proposal.proposalState === "pending_review")
      .map((item) => item.proposal.normalizedDisplayName)
  ).size;

  return (
    <div className="space-y-6">
      {header}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Pending review"
          value={counts.pendingReview}
          hint={`${distinctPending} distinct name${distinctPending === 1 ? "" : "s"}`}
          tone={counts.pendingReview > 0 ? "warning" : "default"}
        />
        <Stat
          label="Linked truths"
          value={counts.attachedAcceptedTruths}
          hint={`${counts.unattachedAcceptedTruths} not linked yet`}
        />
        <Stat label="Canonical entities" value={counts.canonicalEntities} hint="Assets and organizations" />
        <Stat label="Superseded" value={stateCount.superseded} hint="Replaced by a newer match" />
      </section>

      <EntityCatalog entities={catalog} total={counts.canonicalEntities} />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Segmented
          active={state}
          items={STATE_FILTERS.map((value) => ({
            key: value,
            label: value === "all" ? "All" : STATE_LABEL[value],
            count: stateCount[value],
            href: href({ state: value })
          }))}
        />
        <Segmented
          active={category}
          items={CATEGORY_FILTERS.map((value) => ({
            key: value,
            label: value === "all" ? "Any match" : CATEGORY_LABEL[value],
            count:
              value === "all" ? byState.length : byState.filter((item) => item.proposal.matchCategory === value).length,
            href: href({ category: value })
          }))}
        />
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Fingerprint}
            title={
              items.length === 0
                ? "No names to reconcile"
                : state === "pending_review"
                  ? "Every name is reconciled"
                  : "No proposals match these filters"
            }
            description={
              items.length === 0
                ? "Proposals appear once asset or organization names are accepted on the Review page."
                : "Switch the state or match filter to see other proposals."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <Card className="overflow-hidden lg:sticky lg:top-6">
            <EntityQueue
              items={visible}
              selectedId={selectedId ?? null}
              showState={state === "all"}
              hrefFor={(id) => href({ id })}
            />
          </Card>
          {detail ? (
            <EntityDetail key={detail.proposal.id} detail={detail} options={attachOptions(detail, catalog)} />
          ) : detailResult && !detailResult.ok ? (
            <ErrorState title="Could not load this proposal" message={detailResult.error} />
          ) : null}
        </div>
      )}
    </div>
  );
}
