import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";

/** A row of filter links; state lives in the URL so filtered views are shareable. */
export function Segmented({
  items,
  active
}: {
  items: { href: string; key: string; label: string; count?: number }[];
  active: string;
}): ReactElement {
  return (
    <nav className="inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-0.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          scroll={false}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
            item.key === active ? "bg-raised text-fg shadow-card ring-1 ring-border" : "text-muted hover:text-fg"
          )}
        >
          {item.label}
          {item.count !== undefined ? <span className="tabular-nums text-faint">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
