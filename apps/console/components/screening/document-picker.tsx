"use client";

import type { IntakeQueueItem } from "@remi/domain";
import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactElement, useMemo, useState, useTransition } from "react";

import { cn } from "../../lib/cn";
import { formatRelative, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";
import { Card } from "../ui/card";
import { documentIcon } from "./labels";

export type PickerDocument = Pick<IntakeQueueItem, "id" | "fileName" | "contentType" | "status" | "updatedAt">;

function hrefFor(id: string): string {
  return `/screening?id=${encodeURIComponent(id)}`;
}

/** Compact select for narrow screens. */
function MobilePicker({ documents, selectedId }: { documents: PickerDocument[]; selectedId: string }): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="block lg:hidden">
      <span className="text-xs font-medium text-muted">Document</span>
      <span className="relative mt-1 block">
        <select
          value={selectedId}
          disabled={pending}
          onChange={(event) => {
            const id = event.target.value;
            startTransition(() => router.push(hrefFor(id), { scroll: false }));
          }}
          className="block h-10 w-full appearance-none truncate rounded-md border border-border bg-raised py-2 pr-9 pl-3 text-sm text-fg shadow-card focus:border-accent focus:outline-none disabled:opacity-60"
        >
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.fileName}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

/** Searchable list for wide screens; selection lives in the URL so a document view is shareable. */
function DesktopPicker({ documents, selectedId }: { documents: PickerDocument[]; selectedId: string }): ReactElement {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? documents.filter((document) => document.fileName.toLowerCase().includes(needle)) : documents;
  }, [documents, query]);

  return (
    <Card className="hidden overflow-hidden lg:sticky lg:top-6 lg:block">
      <div className="border-b border-border p-2">
        <label className="relative block">
          <span className="sr-only">Filter documents</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter documents"
            className="block h-8 w-full rounded-md border border-border bg-bg pr-2 pl-8 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </label>
      </div>
      <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted tabular-nums">
        {visible.length === documents.length
          ? `${documents.length} document${documents.length === 1 ? "" : "s"}`
          : `${visible.length} of ${documents.length}`}
      </p>
      {visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted">No file names match “{query.trim()}”.</p>
      ) : (
        <ul className="max-h-[calc(100dvh-13rem)] divide-y divide-border overflow-y-auto">
          {visible.map((document) => {
            const selected = document.id === selectedId;
            const Icon = documentIcon(document.contentType, document.fileName);
            return (
              <li key={document.id}>
                <Link
                  href={hrefFor(document.id)}
                  scroll={false}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2 transition-colors",
                    selected ? "bg-accent-soft/60" : "hover:bg-surface"
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-accent-text" : "text-faint")} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn("block truncate text-[13px]", selected ? "font-medium text-fg" : "text-fg")}
                      title={document.fileName}
                    >
                      {document.fileName}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                      {document.status !== "completed" ? (
                        <Badge tone={statusTone(document.status)}>{humanize(document.status)}</Badge>
                      ) : null}
                      {formatRelative(document.updatedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function DocumentPicker({
  documents,
  selectedId
}: {
  documents: PickerDocument[];
  selectedId: string;
}): ReactElement {
  return (
    <>
      <MobilePicker documents={documents} selectedId={selectedId} />
      <DesktopPicker documents={documents} selectedId={selectedId} />
    </>
  );
}
