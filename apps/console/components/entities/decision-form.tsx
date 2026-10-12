"use client";

import type { EntityResolutionDecisionRequest, EntityResolutionProposalSummary } from "@remi/domain";
import { Check, Link2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useState, useTransition } from "react";

import { postJson } from "../../lib/client-api";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";

export interface AttachOption {
  id: string;
  displayName: string;
  /** Why this entity is offered, for example "Exact name" or "In catalog". */
  hint: string;
}

type Mode = "create" | "attach";

const inputClass =
  "mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none";

function ModeButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  title,
  description
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof Plus;
  title: string;
  description: string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 flex-1 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-accent bg-accent-soft/60" : "border-border bg-raised hover:bg-surface"
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-accent-text" : "text-muted")} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </button>
  );
}

export function DecisionForm({
  proposal,
  options,
  onCancel
}: {
  proposal: EntityResolutionProposalSummary;
  options: AttachOption[];
  onCancel?: () => void;
}): ReactElement {
  const router = useRouter();
  const suggested = proposal.resolvedEntityId ?? proposal.targetEntityId ?? options[0]?.id ?? null;
  const prefersAttach = proposal.proposalKind === "attach_to_existing" || proposal.resolvedEntityId !== null;
  const [mode, setMode] = useState<Mode>(prefersAttach && suggested ? "attach" : "create");
  const [targetId, setTargetId] = useState<string | null>(suggested);
  const [displayName, setDisplayName] = useState(proposal.proposedDisplayName);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastAction, setLastAction] = useState<"accept" | "reject" | null>(null);

  const canAccept = mode === "create" ? displayName.trim().length > 0 : targetId !== null;

  const submit = (action: "accept" | "reject"): void => {
    setError(null);
    setLastAction(action);
    const trimmedNote = note.trim() || null;
    let body: EntityResolutionDecisionRequest;
    if (action === "reject") {
      body = { action, note: trimmedNote };
    } else if (mode === "create") {
      body = { action, note: trimmedNote, displayName: displayName.trim(), entityType: proposal.entityType };
    } else {
      body = { action, note: trimmedNote, targetEntityId: targetId ?? undefined, entityType: proposal.entityType };
    }
    startTransition(async () => {
      try {
        await postJson(`/entities/reconciliation/${encodeURIComponent(proposal.id)}/decision`, body);
        setNote("");
        onCancel?.();
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The decision could not be saved.");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <ModeButton
          active={mode === "create"}
          onClick={() => setMode("create")}
          icon={Plus}
          title="Create new entity"
          description="This name is a property not yet in the catalog."
        />
        <ModeButton
          active={mode === "attach"}
          disabled={options.length === 0}
          onClick={() => setMode("attach")}
          icon={Link2}
          title="Attach to existing"
          description={
            options.length === 0 ? "No canonical entities exist yet." : "Record this name as an alias of an entity."
          }
        />
      </div>

      {mode === "create" ? (
        <label className="block">
          <span className="text-xs font-medium text-muted">Canonical name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={255}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-faint">
            Use the full property name; &ldquo;{proposal.proposedDisplayName}&rdquo; is kept as an observed alias.
          </span>
        </label>
      ) : (
        <fieldset>
          <legend className="text-xs font-medium text-muted">Canonical entity</legend>
          <ul className="mt-1 divide-y divide-border overflow-hidden rounded-md border border-border">
            {options.map((option) => (
              <li key={option.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors",
                    targetId === option.id ? "bg-accent-soft/50" : "hover:bg-surface"
                  )}
                >
                  <input
                    type="radio"
                    name={`target-${proposal.id}`}
                    checked={targetId === option.id}
                    onChange={() => setTargetId(option.id)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{option.displayName}</span>
                  <span className="shrink-0 text-xs text-faint">{option.hint}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <label className="block">
        <span className="text-xs font-medium text-muted">Note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Optional. Why this name belongs to this entity, kept in the reconciliation history"
          className={cn(inputClass, "resize-y")}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => submit("accept")} disabled={pending || !canAccept}>
          <Check className="size-4" />
          {pending && lastAction === "accept"
            ? "Saving..."
            : mode === "create"
              ? "Accept and create entity"
              : "Accept and attach"}
        </Button>
        <Button variant="danger" onClick={() => submit("reject")} disabled={pending}>
          <X className="size-4" />
          {pending && lastAction === "reject" ? "Rejecting..." : "Reject"}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger-text">{error}</p> : null}
    </div>
  );
}
