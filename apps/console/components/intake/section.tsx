import type { ParserWarning } from "@remi/domain";
import { AlertTriangle } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

/** One titled block inside the intake detail card. */
export function Section({
  title,
  aside,
  children
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
        {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Warnings({ warnings }: { warnings: ParserWarning[] }): ReactElement | null {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1.5 rounded-lg bg-warning-soft px-3 py-2.5">
      {warnings.map((warning) => (
        <li key={`${warning.code}-${warning.message}`} className="flex items-start gap-2 text-sm text-warning-text">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">
            {warning.message} <code className="font-mono text-xs opacity-80">{warning.code}</code>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReasonCodes({ codes }: { codes: string[] }): ReactElement | null {
  if (codes.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((code) => (
        <code key={code} className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">
          {code}
        </code>
      ))}
    </div>
  );
}
