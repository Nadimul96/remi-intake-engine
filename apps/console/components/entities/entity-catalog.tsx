import { Boxes, Building2, Landmark } from "lucide-react";
import type { ReactElement } from "react";

import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/states";
import type { CatalogEntity } from "./catalog";

function EntityTile({ entity }: { entity: CatalogEntity }): ReactElement {
  const Icon = entity.entityType === "asset" ? Building2 : Landmark;
  return (
    <li className="min-w-0 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-raised text-accent">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg" title={entity.displayName}>
            {entity.displayName}
          </p>
          <p className="text-xs text-muted tabular-nums">
            {entity.mentions} linked mention{entity.mentions === 1 ? "" : "s"} · {entity.files} file
            {entity.files === 1 ? "" : "s"}
          </p>
        </div>
        <Badge className="capitalize">{entity.entityType}</Badge>
      </div>
      {entity.names.length > 0 ? (
        <div className="mt-2.5">
          <p className="text-[11px] font-medium tracking-wide text-faint uppercase">Known as</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {entity.names.map((name) => (
              <li
                key={name.name}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-raised px-1.5 py-0.5 text-xs text-fg"
              >
                {name.name}
                {name.mentions > 0 ? <span className="text-faint tabular-nums">{name.mentions}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function EntityCatalog({ entities, total }: { entities: CatalogEntity[]; total: number }): ReactElement {
  return (
    <Card>
      <CardHeader
        title="Canonical entities"
        description="The outcome of reconciliation: one record per real-world asset or organization, with every name it was seen under."
        actions={<span className="text-xs text-muted tabular-nums">{total} total</span>}
      />
      {entities.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No canonical entities yet"
          description="Accept a proposal below to create the first one. Later mentions of the same name will match it automatically."
          className="py-8"
        />
      ) : (
        <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {entities.map((entity) => (
            <EntityTile key={entity.id} entity={entity} />
          ))}
        </ul>
      )}
    </Card>
  );
}
