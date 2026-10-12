import type { ConflictSummary, DealScreeningWorkbench, ScreeningIssue } from "@remi/domain";

import { formatCandidateValue, humanize } from "../../lib/format";
import { KIND_LABEL } from "../conflicts/labels";
import type { Tone } from "../ui/badge";
import { CONFLICT_SEVERITY_TONE, fieldLabel, ISSUE_GROUP_ORDER, type IssueGroupKind, reviewHref } from "./labels";

export interface IssueItem {
  id: string;
  title: string;
  detail: string;
  /** Short right-aligned fact: the value under review, a proposal kind, a conflict kind. */
  meta?: { text: string; tone?: Tone; strong?: boolean };
  href: string;
}

export interface IssueGroup {
  kind: IssueGroupKind;
  items: IssueItem[];
}

/** Issue ids look like "candidate:candidate_123" or "asset-entity:entityprop_456". */
function targetId(issue: ScreeningIssue): string {
  const index = issue.id.indexOf(":");
  return index >= 0 ? issue.id.slice(index + 1) : issue.id;
}

/** Enrich a screening issue with the record it points at, so the row says what to decide. */
function describe(issue: ScreeningIssue, workbench: DealScreeningWorkbench): IssueItem {
  const id = targetId(issue);
  const fallback: IssueItem = { id: issue.id, title: issue.title, detail: issue.summary, href: issue.href };

  switch (issue.kind) {
    case "candidate_review": {
      const candidate = workbench.candidateSignals.items.find((item) => item.id === id);
      return candidate
        ? {
            ...fallback,
            title: fieldLabel(candidate.fieldName),
            detail: candidate.summary,
            meta: { text: formatCandidateValue(candidate.candidateValue), strong: true },
            href: reviewHref(candidate.id, candidate.reviewStatus === "pending_review")
          }
        : fallback;
    }
    case "asset_identity":
    case "organization_identity": {
      const { assetItems, organizationItems } = workbench.entityResolution;
      const entity = [...assetItems, ...organizationItems].find((item) => item.proposal.id === id);
      return entity
        ? {
            ...fallback,
            title: entity.proposal.proposedDisplayName,
            detail: entity.proposal.statusExplanation,
            meta: { text: humanize(entity.proposal.proposalKind) }
          }
        : fallback;
    }
    case "relationship_review": {
      const { currentItems, historicalItems } = workbench.relationships;
      const relationship = [...currentItems, ...historicalItems].find((item) => item.proposal.id === id);
      return relationship
        ? {
            ...fallback,
            title: humanize(relationship.proposal.relationshipType),
            detail: relationship.proposal.statusExplanation,
            meta: { text: humanize(relationship.proposal.resolutionReadiness) }
          }
        : fallback;
    }
    case "intake_processing":
      return { ...fallback, href: `/intake?id=${encodeURIComponent(workbench.sourceItem.id)}` };
  }
}

function conflictItem(conflict: ConflictSummary): IssueItem {
  return {
    id: conflict.id,
    title: conflict.title,
    detail: conflict.summary,
    meta: { text: KIND_LABEL[conflict.kind], tone: CONFLICT_SEVERITY_TONE[conflict.severity] },
    href: `/conflicts?id=${encodeURIComponent(conflict.id)}`
  };
}

/** Open conflicts that cite this document on any side. */
export function conflictsForDocument(conflicts: ConflictSummary[], artifactBlobId: string | null): ConflictSummary[] {
  if (!artifactBlobId) {
    return [];
  }
  return conflicts.filter(
    (conflict) => conflict.status === "open" && conflict.sides.some((side) => side.artifactBlobId === artifactBlobId)
  );
}

export function buildIssueGroups(workbench: DealScreeningWorkbench, conflicts: ConflictSummary[]): IssueGroup[] {
  const byKind = new Map<IssueGroupKind, IssueItem[]>();
  const push = (kind: IssueGroupKind, item: IssueItem): void => {
    byKind.set(kind, [...(byKind.get(kind) ?? []), item]);
  };
  for (const issue of workbench.readiness.needsAttention) {
    push(issue.kind, describe(issue, workbench));
  }
  for (const conflict of conflicts) {
    push("conflict", conflictItem(conflict));
  }
  return ISSUE_GROUP_ORDER.flatMap((kind) => {
    const items = byKind.get(kind);
    return items ? [{ kind, items }] : [];
  });
}
