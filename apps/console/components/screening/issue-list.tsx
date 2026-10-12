import { ArrowRight, ArrowUpRight, ChevronDown, CircleCheck } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/states";
import type { IssueGroup, IssueItem } from "./issues";
import { ISSUE_GROUP } from "./labels";

const VISIBLE_PER_GROUP = 4;

const ICON_TONE = {
  danger: "bg-danger-soft text-danger-text",
  warning: "bg-warning-soft text-warning-text"
} as const;

function IssueRow({ item }: { item: IssueItem }): ReactElement {
  return (
    <li>
      <Link
        href={item.href}
        className="group flex items-start gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{item.title}</span>
          <span className="block truncate text-xs text-muted">{item.detail}</span>
        </span>
        {item.meta ? (
          item.meta.tone ? (
            <Badge tone={item.meta.tone} className="mt-0.5 hidden sm:inline-flex">
              {item.meta.text}
            </Badge>
          ) : (
            <span
              className={cn(
                "mt-0.5 hidden max-w-[12rem] shrink-0 truncate text-xs text-muted sm:block",
                item.meta.strong && "font-medium tabular-nums text-fg"
              )}
            >
              {item.meta.text}
            </span>
          )
        ) : null}
        <ArrowRight className="mt-1 size-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </Link>
    </li>
  );
}

function IssueGroupSection({ group }: { group: IssueGroup }): ReactElement {
  const meta = ISSUE_GROUP[group.kind];
  const Icon = meta.icon;
  const shown = group.items.slice(0, VISIBLE_PER_GROUP);
  const rest = group.items.slice(VISIBLE_PER_GROUP);
  const iconTone = meta.tone === "danger" ? ICON_TONE.danger : ICON_TONE.warning;

  return (
    <section className="px-2 py-3 sm:px-3">
      <header className="flex items-center gap-2.5 px-2">
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", iconTone)}>
          <Icon className="size-3.5" />
        </span>
        <h3 className="min-w-0 truncate text-sm font-medium text-fg">{meta.label}</h3>
        <span className="text-xs text-faint tabular-nums">{group.items.length}</span>
        <Link
          href={meta.href}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent-text hover:bg-accent-soft"
        >
          {meta.action} <ArrowUpRight className="size-3" />
        </Link>
      </header>
      <ul className="mt-1.5 pl-6 sm:pl-8">
        {shown.map((item) => (
          <IssueRow key={item.id} item={item} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="group/more pl-6 sm:pl-8">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 transition-transform group-open/more:rotate-180" />
            <span className="group-open/more:hidden">Show {rest.length} more</span>
            <span className="hidden group-open/more:inline">Show fewer</span>
          </summary>
          <ul>
            {rest.map((item) => (
              <IssueRow key={item.id} item={item} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function IssueList({ groups }: { groups: IssueGroup[] }): ReactElement {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Needs attention"
        description={
          total === 0
            ? "Nothing is waiting on an operator."
            : `${total} open item${total === 1 ? "" : "s"} across ${groups.length} lane${groups.length === 1 ? "" : "s"}, most blocking first`
        }
      />
      {total === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing is blocking this document"
          description="Every candidate is reviewed and every identity and relationship is reconciled."
        />
      ) : (
        <div className="divide-y divide-border">
          {groups.map((group) => (
            <IssueGroupSection key={group.kind} group={group} />
          ))}
        </div>
      )}
    </Card>
  );
}
