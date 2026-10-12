import type { AssetOrganizationRelationshipQueueFilters, AssetOrganizationRelationshipQueueItem } from "@remi/domain";
import type { ReactElement } from "react";

import { Segmented } from "../ui/segmented";
import {
  LIFECYCLE_VALUES,
  LINK_VALUES,
  matchesFilters,
  STATE_LABEL,
  STATE_VALUES,
  TYPE_FILTER_LABEL,
  TYPE_PARAM,
  type TypeParam
} from "./labels";

export interface FilterParams {
  type: TypeParam;
  lifecycle: AssetOrganizationRelationshipQueueFilters["lifecycle"];
  link: AssetOrganizationRelationshipQueueFilters["linkState"];
  state: AssetOrganizationRelationshipQueueFilters["proposalState"];
}

export function toQueueFilters(params: FilterParams): AssetOrganizationRelationshipQueueFilters {
  return {
    relationshipType: TYPE_PARAM[params.type],
    lifecycle: params.lifecycle,
    linkState: params.link,
    proposalState: params.state
  };
}

function FilterGroup({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-medium tracking-wide text-faint uppercase">{label}</span>
      {children}
    </div>
  );
}

/** Four URL-backed filters; each option shows how many proposals it leaves given the other active filters. */
export function RelationshipFilters({
  params,
  items,
  hrefFor
}: {
  params: FilterParams;
  items: AssetOrganizationRelationshipQueueItem[];
  hrefFor: (patch: Partial<FilterParams>) => string;
}): ReactElement {
  const count = (patch: Partial<FilterParams>): number => {
    const filters = toQueueFilters({ ...params, ...patch });
    return items.filter((item) => matchesFilters(item, filters)).length;
  };

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-3">
      <FilterGroup label="State">
        <Segmented
          active={params.state}
          items={STATE_VALUES.map((state) => ({
            key: state,
            label: state === "all" ? "All" : STATE_LABEL[state],
            count: count({ state }),
            href: hrefFor({ state })
          }))}
        />
      </FilterGroup>
      <FilterGroup label="Type">
        <Segmented
          active={params.type}
          items={(Object.keys(TYPE_PARAM) as TypeParam[]).map((type) => ({
            key: type,
            label: TYPE_FILTER_LABEL[type],
            count: count({ type }),
            href: hrefFor({ type })
          }))}
        />
      </FilterGroup>
      <FilterGroup label="Link">
        <Segmented
          active={params.link}
          items={LINK_VALUES.map((link) => ({
            key: link,
            label: link === "all" ? "All" : link === "linked" ? "Attached" : "Unattached",
            count: count({ link }),
            href: hrefFor({ link })
          }))}
        />
      </FilterGroup>
      <FilterGroup label="Lifecycle">
        <Segmented
          active={params.lifecycle}
          items={LIFECYCLE_VALUES.map((lifecycle) => ({
            key: lifecycle,
            label: lifecycle === "all" ? "All" : lifecycle === "current" ? "Current" : "Historical",
            count: count({ lifecycle }),
            href: hrefFor({ lifecycle })
          }))}
        />
      </FilterGroup>
    </div>
  );
}
