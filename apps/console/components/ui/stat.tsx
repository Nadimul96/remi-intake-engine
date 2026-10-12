import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/cn";

export function Stat({
  label,
  value,
  hint,
  tone = "default"
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "danger" | "warning";
}): ReactElement {
  return (
    <div className="rounded-xl border border-border bg-raised px-4 py-3 shadow-card">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
          tone === "danger" ? "text-danger-text" : tone === "warning" ? "text-warning-text" : "text-fg"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-xs text-faint">{hint}</p> : null}
    </div>
  );
}
