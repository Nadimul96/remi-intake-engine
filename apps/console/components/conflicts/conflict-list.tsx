import type { ConflictSummary } from "@remi/domain";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { KIND_LABEL } from "./labels";

const SEVERITY_DOT: Record<ConflictSummary["severity"], string> = {
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-border-strong"
};

export function ConflictList({
  conflicts,
  selectedId,
  hrefFor
}: {
  conflicts: ConflictSummary[];
  selectedId: string | null;
  hrefFor: (id: string) => string;
}): ReactElement {
  return (
    <ul className="divide-y divide-border">
      {conflicts.map((conflict) => {
        const selected = conflict.id === selectedId;
        return (
          <li key={conflict.id}>
            <Link
              href={hrefFor(conflict.id)}
              scroll={false}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "group flex items-start gap-3 px-4 py-3 transition-colors",
                selected ? "bg-accent-soft/60" : "hover:bg-surface",
                conflict.status !== "open" && "opacity-70"
              )}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[conflict.severity])} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-medium text-fg">{conflict.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={selected ? "accent" : "neutral"}>{KIND_LABEL[conflict.kind]}</Badge>
                  {conflict.status !== "open" ? <Badge tone="success">{conflict.status}</Badge> : null}
                  <span className="text-xs text-faint">
                    {conflict.sides.length} {conflict.kind === "name_variants" ? "names" : "readings"}
                  </span>
                </span>
              </span>
              <ChevronRight
                className={cn(
                  "mt-1 size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5",
                  selected && "text-accent"
                )}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
