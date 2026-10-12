"use client";

import type { AssetOrganizationRelationshipDetail } from "@remi/domain";
import { ArrowLeftRight, Link2 } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";

import { formatDateTime, formatPercent } from "../../lib/format";
import { cellRefFromHint, ProvenancePanel, type ProvenanceTarget } from "../provenance/provenance-panel";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { EntitySide } from "./entity-side";
import {
  organizationLabel,
  READINESS_LABEL,
  READINESS_TONE,
  readRelationshipValue,
  STATE_LABEL,
  STATE_TONE,
  TYPE_LABEL,
  TYPE_TITLE
} from "./labels";
import { RelationshipActivity } from "./relationship-activity";
import { RelationshipDecision } from "./relationship-decision";
import { RelationshipRecord } from "./relationship-record";

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{children}</dd>
    </div>
  );
}

function AttachedBanner({ detail }: { detail: AssetOrganizationRelationshipDetail }): ReactElement | null {
  const link = detail.currentRelationshipLink;
  if (!link) {
    return null;
  }
  const preserved = detail.systemEvents.some((event) => event.eventType === "active_link_preserved");
  return (
    <div className="flex items-start gap-3 border-b border-border bg-success-soft/50 px-4 py-3 sm:px-5">
      <Link2 className="mt-0.5 size-4 shrink-0 text-success-text" />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-success-text">
          Attached to {link.canonicalAssetDisplayName} and {link.canonicalOrganizationDisplayName}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {link.linkReason} · {link.reviewerActorName} · {formatDateTime(link.updatedAt)}
          {preserved ? " · preserved through a later sync" : ""}
        </p>
      </div>
    </div>
  );
}

export function RelationshipDetail({ detail }: { detail: AssetOrganizationRelationshipDetail }): ReactElement {
  const { proposal, acceptedRecord, currentRelationshipLink: link } = detail;
  const value = readRelationshipValue(acceptedRecord.acceptedValue);
  const [trace, setTrace] = useState<ProvenanceTarget | null>(null);
  const [assetId, setAssetId] = useState(
    link?.canonicalAssetEntityId ??
      proposal.assetEntityId ??
      proposal.assetCandidates[0]?.entityId ??
      detail.matchingAssets[0]?.id ??
      ""
  );
  const [organizationId, setOrganizationId] = useState(
    link?.canonicalOrganizationEntityId ??
      proposal.organizationEntityId ??
      proposal.organizationCandidates[0]?.entityId ??
      detail.matchingOrganizations[0]?.id ??
      ""
  );
  const selectable = proposal.currentProposal && proposal.proposalState !== "superseded";
  const metadata = acceptedRecord.citationPacket.extractionMetadata;
  const locatorHint = typeof metadata.locatorHint === "string" ? metadata.locatorHint : null;
  const anchorIds =
    acceptedRecord.provenanceAnchorIds.length > 0
      ? acceptedRecord.provenanceAnchorIds
      : detail.provenanceAnchors.map((anchor) => anchor.id);
  const assetName = value.assetName ?? proposal.assetEntityDisplayName ?? "Unnamed asset";
  const orgName = organizationLabel(value);

  return (
    <div className="min-w-0 space-y-4">
      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={STATE_TONE[proposal.proposalState]}>{STATE_LABEL[proposal.proposalState]}</Badge>
            {proposal.proposalState === "pending_review" ? (
              <Badge tone={READINESS_TONE[proposal.resolutionReadiness]}>
                {READINESS_LABEL[proposal.resolutionReadiness]}
              </Badge>
            ) : null}
            <Badge tone={proposal.currentProposal ? "accent" : "neutral"}>
              {proposal.currentProposal ? "Current" : "Historical"}
            </Badge>
          </div>
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold tracking-tight text-fg">
            <span className="break-words">{assetName}</span>
            <ArrowLeftRight className="size-4 shrink-0 text-faint" aria-label="related to" />
            <span className="break-words">{orgName}</span>
          </h2>
          <p className="text-sm leading-relaxed text-muted">{proposal.statusExplanation}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1 sm:grid-cols-4">
            <Field label="Relationship">
              <span title={TYPE_TITLE[proposal.relationshipType]}>
                {TYPE_LABEL[proposal.relationshipType]} of asset
              </span>
            </Field>
            <Field label="Confidence">{formatPercent(proposal.confidence)}</Field>
            <Field label="Domain">{value.organizationDomain ?? "—"}</Field>
            <Field label="Proposed">{formatDateTime(proposal.createdAt)}</Field>
          </dl>
        </div>

        <AttachedBanner detail={detail} />

        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Canonical entities</h3>
            {selectable ? <p className="text-xs text-faint">Pick the asset and organization to attach</p> : null}
          </div>
          <p className="text-sm text-muted">{proposal.rationale}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <EntitySide
              kind="asset"
              writtenName={value.assetName}
              candidates={proposal.assetCandidates}
              matching={detail.matchingAssets}
              selectable={selectable}
              selectedId={assetId}
              linkedId={link?.canonicalAssetEntityId ?? null}
              onSelect={setAssetId}
            />
            <EntitySide
              kind="organization"
              writtenName={value.organizationName ?? value.organizationDomain}
              candidates={proposal.organizationCandidates}
              matching={detail.matchingOrganizations}
              selectable={selectable}
              selectedId={organizationId}
              linkedId={link?.canonicalOrganizationEntityId ?? null}
              onSelect={setOrganizationId}
            />
          </div>
        </div>

        <div className="border-t border-border px-4 py-4 sm:px-5">
          <RelationshipDecision proposal={proposal} assetEntityId={assetId} organizationEntityId={organizationId} />
        </div>
      </Card>

      <RelationshipRecord
        detail={detail}
        anchorCount={anchorIds.length}
        locatorHint={locatorHint}
        onViewSource={() =>
          setTrace({
            anchorIds,
            label: `${assetName} ↔ ${orgName}`,
            cellRef: cellRefFromHint(locatorHint),
            highlight: value.organizationName ?? value.organizationDomain ?? value.assetName
          })
        }
      />

      <RelationshipActivity detail={detail} />

      <ProvenancePanel target={trace} onClose={() => setTrace(null)} />
    </div>
  );
}
