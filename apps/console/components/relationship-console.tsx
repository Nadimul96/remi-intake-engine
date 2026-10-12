"use client";

import type {
  AssetOrganizationRelationshipDetail,
  AssetOrganizationRelationshipQueueFilters,
  AssetOrganizationRelationshipQueueResponse,
  RelationshipQueueLifecycleFilter,
  RelationshipQueueLinkFilter,
  RelationshipQueueStateFilter,
  RelationshipQueueTypeFilter,
  RelationshipResolutionDecisionResponse
} from "@remi/domain";
import { formatBytes, statusTone } from "@remi/ui";
import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { ReactElement } from "react";

import { ConsoleNav } from "./console-nav";

type ActionState =
  | {
      message: string;
      status: "error" | "success" | "working";
    }
  | {
      message: "";
      status: "idle";
    };

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  return response.json() as Promise<T>;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatCandidateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2) ?? "Unserializable value";
  } catch {
    return "Unserializable value";
  }
}

function humanizeStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function buildQueueQuery(filters: AssetOrganizationRelationshipQueueFilters): string {
  const params = new URLSearchParams();

  if (filters.relationshipType !== "all") {
    params.set("relationshipType", filters.relationshipType);
  }

  if (filters.lifecycle !== "all") {
    params.set("lifecycle", filters.lifecycle);
  }

  if (filters.linkState !== "all") {
    params.set("linkState", filters.linkState);
  }

  if (filters.proposalState !== "all") {
    params.set("proposalState", filters.proposalState);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function badgeTone(tone: string): { background: string; border: string; color: string } {
  switch (tone) {
    case "tone-success":
      return {
        background: "rgba(34, 197, 94, 0.14)",
        border: "rgba(34, 197, 94, 0.45)",
        color: "#86efac"
      };
    case "tone-danger":
      return {
        background: "rgba(239, 68, 68, 0.14)",
        border: "rgba(248, 113, 113, 0.45)",
        color: "#fca5a5"
      };
    case "tone-active":
      return {
        background: "rgba(59, 130, 246, 0.14)",
        border: "rgba(96, 165, 250, 0.45)",
        color: "#93c5fd"
      };
    default:
      return {
        background: "rgba(148, 163, 184, 0.12)",
        border: "rgba(148, 163, 184, 0.3)",
        color: "#cbd5e1"
      };
  }
}

export function RelationshipConsole(props: {
  apiBaseUrl: string;
  initialDetail: AssetOrganizationRelationshipDetail | null;
  initialQueue: AssetOrganizationRelationshipQueueResponse;
}): ReactElement {
  const [filters, setFilters] = useState<AssetOrganizationRelationshipQueueFilters>({
    relationshipType: "all",
    lifecycle: "all",
    linkState: "all",
    proposalState: "all"
  });
  const [queue, setQueue] = useState(props.initialQueue);
  const [selectedId, setSelectedId] = useState<string | null>(
    props.initialDetail?.proposal.id ?? props.initialQueue.items[0]?.proposal.id ?? null
  );
  const [detail, setDetail] = useState<AssetOrganizationRelationshipDetail | null>(props.initialDetail);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionState, setActionState] = useState<ActionState>({
    message: "",
    status: "idle"
  });
  const [reviewNote, setReviewNote] = useState(props.initialDetail?.proposal.reviewNote ?? "");
  const [selectedAssetEntityId, setSelectedAssetEntityId] = useState(
    props.initialDetail?.currentRelationshipLink?.canonicalAssetEntityId ??
      props.initialDetail?.proposal.assetEntityId ??
      props.initialDetail?.matchingAssets[0]?.id ??
      ""
  );
  const [selectedOrganizationEntityId, setSelectedOrganizationEntityId] = useState(
    props.initialDetail?.currentRelationshipLink?.canonicalOrganizationEntityId ??
      props.initialDetail?.proposal.organizationEntityId ??
      props.initialDetail?.matchingOrganizations[0]?.id ??
      ""
  );

  const loadQueue = useEffectEvent(async (focusProposalId?: string, nextFilters?: AssetOrganizationRelationshipQueueFilters) => {
    setIsRefreshing(true);

    try {
      const activeFilters = nextFilters ?? filters;
      const payload = await parseJson<AssetOrganizationRelationshipQueueResponse>(
        await fetch(`${props.apiBaseUrl}/api/relationships/reconciliation${buildQueueQuery(activeFilters)}`, {
          cache: "no-store"
        })
      );

      setQueue(payload);
      setSelectedId((current) => {
        const preferred = focusProposalId ?? current;
        if (preferred && payload.items.some((item) => item.proposal.id === preferred)) {
          return preferred;
        }

        return payload.items[0]?.proposal.id ?? null;
      });
    } finally {
      setIsRefreshing(false);
    }
  });

  const loadDetail = useEffectEvent(async (proposalId: string) => {
    const payload = await parseJson<AssetOrganizationRelationshipDetail>(
      await fetch(`${props.apiBaseUrl}/api/relationships/reconciliation/${proposalId}`, {
        cache: "no-store"
      })
    );

    setDetail(payload);
  });

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [loadDetail, selectedId]);

  useEffect(() => {
    void loadQueue(selectedId ?? undefined, filters);
  }, [filters, loadQueue]);

  useEffect(() => {
    setReviewNote(detail?.proposal.reviewNote ?? "");
    setSelectedAssetEntityId(
      detail?.currentRelationshipLink?.canonicalAssetEntityId ??
        detail?.proposal.assetEntityId ??
        detail?.matchingAssets[0]?.id ??
        ""
    );
    setSelectedOrganizationEntityId(
      detail?.currentRelationshipLink?.canonicalOrganizationEntityId ??
        detail?.proposal.organizationEntityId ??
        detail?.matchingOrganizations[0]?.id ??
        ""
    );
    setActionState({
      message: "",
      status: "idle"
    });
  }, [detail?.proposal.id]);

  async function submitAction(action: "accept" | "reject"): Promise<void> {
    if (!detail) {
      return;
    }

    setActionState({
      message: action === "reject" ? "Rejecting relationship proposal..." : "Saving relationship attachment...",
      status: "working"
    });

    try {
      const payload = await parseJson<RelationshipResolutionDecisionResponse>(
        await fetch(`${props.apiBaseUrl}/api/relationships/reconciliation/${detail.proposal.id}/decision`, {
          body: JSON.stringify({
            action,
            note: reviewNote.trim() || null,
            canonicalAssetEntityId: action === "accept" ? selectedAssetEntityId : undefined,
            canonicalOrganizationEntityId: action === "accept" ? selectedOrganizationEntityId : undefined
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        })
      );

      setDetail(payload);
      setActionState({
        message: action === "reject" ? "Relationship proposal rejected." : "Relationship attachment saved.",
        status: "success"
      });

      startTransition(() => {
        void loadQueue(detail.proposal.id);
      });
    } catch (error) {
      setActionState({
        message: error instanceof Error ? error.message : "Relationship reconciliation action failed.",
        status: "error"
      });
    }
  }

  return (
    <main
      style={{
        display: "grid",
        gap: "1rem",
        minHeight: "100vh",
        padding: "1.25rem",
        gridTemplateRows: "auto auto 1fr"
      }}
    >
      <header
        style={{
          alignItems: "flex-start",
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem"
        }}
      >
        <div>
          <div style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            REMI Operator Console
          </div>
          <h1 style={{ fontSize: "2rem", margin: "0.35rem 0 0.2rem" }}>Asset-Organization Relationships</h1>
          <p style={{ color: "var(--muted)", margin: 0, maxWidth: "66ch" }}>
            Narrow operator lane for attaching accepted asset-organization relationship truth to one canonical asset and
            one canonical organization.
          </p>
          <ConsoleNav current="relationships" />
        </div>
        <button
          onClick={() => void loadQueue(selectedId ?? undefined, filters)}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 999,
            color: "var(--text)",
            cursor: "pointer",
            padding: "0.65rem 0.95rem"
          }}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))"
        }}
      >
        <SummaryCard label="Pending" value={String(queue.counts.pendingReview)} />
        <SummaryCard label="Attached" value={String(queue.counts.attachedAcceptedRelationships)} />
        <SummaryCard label="Unattached" value={String(queue.counts.unattachedAcceptedRelationships)} />
        <SummaryCard label="Unsupported" value={String(queue.counts.unsupportedAcceptedRelationships)} />
      </section>

      <section
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))"
        }}
      >
        <FilterSelect
          label="Relationship Type"
          onChange={(value) =>
            setFilters((current) => ({ ...current, relationshipType: value as RelationshipQueueTypeFilter }))
          }
          options={[
            ["all", "All Types"],
            ["originating_organization_for_asset", "Originating Organization for Asset"],
            ["broker_organization_for_asset", "Broker Organization for Asset"]
          ]}
          value={filters.relationshipType}
        />
        <FilterSelect
          label="Lifecycle"
          onChange={(value) =>
            setFilters((current) => ({ ...current, lifecycle: value as RelationshipQueueLifecycleFilter }))
          }
          options={[
            ["all", "All"],
            ["current", "Current"],
            ["historical", "Historical"]
          ]}
          value={filters.lifecycle}
        />
        <FilterSelect
          label="Link State"
          onChange={(value) =>
            setFilters((current) => ({ ...current, linkState: value as RelationshipQueueLinkFilter }))
          }
          options={[
            ["all", "All"],
            ["linked", "Linked"],
            ["unlinked", "Unlinked"]
          ]}
          value={filters.linkState}
        />
        <FilterSelect
          label="Proposal State"
          onChange={(value) =>
            setFilters((current) => ({ ...current, proposalState: value as RelationshipQueueStateFilter }))
          }
          options={[
            ["all", "All States"],
            ["pending_review", "Pending Review"],
            ["accepted", "Accepted"],
            ["rejected", "Rejected"],
            ["superseded", "Superseded"]
          ]}
          value={filters.proposalState}
        />
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(20rem, 24rem) minmax(0, 1fr)",
          alignItems: "start"
        }}
      >
        <aside
          style={{
            background: "rgba(15, 23, 42, 0.68)",
            border: "1px solid var(--line)",
            borderRadius: "1.1rem",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              borderBottom: "1px solid var(--line)",
              display: "grid",
              gap: "0.2rem",
              padding: "0.9rem 1rem"
            }}
          >
            <strong>Relationship Queue</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
              Accepted relationship truth awaiting or retaining asset-org attachment context.
            </span>
          </div>

          <div style={{ display: "grid" }}>
            {queue.items.length === 0 ? (
              <div style={{ color: "var(--muted)", padding: "1rem" }}>No accepted relationship records currently require reconciliation.</div>
            ) : (
              queue.items.map((item) => {
                const selected = item.proposal.id === selectedId;
                const tone = statusTone(item.proposal.proposalState);
                return (
                  <button
                    key={item.proposal.id}
                    onClick={() => setSelectedId(item.proposal.id)}
                    style={{
                      background: selected ? "rgba(196, 138, 74, 0.14)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--line)",
                      color: "inherit",
                      cursor: "pointer",
                      display: "grid",
                      gap: "0.45rem",
                      padding: "0.95rem 1rem",
                      textAlign: "left"
                    }}
                    type="button"
                  >
                    <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                      <strong style={{ fontSize: "0.97rem" }}>{humanizeStatus(item.proposal.relationshipType)}</strong>
                      <div style={{ alignItems: "center", display: "flex", gap: "0.45rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <StatusBadge tone={item.proposal.currentProposal ? "tone-active" : "tone-muted"} value={item.proposal.currentProposal ? "current" : "historical"} />
                        <StatusBadge tone={tone} value={humanizeStatus(item.proposal.proposalState)} />
                      </div>
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.86rem" }}>{formatCandidateValue(item.acceptedValue)}</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {item.artifactFileName} • {humanizeStatus(item.proposal.resolutionReadiness)}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                      Accepted record status: {humanizeStatus(item.acceptedRecordStatus)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section
          style={{
            background: "rgba(15, 23, 42, 0.7)",
            border: "1px solid var(--line)",
            borderRadius: "1.1rem",
            padding: "1.1rem"
          }}
        >
          {!detail ? (
            <div style={{ color: "var(--muted)" }}>Select a relationship proposal to inspect the accepted truth and attach it.</div>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              <div
                style={{
                  borderBottom: "1px solid var(--line)",
                  display: "grid",
                  gap: "0.4rem",
                  paddingBottom: "0.9rem"
                }}
              >
                <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                  <h2 style={{ fontSize: "1.3rem", margin: 0 }}>{humanizeStatus(detail.proposal.relationshipType)}</h2>
                  <StatusBadge tone={detail.proposal.currentProposal ? "tone-active" : "tone-muted"} value={detail.proposal.currentProposal ? "current" : "historical"} />
                  <StatusBadge tone={statusTone(detail.proposal.proposalState)} value={humanizeStatus(detail.proposal.proposalState)} />
                  <StatusBadge tone={statusTone(detail.proposal.resolutionReadiness)} value={humanizeStatus(detail.proposal.resolutionReadiness)} />
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{detail.proposal.statusExplanation}</div>
              </div>

              <TwoColumn>
                <MetadataCard title="Accepted Relationship Truth">
                  <MetadataRow label="Field" value={detail.acceptedRecord.fieldName} />
                  <MetadataRow label="Accepted Record Status" value={humanizeStatus(detail.acceptedRecordStatus)} />
                  <MetadataRow label="Value Type" value={detail.acceptedRecord.valueType} />
                  <MetadataRow label="Accepted Value" value={formatCandidateValue(detail.acceptedRecord.acceptedValue)} multiline />
                  <MetadataRow label="Retention Context" value={detail.acceptedRecordStatusExplanation} multiline />
                  <MetadataRow label="Reviewed At" value={formatTimestamp(detail.acceptedRecord.reviewedAt)} />
                  <MetadataRow label="Reviewer" value={detail.acceptedRecord.reviewerActorName} />
                </MetadataCard>

                <MetadataCard title="Artifact Context">
                  <MetadataRow label="Artifact" value={detail.artifact.originalFileName} />
                  <MetadataRow label="Content Type" value={detail.artifact.contentType ?? "Unknown"} />
                  <MetadataRow label="Size" value={formatBytes(detail.artifact.sizeBytes)} />
                  <MetadataRow label="Source URI" value={detail.artifact.sourceUri ?? "Unknown"} multiline />
                  <MetadataRow label="Candidate" value={detail.sourceCandidate.fieldName} />
                  <MetadataRow label="Proposal Lifecycle" value={detail.proposal.currentProposal ? "Current proposal" : "Historical proposal"} />
                </MetadataCard>
              </TwoColumn>

              <TwoColumn>
                <MetadataCard title="Suggested Asset Matches">
                  {detail.proposal.assetCandidates.length > 0 ? (
                    detail.proposal.assetCandidates.map((candidate) => (
                      <CandidateCard
                        key={`${candidate.entityId}-${candidate.signalType}`}
                        candidate={candidate}
                        selected={selectedAssetEntityId === candidate.entityId}
                      />
                    ))
                  ) : (
                    <div style={{ color: "var(--muted)" }}>No canonical asset candidates are currently suggested.</div>
                  )}
                </MetadataCard>

                <MetadataCard title="Suggested Organization Matches">
                  {detail.proposal.organizationCandidates.length > 0 ? (
                    detail.proposal.organizationCandidates.map((candidate) => (
                      <CandidateCard
                        key={`${candidate.entityId}-${candidate.signalType}`}
                        candidate={candidate}
                        selected={selectedOrganizationEntityId === candidate.entityId}
                      />
                    ))
                  ) : (
                    <div style={{ color: "var(--muted)" }}>No canonical organization candidates are currently suggested.</div>
                  )}
                </MetadataCard>
              </TwoColumn>

              <TwoColumn>
                <MetadataCard title="Current Relationship Link">
                  {detail.currentRelationshipLink ? (
                    <>
                      <MetadataRow label="Asset" value={detail.currentRelationshipLink.canonicalAssetDisplayName} />
                      <MetadataRow label="Organization" value={detail.currentRelationshipLink.canonicalOrganizationDisplayName} />
                      <MetadataRow
                        label="Link Source"
                        value={
                          detail.systemEvents.some((event) => event.eventType === "active_link_preserved")
                            ? "Explicit operator approval with later sync preservation"
                            : "Explicit operator approval"
                        }
                      />
                      <MetadataRow label="Reason" value={detail.currentRelationshipLink.linkReason} />
                      <MetadataRow label="Updated At" value={formatTimestamp(detail.currentRelationshipLink.updatedAt)} />
                    </>
                  ) : (
                    <div style={{ color: "var(--muted)" }}>This accepted relationship truth is not attached to canonical entities yet.</div>
                  )}
                </MetadataCard>

                <MetadataCard title="Provenance">
                  <div style={{ display: "grid", gap: "0.55rem" }}>
                    {detail.provenanceAnchors.map((anchor) => (
                      <div
                        key={anchor.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid var(--line)",
                          borderRadius: "0.9rem",
                          padding: "0.75rem"
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{anchor.title}</div>
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{anchor.summary}</div>
                      </div>
                    ))}
                  </div>
                </MetadataCard>
              </TwoColumn>

              <TwoColumn>
                <MetadataCard title="Relationship Reconciliation History">
                  {detail.reconciliationHistory.length > 0 ? (
                    detail.reconciliationHistory.map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid var(--line)",
                          borderRadius: "0.9rem",
                          padding: "0.75rem"
                        }}
                      >
                        <div style={{ alignItems: "center", display: "flex", gap: "0.45rem", justifyContent: "space-between" }}>
                          <strong>{humanizeStatus(entry.action)}</strong>
                          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{formatTimestamp(entry.createdAt)}</span>
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.35rem" }}>
                          {humanizeStatus(entry.previousProposalState)} {"->"} {humanizeStatus(entry.newProposalState)}
                        </div>
                        <div style={{ display: "grid", gap: "0.2rem", marginTop: "0.45rem" }}>
                          <MetadataRow label="Chosen Asset" value={entry.chosenCanonicalAssetDisplayName ?? "None"} />
                          <MetadataRow label="Chosen Organization" value={entry.chosenCanonicalOrganizationDisplayName ?? "None"} />
                          <MetadataRow label="Reviewer" value={entry.reviewerActorName} />
                          <MetadataRow label="Note" value={entry.reviewNote ?? "None"} multiline />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "var(--muted)" }}>No relationship reconciliation decisions have been recorded yet.</div>
                  )}
                </MetadataCard>

                <MetadataCard title="Relationship System Events">
                  {detail.systemEvents.length > 0 ? (
                    detail.systemEvents.map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid var(--line)",
                          borderRadius: "0.9rem",
                          padding: "0.75rem"
                        }}
                      >
                        <div style={{ alignItems: "center", display: "flex", gap: "0.45rem", justifyContent: "space-between" }}>
                          <strong>{humanizeStatus(entry.eventType)}</strong>
                          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{formatTimestamp(entry.createdAt)}</span>
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.35rem" }}>{entry.summary}</div>
                        <div style={{ display: "grid", gap: "0.2rem", marginTop: "0.45rem" }}>
                          <MetadataRow
                            label="State Change"
                            value={
                              entry.previousProposalState && entry.newProposalState
                                ? `${humanizeStatus(entry.previousProposalState)} -> ${humanizeStatus(entry.newProposalState)}`
                                : "No proposal-state change recorded"
                            }
                          />
                          <MetadataRow label="Asset" value={entry.canonicalAssetDisplayName ?? "None"} />
                          <MetadataRow label="Organization" value={entry.canonicalOrganizationDisplayName ?? "None"} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "var(--muted)" }}>No system-driven relationship sync events have been recorded yet.</div>
                  )}
                </MetadataCard>
              </TwoColumn>

              <MetadataCard title="Canonical Entity Selection">
                <div style={{ display: "grid", gap: "0.9rem" }}>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Canonical Asset</span>
                    <select
                      onChange={(event) => setSelectedAssetEntityId(event.target.value)}
                      value={selectedAssetEntityId}
                      style={selectStyle}
                    >
                      <option value="">Select asset</option>
                      {detail.matchingAssets.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Canonical Organization</span>
                    <select
                      onChange={(event) => setSelectedOrganizationEntityId(event.target.value)}
                      value={selectedOrganizationEntityId}
                      style={selectStyle}
                    >
                      <option value="">Select organization</option>
                      {detail.matchingOrganizations.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Review Note</span>
                    <textarea
                      disabled={detail.proposal.proposalState === "superseded"}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={3}
                      style={textAreaStyle}
                      value={reviewNote}
                    />
                  </label>

                  <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    {detail.proposal.currentProposal
                      ? "Review actions apply only to the current relationship proposal. Any later auto-sync changes are recorded separately in the system-event timeline."
                      : "Historical proposals are read-only. Review actions only apply to the current relationship proposal."}
                  </div>

                  {actionState.status !== "idle" ? (
                    <div style={{ color: actionState.status === "error" ? "#fca5a5" : "var(--muted)" }}>{actionState.message}</div>
                  ) : null}

                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      disabled={detail.proposal.proposalState === "superseded"}
                      onClick={() => void submitAction("reject")}
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      Reject
                    </button>
                    <button
                      disabled={
                        detail.proposal.proposalState === "superseded" || !selectedAssetEntityId || !selectedOrganizationEntityId
                      }
                      onClick={() => void submitAction("accept")}
                      style={primaryButtonStyle}
                      type="button"
                    >
                      Attach Relationship
                    </button>
                    <Link href={`/truth`} style={{ ...secondaryLinkStyle }}>
                      Open Accepted Truth
                    </Link>
                  </div>
                </div>
              </MetadataCard>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard(props: { label: string; value: string }): ReactElement {
  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid var(--line)",
        borderRadius: "1rem",
        display: "grid",
        gap: "0.25rem",
        padding: "0.95rem 1rem"
      }}
    >
      <span style={{ color: "var(--muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>{props.label}</span>
      <strong style={{ fontSize: "1.4rem" }}>{props.value}</strong>
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}): ReactElement {
  return (
    <label
      style={{
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid var(--line)",
        borderRadius: "1rem",
        display: "grid",
        gap: "0.45rem",
        padding: "0.85rem 1rem"
      }}
    >
      <span style={{ color: "var(--muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>{props.label}</span>
      <select onChange={(event) => props.onChange(event.target.value)} style={selectStyle} value={props.value}>
        {props.options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge(props: { tone: string; value: string }): ReactElement {
  const tone = badgeTone(props.tone);
  return (
    <span
      style={{
        background: tone.background,
        border: `1px solid ${tone.border}`,
        borderRadius: 999,
        color: tone.color,
        fontSize: "0.75rem",
        padding: "0.2rem 0.55rem",
        textTransform: "uppercase"
      }}
    >
      {props.value}
    </span>
  );
}

function TwoColumn(props: { children: ReactElement[] | ReactElement }): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
      }}
    >
      {props.children}
    </div>
  );
}

function MetadataCard(props: { children: ReactElement | ReactElement[] | string; title: string }): ReactElement {
  return (
    <section
      style={{
        background: "rgba(255, 255, 255, 0.025)",
        border: "1px solid var(--line)",
        borderRadius: "1rem",
        display: "grid",
        gap: "0.8rem",
        padding: "0.95rem"
      }}
    >
      <strong>{props.title}</strong>
      <div style={{ display: "grid", gap: "0.65rem" }}>{props.children}</div>
    </section>
  );
}

function MetadataRow(props: { label: string; multiline?: boolean; value: string }): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.18rem" }}>
      <span style={{ color: "var(--muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>{props.label}</span>
      <span
        style={{
          lineHeight: 1.4,
          whiteSpace: props.multiline ? "pre-wrap" : "normal",
          wordBreak: "break-word"
        }}
      >
        {props.value}
      </span>
    </div>
  );
}

function CandidateCard(props: {
  candidate: AssetOrganizationRelationshipDetail["proposal"]["assetCandidates"][number];
  selected: boolean;
}): ReactElement {
  return (
    <div
      style={{
        background: props.selected ? "rgba(196, 138, 74, 0.12)" : "rgba(255, 255, 255, 0.03)",
        border: props.selected ? "1px solid rgba(196, 138, 74, 0.55)" : "1px solid var(--line)",
        borderRadius: "0.9rem",
        display: "grid",
        gap: "0.28rem",
        padding: "0.8rem"
      }}
    >
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
        <strong>{props.candidate.entityDisplayName}</strong>
        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{Math.round(props.candidate.confidence * 100)}%</span>
      </div>
      <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
        {humanizeStatus(props.candidate.signalType)} • {props.candidate.matchedFrom}
      </div>
      <div style={{ fontSize: "0.85rem" }}>{props.candidate.rationale}</div>
    </div>
  );
}

const selectStyle = {
  background: "rgba(255, 255, 255, 0.03)",
  border: "1px solid var(--line)",
  borderRadius: "0.8rem",
  color: "var(--text)",
  padding: "0.7rem 0.8rem"
} as const;

const textAreaStyle = {
  background: "rgba(255, 255, 255, 0.03)",
  border: "1px solid var(--line)",
  borderRadius: "0.8rem",
  color: "var(--text)",
  padding: "0.7rem 0.8rem",
  resize: "vertical"
} as const;

const primaryButtonStyle = {
  background: "rgba(196, 138, 74, 0.18)",
  border: "1px solid rgba(196, 138, 74, 0.55)",
  borderRadius: 999,
  color: "var(--text)",
  cursor: "pointer",
  padding: "0.7rem 1rem"
} as const;

const secondaryButtonStyle = {
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: 999,
  color: "var(--text)",
  cursor: "pointer",
  padding: "0.7rem 1rem"
} as const;

const secondaryLinkStyle = {
  alignItems: "center",
  border: "1px solid var(--line)",
  borderRadius: 999,
  color: "var(--text)",
  display: "inline-flex",
  padding: "0.7rem 1rem",
  textDecoration: "none"
} as const;
