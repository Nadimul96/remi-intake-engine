import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 grid size-10 place-items-center rounded-lg border border-border bg-surface text-muted">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message
}: {
  title?: string;
  message: string;
}): ReactElement {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="font-medium text-danger-text">{title}</p>
        <p className="mt-0.5 break-words text-danger-text/80">{message}</p>
        <p className="mt-2 text-xs text-danger-text/70">
          Start the stack with <code className="font-mono">docker compose up --build</code>, or run{" "}
          <code className="font-mono">pnpm doctor</code> to see what is missing.
        </p>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }): ReactElement {
  return <div className={cn("animate-pulse rounded-md bg-subtle", className)} />;
}

export function PageSkeleton(): ReactElement {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["a", "b", "c", "d"].map((key) => (
          <Skeleton key={key} className="h-20" />
        ))}
      </div>
      <div className="space-y-2">
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <Skeleton key={key} className="h-11" />
        ))}
      </div>
    </div>
  );
}
