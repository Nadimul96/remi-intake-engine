import type { DealScreeningWorkbench, ScreeningLaneStatus } from "@remi/domain";
import { ArrowUpRight, Layers, Link2, ListChecks, type LucideIcon, Network } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { ProgressBar } from "./progress-bar";

function LaneBadge({ lane }: { lane: ScreeningLaneStatus }): ReactElement {
  if (lane.currentTotal === 0) {
    return <Badge>None found</Badge>;
  }
  if (lane.unresolvedCurrent === 0) {
    return <Badge tone="success">Complete</Badge>;
  }
  return <Badge tone="warning">{lane.unresolvedCurrent} open</Badge>;
}

function LaneCard({
  title,
  icon: Icon,
  href,
  action,
  badge,
  value,
  children
}: {
  title: string;
  icon: LucideIcon;
  href: string;
  action: string;
  badge: ReactNode;
  value: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <Card className="flex min-w-0 flex-col p-3 sm:p-4">
      <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{title}</span>
      </span>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-fg">{value}</p>
        {badge}
      </div>
      <div className="mt-2 flex-1 space-y-2">{children}</div>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-accent-text hover:underline"
      >
        {action} <ArrowUpRight className="size-3" />
      </Link>
    </Card>
  );
}

function Fraction({ lane }: { lane: ScreeningLaneStatus }): ReactElement {
  return (
    <>
      {lane.resolvedCurrent}
      <span className="text-base font-normal text-faint">/{lane.currentTotal}</span>
    </>
  );
}

function SubLane({ label, lane }: { label: string; lane: ScreeningLaneStatus }): ReactElement {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className="tabular-nums">
          {lane.resolvedCurrent}/{lane.currentTotal}
        </span>
      </div>
      <ProgressBar
        className="mt-1"
        value={lane.resolvedCurrent}
        total={lane.currentTotal}
        label={`${label} resolved`}
      />
    </div>
  );
}

const TRUTH_TYPES = [
  { key: "fact", label: "Facts", dot: "bg-accent" },
  { key: "classification", label: "Classifications", dot: "bg-success" },
  { key: "relationship", label: "Relationships", dot: "bg-warning" }
] as const;

/** One cell per accepted record, coloured by record type, so small counts read at a glance. */
function TruthUnits({ counts }: { counts: DealScreeningWorkbench["acceptedTruth"]["counts"] }): ReactElement {
  const cells = TRUTH_TYPES.flatMap((type) =>
    Array.from({ length: Math.min(counts[type.key], 40) }, (_, index) => ({
      id: `${type.key}-${index}`,
      dot: type.dot
    }))
  );
  return (
    <>
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-subtle" aria-hidden="true">
        {cells.map((cell) => (
          <span key={cell.id} className={cn("h-full flex-1", cell.dot)} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {TRUTH_TYPES.map((type) => (
          <li key={type.key} className="inline-flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", type.dot)} />
            {type.label} <span className="tabular-nums text-faint">{counts[type.key]}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function LaneCards({ workbench }: { workbench: DealScreeningWorkbench }): ReactElement {
  const signals = workbench.candidateSignals;
  const { assetIdentity, organizationIdentity, relationships } = workbench.readiness;
  const reviewed = signals.accepted + signals.editedAndAccepted + signals.rejected;
  const candidateLane: ScreeningLaneStatus = {
    currentTotal: reviewed + signals.pendingReview,
    resolvedCurrent: reviewed,
    unresolvedCurrent: signals.pendingReview
  };
  const entityLane: ScreeningLaneStatus = {
    currentTotal: assetIdentity.currentTotal + organizationIdentity.currentTotal,
    resolvedCurrent: assetIdentity.resolvedCurrent + organizationIdentity.resolvedCurrent,
    unresolvedCurrent: assetIdentity.unresolvedCurrent + organizationIdentity.unresolvedCurrent
  };
  const historical = workbench.relationships.historicalItems.length;

  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Readiness lanes">
      <LaneCard
        title="Candidate review"
        icon={ListChecks}
        href="/review"
        action="Review queue"
        badge={<LaneBadge lane={candidateLane} />}
        value={<Fraction lane={candidateLane} />}
      >
        <ProgressBar value={reviewed} total={candidateLane.currentTotal} label="Candidates reviewed" />
        <p className="text-[11px] text-muted tabular-nums">
          {signals.accepted + signals.editedAndAccepted} accepted
          {signals.editedAndAccepted > 0 ? ` (${signals.editedAndAccepted} edited)` : ""} · {signals.rejected} rejected
        </p>
      </LaneCard>

      <LaneCard
        title="Accepted truth"
        icon={Layers}
        href="/truth"
        action="Truth browser"
        badge={
          workbench.acceptedTruth.counts.all > 0 ? <Badge tone="success">Recorded</Badge> : <Badge>None yet</Badge>
        }
        value={workbench.acceptedTruth.counts.all}
      >
        <TruthUnits counts={workbench.acceptedTruth.counts} />
      </LaneCard>

      <LaneCard
        title="Entity links"
        icon={Link2}
        href="/entities"
        action="Reconcile entities"
        badge={<LaneBadge lane={entityLane} />}
        value={<Fraction lane={entityLane} />}
      >
        <SubLane label="Assets" lane={assetIdentity} />
        <SubLane label="Organizations" lane={organizationIdentity} />
      </LaneCard>

      <LaneCard
        title="Relationships"
        icon={Network}
        href="/relationships"
        action="Review relationships"
        badge={<LaneBadge lane={relationships} />}
        value={<Fraction lane={relationships} />}
      >
        <ProgressBar
          value={relationships.resolvedCurrent}
          total={relationships.currentTotal}
          label="Relationships resolved"
        />
        <p className="text-[11px] text-muted tabular-nums">
          {relationships.currentTotal === 0
            ? "No asset-organization links asserted"
            : `${relationships.unresolvedCurrent} awaiting a decision`}
          {historical > 0 ? ` · ${historical} historical` : ""}
        </p>
      </LaneCard>
    </section>
  );
}
