import type { IntakeDetail, TimelineEvent } from "@remi/domain";
import { Check, Minus, X } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";

type StepState = "done" | "skipped" | "failed" | "active" | "pending";

interface StepDefinition {
  key: string;
  label: string;
  started: TimelineEvent["eventType"][];
  done: TimelineEvent["eventType"][];
  skipped?: TimelineEvent["eventType"][];
  failed?: TimelineEvent["eventType"][];
}

const STEPS: StepDefinition[] = [
  { key: "stored", label: "Stored", started: ["ingestion_processing"], done: ["artifact_promoted"] },
  {
    key: "inspected",
    label: "Inspected",
    started: ["inspection_started"],
    done: ["inspection_completed"],
    failed: ["inspection_failed"]
  },
  {
    key: "normalized",
    label: "Normalized",
    started: ["normalization_started"],
    done: ["normalization_completed"],
    skipped: ["normalization_skipped"],
    failed: ["normalization_failed"]
  },
  {
    key: "anchored",
    label: "Anchored",
    started: ["anchoring_started"],
    done: ["anchoring_completed"],
    skipped: ["anchoring_skipped"],
    failed: ["anchoring_failed"]
  },
  {
    key: "extracted",
    label: "Extracted",
    started: ["candidate_extraction_started"],
    done: ["candidate_extraction_completed"],
    skipped: ["candidate_extraction_skipped"],
    failed: ["candidate_extraction_failed"]
  }
];

function stepState(step: StepDefinition, seen: Set<string>, settled: boolean): StepState {
  const any = (types: string[] | undefined): boolean => (types ?? []).some((type) => seen.has(type));
  if (any(step.failed)) return "failed";
  if (any(step.done)) return "done";
  if (any(step.skipped)) return "skipped";
  if (any(step.started)) return settled ? "failed" : "active";
  return "pending";
}

const DOT: Record<StepState, string> = {
  done: "bg-success-soft text-success-text ring-success/30",
  skipped: "bg-subtle text-muted ring-border",
  failed: "bg-danger-soft text-danger-text ring-danger/30",
  active: "bg-info-soft text-info-text ring-info-text/30",
  pending: "bg-surface text-faint ring-border"
};

function StepDot({ state }: { state: StepState }): ReactElement {
  return (
    <span className={cn("grid size-6 place-items-center rounded-full ring-1 ring-inset", DOT[state])}>
      {state === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
      {state === "failed" ? <X className="size-3.5" strokeWidth={2.5} /> : null}
      {state === "skipped" ? <Minus className="size-3.5" strokeWidth={2.5} /> : null}
      {state === "active" ? <span className="size-2 animate-pulse rounded-full bg-info-text" /> : null}
      {state === "pending" ? <span className="size-1.5 rounded-full bg-border-strong" /> : null}
    </span>
  );
}

/** Stage-by-stage progress reconstructed from the event timeline, so skipped and failed stages stay visible. */
export function PipelineSteps({ detail }: { detail: IntakeDetail }): ReactElement {
  const seen = new Set<string>(detail.timeline.map((event) => event.eventType));
  const settled = detail.status === "completed" || detail.status === "failed";
  const states = STEPS.map((step) => stepState(step, seen, settled));

  return (
    <ol className="grid grid-cols-5 gap-1">
      {STEPS.map((step, index) => {
        const state = states[index];
        const nextReached = index < STEPS.length - 1 && states[index + 1] !== "pending";
        return (
          <li key={step.key} className="relative flex flex-col items-center gap-1.5 text-center">
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-3 left-[calc(50%+0.875rem)] h-px w-[calc(100%-1.75rem+0.25rem)]",
                  nextReached ? "bg-border-strong" : "bg-border"
                )}
              />
            ) : null}
            <StepDot state={state} />
            <span className={cn("text-[11px] font-medium", state === "pending" ? "text-faint" : "text-fg")}>
              {step.label}
            </span>
            <span className="sr-only">{state}</span>
          </li>
        );
      })}
    </ol>
  );
}
