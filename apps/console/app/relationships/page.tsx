import type { AssetOrganizationRelationshipDetail, AssetOrganizationRelationshipQueueResponse } from "@remi/domain";
import { Network } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import {
  LIFECYCLE_VALUES,
  LINK_VALUES,
  STATE_VALUES,
  TYPE_PARAM,
  type TypeParam
} from "../../components/relationships/labels";
import { RelationshipDetail } from "../../components/relationships/relationship-detail";
import {
  type FilterParams,
  RelationshipFilters,
  toQueueFilters
} from "../../components/relationships/relationship-filters";
import { RelationshipQueue } from "../../components/relationships/relationship-queue";
import { RelationshipsEmpty } from "../../components/relationships/relationships-empty";
import { Card } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { Stat } from "../../components/ui/stat";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { apiGet } from "../../lib/api";

export const metadata: Metadata = { title: "Relationships" };

const QUEUE_PATH = "/api/relationships/reconciliation";
const DEFAULTS: FilterParams = { type: "all", lifecycle: "all", link: "all", state: "all" };

type SearchParams = { type?: string; lifecycle?: string; link?: string; state?: string; id?: string };

function pick<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return values.find((candidate) => candidate === value);
}

function parseParams(params: SearchParams): FilterParams {
  return {
    type: pick(Object.keys(TYPE_PARAM) as TypeParam[], params.type) ?? DEFAULTS.type,
    lifecycle: pick(LIFECYCLE_VALUES, params.lifecycle) ?? DEFAULTS.lifecycle,
    link: pick(LINK_VALUES, params.link) ?? DEFAULTS.link,
    state: pick(STATE_VALUES, params.state) ?? DEFAULTS.state
  };
}

/** Only non-default filters go into the URL and the API query. */
function queryOf(entries: Record<string, string>, defaults: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== defaults[key]) {
      query.set(key, value);
    }
  }
  return query.toString();
}

export default async function RelationshipsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const raw = await searchParams;
  const params = parseParams(raw);
  const filters = toQueueFilters(params);
  const apiQuery = queryOf({ ...filters }, { ...toQueueFilters(DEFAULTS) });

  const [all, filtered] = await Promise.all([
    apiGet<AssetOrganizationRelationshipQueueResponse>(QUEUE_PATH),
    apiQuery ? apiGet<AssetOrganizationRelationshipQueueResponse>(`${QUEUE_PATH}?${apiQuery}`) : null
  ]);

  const header = (
    <PageHeader
      title="Relationships"
      description="Attach accepted broker and originator relationships to one canonical asset and one canonical organization, with the evidence behind every match."
    />
  );

  const queue = filtered ?? all;
  if (!all.ok || !queue.ok) {
    const failure = !all.ok ? all : queue.ok ? null : queue;
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="The relationship queue is unavailable" message={failure?.error ?? "Unknown error"} />
      </div>
    );
  }

  const { counts, items: everything } = all.data;
  const visible = queue.data.items;
  const selectedId = visible.find((item) => item.proposal.id === raw.id)?.proposal.id ?? visible[0]?.proposal.id;
  const detail = selectedId
    ? await apiGet<AssetOrganizationRelationshipDetail>(`${QUEUE_PATH}/${encodeURIComponent(selectedId)}`)
    : null;

  const href = (patch: Partial<FilterParams> & { id?: string }): string => {
    const { id, ...rest } = patch;
    const text = queryOf({ ...params, ...rest }, { ...DEFAULTS });
    const query = new URLSearchParams(text);
    if (id) {
      query.set("id", id);
    }
    const full = query.toString();
    return full ? `/relationships?${full}` : "/relationships";
  };

  if (everything.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <RelationshipsEmpty unsupported={counts.unsupportedAcceptedRelationships} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Pending review"
          value={counts.pendingReview}
          hint="Current proposals awaiting a decision"
          tone={counts.pendingReview > 0 ? "warning" : "default"}
        />
        <Stat label="Attached" value={counts.attachedAcceptedRelationships} hint="Linked to canonical entities" />
        <Stat label="Unattached" value={counts.unattachedAcceptedRelationships} hint={`${counts.rejected} rejected`} />
        <Stat
          label="Historical"
          value={counts.superseded}
          hint={`${counts.unsupportedAcceptedRelationships} unsupported records`}
        />
      </section>

      <RelationshipFilters params={params} items={everything} hrefFor={(patch) => href(patch)} />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Network}
            title="No proposals match these filters"
            description="Try another state or type, or clear the filters to see every proposal."
            action={
              <Link href="/relationships" className="text-sm font-medium text-accent-text hover:underline">
                Clear filters
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
          <Card className="overflow-hidden lg:sticky lg:top-6">
            <RelationshipQueue items={visible} selectedId={selectedId ?? null} hrefFor={(id) => href({ id })} />
          </Card>
          {detail?.ok ? (
            <RelationshipDetail
              key={`${detail.data.proposal.id}-${detail.data.proposal.updatedAt}`}
              detail={detail.data}
            />
          ) : detail ? (
            <ErrorState title="Could not load this proposal" message={detail.error} />
          ) : null}
        </div>
      )}
    </div>
  );
}
