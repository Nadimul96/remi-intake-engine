"use client";

import type { RegisterIntakeResponse } from "@remi/domain";
import { CircleCheck, CircleX, CloudUpload, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, type ReactElement, useState } from "react";

import { postJson } from "../../lib/client-api";
import { cn } from "../../lib/cn";
import { formatBytes } from "../../lib/format";
import { Button } from "../ui/button";

type UploadPhase = "signing" | "uploading" | "registering" | "registered" | "failed";

interface UploadEntry {
  key: string;
  fileName: string;
  sizeBytes: number;
  phase: UploadPhase;
  message: string | null;
  sourceItemId: string | null;
}

interface PresignResponse {
  uploadKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

const PHASE_LABEL: Record<UploadPhase, string> = {
  signing: "Preparing",
  uploading: "Uploading",
  registering: "Registering",
  registered: "Registered",
  failed: "Failed"
};

/** Browser upload path: sign a PUT, send the bytes straight to object storage, then register the staged key. */
async function uploadFile(file: File, onPhase: (phase: UploadPhase) => void): Promise<RegisterIntakeResponse> {
  const contentType = file.type || "application/octet-stream";
  const descriptor = { fileName: file.name, contentType, sizeBytes: file.size };

  onPhase("signing");
  const presign = await postJson<PresignResponse>("/uploads/presign", descriptor);

  onPhase("uploading");
  const stored = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.headers, body: file });
  if (!stored.ok) {
    throw new Error(`Object storage rejected the upload (${stored.status}).`);
  }

  onPhase("registering");
  return postJson<RegisterIntakeResponse>("/intake/register", { ...descriptor, uploadKey: presign.uploadKey });
}

function PhaseIcon({ phase }: { phase: UploadPhase }): ReactElement {
  if (phase === "registered") {
    return <CircleCheck className="size-4 shrink-0 text-success-text" />;
  }
  if (phase === "failed") {
    return <CircleX className="size-4 shrink-0 text-danger-text" />;
  }
  return <LoaderCircle className="size-4 shrink-0 animate-spin text-info-text" />;
}

function UploadRow({ entry }: { entry: UploadEntry }): ReactElement {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <PhaseIcon phase={entry.phase} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg" title={entry.fileName}>
          {entry.fileName}
        </p>
        <p className={cn("truncate text-xs", entry.phase === "failed" ? "text-danger-text" : "text-muted")}>
          {entry.phase === "failed" && entry.message ? entry.message : PHASE_LABEL[entry.phase]}
          <span className="text-faint"> · {formatBytes(entry.sizeBytes)}</span>
        </p>
      </div>
      {entry.sourceItemId ? (
        <Link
          href={`/intake?id=${encodeURIComponent(entry.sourceItemId)}`}
          scroll={false}
          className="shrink-0 text-xs font-medium text-accent-text hover:underline"
        >
          View
        </Link>
      ) : null}
    </li>
  );
}

export function UploadPanel(): ReactElement {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const busy = entries.some((entry) => entry.phase !== "registered" && entry.phase !== "failed");

  const patch = (key: string, next: Partial<UploadEntry>): void => {
    setEntries((current) => current.map((entry) => (entry.key === key ? { ...entry, ...next } : entry)));
  };

  const ingest = async (fileList: FileList | null): Promise<void> => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }
    const batch = files.map((file, index) => ({
      file,
      entry: {
        key: `${Date.now()}-${index}-${file.name}`,
        fileName: file.name,
        sizeBytes: file.size,
        phase: "signing" as UploadPhase,
        message: null,
        sourceItemId: null
      }
    }));
    setEntries((current) => [...batch.map((item) => item.entry), ...current]);

    let lastRegistered: string | null = null;
    for (const { file, entry } of batch) {
      if (file.size === 0) {
        patch(entry.key, { phase: "failed", message: "Empty files cannot be ingested." });
        continue;
      }
      try {
        const registration = await uploadFile(file, (phase) => patch(entry.key, { phase }));
        lastRegistered = registration.sourceItemId;
        patch(entry.key, { phase: "registered", sourceItemId: registration.sourceItemId });
        router.refresh();
      } catch (reason) {
        patch(entry.key, {
          phase: "failed",
          message: reason instanceof Error ? reason.message : "The upload failed."
        });
      }
    }
    if (lastRegistered) {
      router.push(`/intake?id=${encodeURIComponent(lastRegistered)}`, { scroll: false });
    }
  };

  const stop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-raised shadow-card">
      <label
        htmlFor="intake-upload"
        onDragEnter={(event) => {
          stop(event);
          setDragging(true);
        }}
        onDragOver={stop}
        onDragLeave={(event) => {
          stop(event);
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          stop(event);
          setDragging(false);
          void ingest(event.dataTransfer.files);
        }}
        className={cn(
          "m-2 flex cursor-pointer focus-within:ring-2 focus-within:ring-accent flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-center transition-colors sm:flex-row sm:text-left",
          dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-subtle"
        )}
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-raised",
            dragging ? "text-accent-text" : "text-muted"
          )}
        >
          <CloudUpload className="size-5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">
            {dragging ? "Release to ingest" : "Drop files to ingest, or browse"}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            PDF, email, Excel, CSV and text are parsed and cited. Anything else is stored immutably and flagged.
          </span>
        </span>
        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-raised px-2.5 text-xs font-medium text-fg shadow-card">
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
          {busy ? "Uploading" : "Choose files"}
        </span>
      </label>
      <input
        id="intake-upload"
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          void ingest(event.target.files);
          event.target.value = "";
        }}
      />
      {entries.length > 0 ? (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-3 pt-2">
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">This session</p>
            <Button size="sm" variant="ghost" onClick={() => setEntries([])} disabled={busy}>
              Clear
            </Button>
          </div>
          <ul className="max-h-56 divide-y divide-border overflow-y-auto pb-1">
            {entries.map((entry) => (
              <UploadRow key={entry.key} entry={entry} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
