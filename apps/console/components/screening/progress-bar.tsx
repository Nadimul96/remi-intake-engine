import type { ReactElement } from "react";

import { cn } from "../../lib/cn";

/** Thin native meter styled with tokens; an empty lane (total 0) renders as a flat track. */
export function ProgressBar({
  value,
  total,
  label,
  className
}: {
  value: number;
  total: number;
  label: string;
  className?: string;
}): ReactElement {
  const complete = total > 0 && value >= total;
  return (
    <progress
      aria-label={label}
      value={total === 0 ? 0 : value}
      max={Math.max(total, 1)}
      className={cn(
        "block h-1.5 w-full appearance-none overflow-hidden rounded-full border-0 bg-subtle",
        "[&::-webkit-progress-bar]:bg-subtle [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-all",
        complete
          ? "[&::-moz-progress-bar]:bg-success [&::-webkit-progress-value]:bg-success"
          : "[&::-moz-progress-bar]:bg-accent [&::-webkit-progress-value]:bg-accent",
        className
      )}
    />
  );
}
