import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/cn";

export type Tone = "neutral" | "accent" | "danger" | "warning" | "success" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-subtle text-muted ring-border",
  accent: "bg-accent-soft text-accent-text ring-accent/20",
  danger: "bg-danger-soft text-danger-text ring-danger/20",
  warning: "bg-warning-soft text-warning-text ring-warning/25",
  success: "bg-success-soft text-success-text ring-success/20",
  info: "bg-info-soft text-info-text ring-info-text/20"
};

export function Badge({
  tone = "neutral",
  children,
  className
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Map pipeline and review states onto a small, consistent palette. */
export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "completed":
    case "accepted":
    case "edited_and_accepted":
    case "resolved":
    case "supported":
      return "success";
    case "processing":
    case "running":
    case "queued":
    case "registered":
      return "info";
    case "completed_with_warnings":
    case "pending_review":
    case "open":
    case "best_effort":
    case "deferred":
      return "warning";
    case "failed":
    case "rejected":
    case "unsupported":
      return "danger";
    default:
      return "neutral";
  }
}
