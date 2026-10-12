import { ArrowRight, Network } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { Card } from "../ui/card";
import { EmptyState } from "../ui/states";

function Step({
  number,
  title,
  children,
  href,
  cta
}: {
  number: number;
  title: string;
  children: ReactNode;
  href?: string;
  cta?: string;
}): ReactElement {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text tabular-nums">
        {number}
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="text-sm leading-relaxed text-muted">{children}</p>
      {href && cta ? (
        <Link
          href={href}
          className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-accent-text hover:underline"
        >
          {cta}
          <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </li>
  );
}

/** Shown when no relationship proposals exist at all: explains where they come from and how to create one. */
export function RelationshipsEmpty({ unsupported }: { unsupported: number }): ReactElement {
  return (
    <Card>
      <EmptyState
        icon={Network}
        title="No relationship proposals yet"
        description="Proposals are created from accepted broker and originator relationship candidates found in broker emails. The seeded demo documents contain none, so this lane starts empty."
        className="pb-6"
      />
      <ol className="grid gap-3 px-4 pb-5 sm:px-6 md:grid-cols-3">
        <Step number={1} title="Upload a broker email" href="/intake" cta="Open Intake">
          Add an <code className="rounded bg-subtle px-1 font-mono text-xs">.eml</code> on Intake, for example{" "}
          <code className="rounded bg-subtle px-1 font-mono text-xs break-all">
            tests/fixtures/normalization/email/sample-broker.eml
          </code>
          .
        </Step>
        <Step number={2} title="Accept its relationship candidate" href="/review?type=relationship" cta="Open Review">
          Extraction finds who brokers or originated the asset. Accept that relationship candidate on Review to make it
          accepted truth.
        </Step>
        <Step number={3} title="Attach it here">
          REMI proposes matching canonical assets and organizations with the signals behind each match. Pick one of each
          and attach.
        </Step>
      </ol>
      {unsupported > 0 ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted sm:px-6">
          {unsupported} accepted relationship record{unsupported === 1 ? " uses a field" : "s use fields"} this lane
          does not reconcile.
        </p>
      ) : null}
    </Card>
  );
}
