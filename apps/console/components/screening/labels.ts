import type { ConflictSummary, ScreeningIssueKind, ScreeningReadinessStatus } from "@remi/domain";
import {
  Briefcase,
  Building2,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Inbox,
  ListChecks,
  type LucideIcon,
  Mail,
  Network
} from "lucide-react";

import { humanize } from "../../lib/format";
import type { Tone } from "../ui/badge";

export const READINESS: Record<ScreeningReadinessStatus, { label: string; tone: Tone; description: string }> = {
  ready: {
    label: "Ready to screen",
    tone: "success",
    description: "Every lane is resolved. The accepted values can be used in a screening output."
  },
  needs_review: {
    label: "Needs review",
    tone: "warning",
    description: "Some lanes still wait on an operator decision before this document can be trusted."
  },
  insufficient_context: {
    label: "Insufficient context",
    tone: "danger",
    description: "Not enough evidence has been accepted yet to screen this document."
  }
};

/** Issue groups shown in the attention list; "conflict" comes from the conflicts API, the rest from screening. */
export type IssueGroupKind = ScreeningIssueKind | "conflict";

export const ISSUE_GROUP: Record<
  IssueGroupKind,
  { label: string; icon: LucideIcon; action: string; href: string; tone: Tone }
> = {
  intake_processing: {
    label: "Intake processing",
    icon: Inbox,
    action: "Open intake",
    href: "/intake",
    tone: "danger"
  },
  conflict: {
    label: "Open conflicts",
    icon: GitCompareArrows,
    action: "Open conflicts",
    href: "/conflicts",
    tone: "danger"
  },
  candidate_review: {
    label: "Candidate review",
    icon: ListChecks,
    action: "Open review queue",
    href: "/review",
    tone: "warning"
  },
  asset_identity: {
    label: "Asset identity",
    icon: Building2,
    action: "Reconcile entities",
    href: "/entities",
    tone: "warning"
  },
  organization_identity: {
    label: "Organization identity",
    icon: Briefcase,
    action: "Reconcile entities",
    href: "/entities",
    tone: "warning"
  },
  relationship_review: {
    label: "Relationships",
    icon: Network,
    action: "Review relationships",
    href: "/relationships",
    tone: "warning"
  }
};

/** Most blocking first. */
export const ISSUE_GROUP_ORDER: IssueGroupKind[] = [
  "intake_processing",
  "conflict",
  "candidate_review",
  "asset_identity",
  "organization_identity",
  "relationship_review"
];

export const CONFLICT_SEVERITY_TONE: Record<ConflictSummary["severity"], Tone> = {
  high: "danger",
  medium: "warning",
  low: "neutral"
};

/** "metric.landscaping_grounds" -> "Landscaping grounds"; "probable_asset_name_mention" -> "Asset name mention". */
export function fieldLabel(fieldName: string): string {
  return humanize(fieldName.replace(/^metric\./, "").replace(/^probable_/, ""));
}

/** Deep link into the review queue; non-pending candidates are only visible under the "all" filter. */
export function reviewHref(candidateId: string, pending: boolean): string {
  const query = new URLSearchParams(pending ? { id: candidateId } : { status: "all", id: candidateId });
  return `/review?${query.toString()}`;
}

export function documentIcon(contentType: string | null, fileName: string): LucideIcon {
  const type = contentType ?? "";
  if (type.includes("spreadsheet") || type.includes("csv") || /\.(xlsx?|csv)$/i.test(fileName)) {
    return FileSpreadsheet;
  }
  if (type.includes("rfc822") || /\.(eml|msg)$/i.test(fileName)) {
    return Mail;
  }
  return FileText;
}
