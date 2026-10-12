"use client";

import type { ProvenanceAnchorSummary, ProvenanceView } from "@remi/domain";
import { FileSpreadsheet, FileText } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";

import { remiFetch } from "../../lib/client-api";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Sheet } from "../ui/sheet";
import { ErrorState, Skeleton } from "../ui/states";

interface Cell {
  column: number;
  ref: string;
  text: string;
}

export interface ProvenanceTarget {
  anchorIds: string[];
  /** What is being traced, shown in the panel header ("$43,200"). */
  label: string;
  /** Cell reference to outline ("N20"), when the citation points at one cell of a row. */
  cellRef?: string | null;
  /** Text to mark inside the cited line. */
  highlight?: string | null;
}

function cellsOf(anchor: ProvenanceAnchorSummary): Cell[] {
  const cells = anchor.metadata.cells;
  return Array.isArray(cells) ? (cells as Cell[]) : [];
}

function Mark({ text, highlight }: { text: string; highlight?: string | null }): ReactElement {
  const index = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  if (!highlight || index < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-highlight px-0.5 text-fg">{text.slice(index, index + highlight.length)}</mark>
      {text.slice(index + highlight.length)}
    </>
  );
}

function RowGrid({ view, cellRef }: { view: ProvenanceView; cellRef?: string | null }): ReactElement {
  const citedCell = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    citedCell.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);
  const rows = view.context.length > 0 ? view.context : [view.anchor];
  const allColumns = [...new Set(rows.flatMap((row) => cellsOf(row).map((cell) => cell.column)))].sort((a, b) => a - b);
  // Wide sheets (a T-12 has 14 columns) show the label column plus a window around the cited cell.
  const citedColumn = cellsOf(view.anchor).find((cell) => cell.ref === cellRef)?.column ?? null;
  const columns =
    citedColumn !== null && allColumns.length > 6
      ? allColumns.filter((column) => column === allColumns[0] || Math.abs(column - citedColumn) <= 2)
      : allColumns;
  const letters = (ref: string): string => ref.replace(/\d+$/, "");

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="bg-surface text-faint">
            <th className="sticky left-0 z-10 w-10 border-r border-b border-border bg-surface px-2 py-1 text-right font-normal" />
            {columns.map((column, index) => {
              const sample = rows.flatMap(cellsOf).find((cell) => cell.column === column);
              const gap = index > 0 && column - columns[index - 1] > 1;
              return (
                <th key={column} className="border-b border-border px-2 py-1 text-left font-normal">
                  {gap ? <span className="mr-2 text-faint">…</span> : null}
                  {sample ? letters(sample.ref) : column}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cited = row.id === view.anchor.id;
            const byColumn = new Map(cellsOf(row).map((cell) => [cell.column, cell]));
            return (
              <tr key={row.id} className={cn(cited && "bg-accent-soft/60")}>
                <td className="sticky left-0 z-10 border-r border-border bg-raised px-2 py-1 text-right text-faint">
                  {String(row.locator.rowNumber)}
                </td>
                {columns.map((column) => {
                  const cell = byColumn.get(column);
                  const isCited = cited && cell && cellRef && cell.ref === cellRef;
                  return (
                    <td
                      key={column}
                      ref={isCited ? citedCell : undefined}
                      className={cn(
                        "px-2 py-1 whitespace-nowrap text-fg",
                        isCited && "rounded-sm bg-highlight font-semibold ring-2 ring-warning ring-inset"
                      )}
                    >
                      {cell?.text ?? ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LineList({ view, highlight }: { view: ProvenanceView; highlight?: string | null }): ReactElement {
  const lines = view.context.length > 0 ? view.context : [view.anchor];
  return (
    <ol className="overflow-hidden rounded-lg border border-border bg-surface font-mono text-xs leading-6">
      {lines.map((line) => {
        const cited = line.id === view.anchor.id;
        return (
          <li key={line.id} className={cn("flex gap-3 px-3", cited && "bg-accent-soft/70")}>
            <span className="w-6 shrink-0 text-right text-faint select-none">
              {String(line.locator.lineNumber ?? "")}
            </span>
            <span className={cn("min-w-0 break-words whitespace-pre-wrap", cited ? "text-fg" : "text-muted")}>
              {cited ? <Mark text={line.summary} highlight={highlight} /> : line.summary}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AnchorView({ anchorId, target }: { anchorId: string; target: ProvenanceTarget }): ReactElement {
  const [view, setView] = useState<ProvenanceView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setError(null);
    remiFetch<ProvenanceView>(`/provenance/${encodeURIComponent(anchorId)}`)
      .then((data) => {
        if (!cancelled) {
          setView(data);
        }
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setError(reason.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [anchorId]);

  if (error) {
    return <ErrorState title="Could not load the source" message={error} />;
  }
  if (!view) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const isRow = view.anchor.anchorKind === "worksheet_row";
  const isLine = view.anchor.anchorKind === "text_line";
  const Icon = isRow ? FileSpreadsheet : FileText;

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className="size-4 shrink-0 text-muted" />
        <span className="truncate font-medium text-fg">{view.artifact.fileName}</span>
        <Badge className="shrink-0">{view.anchor.title}</Badge>
      </div>
      {isRow ? (
        <RowGrid view={view} cellRef={target.cellRef} />
      ) : isLine ? (
        <LineList view={view} highlight={target.highlight} />
      ) : (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm text-fg">{view.anchor.summary}</p>
      )}
    </div>
  );
}

/** Side panel that shows the exact page line, worksheet cell or message a value was read from. */
export function ProvenancePanel({
  target,
  onClose
}: {
  target: ProvenanceTarget | null;
  onClose: () => void;
}): ReactElement | null {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={target ? `Source of ${target.label}` : ""}
      description={
        target && target.anchorIds.length > 1 ? `${target.anchorIds.length} cited anchors` : "Cited provenance anchor"
      }
    >
      {target ? (
        <div className="space-y-6">
          {target.anchorIds.map((anchorId) => (
            <AnchorView key={anchorId} anchorId={anchorId} target={target} />
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}

/** `Sheet!N20` -> `N20`; line hints carry no cell. */
export function cellRefFromHint(hint: string | null | undefined): string | null {
  const match = hint?.match(/!([A-Z]{1,3}\d+)$/);
  return match ? match[1] : null;
}
