"use client";

import type {
  EntityResolutionDecisionResponse,
  EntityResolutionDetail,
  EntityResolutionQueueResponse
} from "@remi/domain";
import { formatBytes, statusTone } from "@remi/ui";
import Link from "next/link";
import type { ReactElement } from "react";
import { startTransition, useEffect, useEffectEvent, useState } from "react";

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

function formatAliasList(values: string[]): string {
  return values.length > 0 ? values.join(" • ") : "None";
}

export function EntityReconciliationConsole(props: {
  apiBaseUrl: string;
  initialDetail: EntityResolutionDetail | null;
  initialQueue: EntityResolutionQueueResponse;
}): ReactElement {
  const [queue, setQueue] = useState(props.initialQueue);
  const [selectedId, setSelectedId] = useState<string | null>(
    props.initialDetail?.proposal.id ?? props.initialQueue.items[0]?.proposal.id ?? null
  );
  const [detail, setDetail] = useState<EntityResolutionDetail | null>(props.initialDetail);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionState, setActionState] = useState<ActionState>({
    message: "",
    status: "idle"
  });
  const [reviewNote, setReviewNote] = useState(props.initialDetail?.proposal.reviewNote ?? "");
  const [selectedEntityId, setSelectedEntityId] = useState(
    props.initialDetail?.currentEntityLink?.canonicalEntityId ??
      props.initialDetail?.proposal.targetEntityId ??
      props.initialDetail?.matchingEntities[0]?.id ??
      ""
  );
  const [displayName, setDisplayName] = useState(
    props.initialDetail?.currentEntityLink?.canonicalEntityDisplayName ??
      props.initialDetail?.proposal.proposedDisplayName ??
      ""
  );

  const loadQueue = useEffectEvent(async (focusProposalId?: string) => {
    setIsRefreshing(true);

    try {
      const payload = await parseJson<EntityResolutionQueueResponse>(
        await fetch(`${props.apiBaseUrl}/api/entities/reconciliation`, {
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
    const payload = await parseJson<EntityResolutionDetail>(
      await fetch(`${props.apiBaseUrl}/api/entities/reconciliation/${proposalId}`, {
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
    setReviewNote(detail?.proposal.reviewNote ?? "");
    setSelectedEntityId(
      detail?.currentEntityLink?.canonicalEntityId ??
        detail?.proposal.targetEntityId ??
        detail?.matchingEntities[0]?.id ??
        ""
    );
    setDisplayName(detail?.currentEntityLink?.canonicalEntityDisplayName ?? detail?.proposal.proposedDisplayName ?? "");
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
      message: action === "reject" ? "Rejecting reconciliation proposal..." : "Saving reconciliation outcome...",
      status: "working"
    });

    try {
      const payload = await parseJson<EntityResolutionDecisionResponse>(
        await fetch(`${props.apiBaseUrl}/api/entities/reconciliation/${detail.proposal.id}/decision`, {
          body: JSON.stringify({
            action,
            note: reviewNote.trim() || null,
            targetEntityId: action === "accept" && selectedEntityId ? selectedEntityId : undefined,
            displayName: action === "accept" && !selectedEntityId ? displayName.trim() || undefined : undefined,
            entityType: action === "accept" ? detail.proposal.entityType : undefined
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        })
      );

      setDetail(payload);
      setActionState({
        message: action === "reject" ? "Proposal rejected." : "Proposal accepted and entity reconciliation saved.",
        status: "success"
      });

      startTransition(() => {
        void loadQueue(detail.proposal.id);
      });
    } catch (error) {
      setActionState({
        message: error instanceof Error ? error.message : "Entity reconciliation action failed.",
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
          <div
            style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase" }}
          >
            REMI Operator Console
          </div>
          <h1 style={{ fontSize: "2rem", margin: "0.35rem 0 0.2rem" }}>Entity Reconciliation</h1>
          <p style={{ color: "var(--muted)", margin: 0, maxWidth: "66ch" }}>
            Narrow operator lane for attaching reviewed asset and organization truth to canonical entities. This lane
            now supports asset-name reconciliation plus conservative organization name and domain reconciliation.
          </p>
          <ConsoleNav current="entities" />
        </div>
        <button
          onClick={() => void loadQueue(selectedId ?? undefined)}
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
        <SummaryCard label="Pending Review" value={String(queue.counts.pendingReview)} />
        <SummaryCard label="Attached Truths" value={String(queue.counts.attachedAcceptedTruths)} />
        <SummaryCard label="Unattached Truths" value={String(queue.counts.unattachedAcceptedTruths)} />
        <SummaryCard label="Canonical Assets" value={String(queue.counts.canonicalEntities)} />
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(360px, 1fr) minmax(460px, 1.25fr)"
        }}
      >
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "1rem",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              borderBottom: "1px solid var(--line)",
              color: "var(--muted)",
              display: "grid",
              fontSize: "0.8rem",
              gap: "1rem",
              gridTemplateColumns: "2fr 1fr 1fr",
              letterSpacing: "0.08em",
              padding: "0.85rem 1rem",
              textTransform: "uppercase"
            }}
          >
            <span>Accepted Truth</span>
            <span>Proposal</span>
            <span>Attachment</span>
          </div>
          <div style={{ display: "grid" }}>
            {queue.items.length === 0 ? (
              <div style={{ color: "var(--muted)", padding: "1.25rem" }}>
                No entity reconciliation proposals are currently available. Unsupported accepted truths remain outside
                this lane for now.
              </div>
            ) : (
              queue.items.map((item) => {
                const isSelected = item.proposal.id === selectedId;

                return (
                  <button
                    key={item.proposal.id}
                    onClick={() => setSelectedId(item.proposal.id)}
                    style={{
                      alignItems: "center",
                      background: isSelected ? "rgba(255, 255, 255, 0.04)" : "transparent",
                      border: 0,
                      borderBottom: "1px solid var(--line)",
                      color: "var(--text)",
                      cursor: "pointer",
                      display: "grid",
                      gap: "1rem",
                      gridTemplateColumns: "2fr 1fr 1fr",
                      padding: "0.95rem 1rem",
                      textAlign: "left"
                    }}
                    type="button"
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.proposal.proposedDisplayName}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.2rem" }}>
                        {item.acceptedFieldName} • {item.artifactFileName}
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.25rem" }}>
                        {formatCandidateValue(item.acceptedValue)}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      <span
                        className={statusTone(item.proposal.proposalState)}
                        style={{ alignSelf: "flex-start", borderRadius: 999, padding: "0.25rem 0.65rem" }}
                      >
                        {humanizeStatus(item.proposal.proposalState)}
                      </span>
                      <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                        {humanizeStatus(item.proposal.proposalKind)} • {humanizeStatus(item.proposal.matchCategory)} •{" "}
                        {item.proposal.currentProposal ? "current" : "historical"}
                      </div>
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.84rem" }}>
                      {item.currentEntityLink ? item.currentEntityLink.canonicalEntityDisplayName : "Unattached"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside
          style={{
            background: "var(--panel-alt)",
            border: "1px solid var(--line)",
            borderRadius: "1rem",
            display: "grid",
            gap: "1rem",
            padding: "1rem"
          }}
        >
          {detail ? (
            <>
              <div>
                <div
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.78rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase"
                  }}
                >
                  Entity Proposal
                </div>
                <h2 style={{ margin: "0.35rem 0 0" }}>{detail.proposal.proposedDisplayName}</h2>
                <div style={{ color: "var(--muted)", marginTop: "0.35rem" }}>
                  {detail.proposal.entityType} • {humanizeStatus(detail.proposal.matchCategory)} •{" "}
                  {detail.proposal.matchStrategy}
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.8rem" }}>
                <MetadataRow label="Proposal State" value={humanizeStatus(detail.proposal.proposalState)} />
                <MetadataRow label="Proposal Kind" value={humanizeStatus(detail.proposal.proposalKind)} />
                <MetadataRow label="Match Category" value={humanizeStatus(detail.proposal.matchCategory)} />
                <MetadataRow label="Current Proposal" value={detail.proposal.currentProposal ? "Yes" : "No"} />
                <MetadataRow label="Confidence" value={`${Math.round(detail.proposal.confidence * 100)}%`} />
                <MetadataRow label="Rationale" value={detail.proposal.rationale} />
                <MetadataRow label="Status Explanation" value={detail.proposal.statusExplanation} />
                <MetadataRow
                  label="Reviewed By"
                  value={
                    detail.proposal.reviewedByActorName
                      ? `${detail.proposal.reviewedByActorName} • ${detail.proposal.reviewedAt ? formatTimestamp(detail.proposal.reviewedAt) : "pending timestamp"}`
                      : "Not reviewed"
                  }
                />
                <MetadataRow label="Review Note" value={detail.proposal.reviewNote ?? "None"} />
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Current Entity Attachment
                </div>
                {detail.currentEntityLink ? (
                  (() => {
                    const linkedEntity =
                      detail.matchingEntities.find(
                        (entity) => entity.id === detail.currentEntityLink?.canonicalEntityId
                      ) ?? null;

                    return (
                      <ContentCard
                        title={detail.currentEntityLink.canonicalEntityDisplayName}
                        rows={[
                          ["Canonical Entity", detail.currentEntityLink.canonicalEntityId],
                          ["Entity Type", detail.currentEntityLink.canonicalEntityType],
                          ["Link Status", detail.currentEntityLink.linkStatus],
                          ["Link Reason", detail.currentEntityLink.linkReason],
                          [
                            "Observed Aliases",
                            formatAliasList(linkedEntity?.aliases.map((alias) => alias.aliasValue) ?? [])
                          ],
                          [
                            "Linked By",
                            `${detail.currentEntityLink.reviewerActorName} • ${formatTimestamp(detail.currentEntityLink.updatedAt)}`
                          ]
                        ]}
                      />
                    );
                  })()
                ) : (
                  <div style={{ color: "var(--muted)" }}>
                    This accepted truth is not yet attached to a canonical entity.
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Accepted Truth Source
                </div>
                <ContentCard
                  title={detail.acceptedRecord.fieldName}
                  rows={[
                    ["Accepted Value", formatCandidateValue(detail.acceptedRecord.acceptedValue)],
                    ["Accepted Record", detail.acceptedRecord.id],
                    [
                      "Accepted Record Status",
                      detail.acceptedRecord.metadata.acceptedRecordMissing === true
                        ? "Accepted truth record was removed; showing a reconstructed snapshot from source-candidate state."
                        : "Active accepted truth record"
                    ],
                    ["Source Candidate", detail.acceptedRecord.sourceCandidateId],
                    ["Artifact", detail.artifact.originalFileName]
                  ]}
                />
                <div style={{ marginTop: "0.55rem" }}>
                  <Link href="/truth" style={{ color: "var(--accent)", fontSize: "0.88rem" }}>
                    Open accepted truth browser
                  </Link>
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Matching Canonical Entities
                </div>
                {detail.matchingEntities.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.55rem" }}>
                    {detail.matchingEntities.map((entity) => {
                      const matchCandidate =
                        detail.proposal.matchingCandidates.find((candidate) => candidate.entityId === entity.id) ??
                        null;

                      return (
                        <label
                          key={entity.id}
                          style={{
                            alignItems: "flex-start",
                            border: "1px solid var(--line)",
                            borderRadius: "0.8rem",
                            cursor: "pointer",
                            display: "grid",
                            gap: "0.3rem",
                            gridTemplateColumns: "auto 1fr",
                            padding: "0.75rem"
                          }}
                        >
                          <input
                            checked={selectedEntityId === entity.id}
                            name="entity-match"
                            onChange={() => setSelectedEntityId(entity.id)}
                            type="radio"
                          />
                          <div style={{ display: "grid", gap: "0.35rem" }}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{entity.displayName}</div>
                              <div style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: "0.2rem" }}>
                                {entity.id} • normalized as {entity.normalizedName}
                              </div>
                            </div>
                            {matchCandidate ? (
                              <div style={{ display: "grid", gap: "0.2rem" }}>
                                <div style={{ color: "var(--muted)", fontSize: "0.74rem", textTransform: "uppercase" }}>
                                  {humanizeStatus(matchCandidate.signalType)}
                                </div>
                                <div style={{ fontSize: "0.84rem", lineHeight: 1.45 }}>{matchCandidate.rationale}</div>
                                <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                                  Matched from {matchCandidate.matchedFrom}: {matchCandidate.matchedName}
                                  {matchCandidate.aliasValue ? ` • alias ${matchCandidate.aliasValue}` : ""}
                                </div>
                              </div>
                            ) : null}
                            <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                              Observed aliases: {formatAliasList(entity.aliases.map((alias) => alias.aliasValue))}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)" }}>
                    No supported canonical entity matches were found. Accepting will create a new entity for this
                    reviewed truth.
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Source Artifact + Evidence
                </div>
                <ContentCard
                  title={detail.artifact.originalFileName}
                  rows={[
                    ["Artifact Blob", detail.artifact.artifactBlobId],
                    ["SHA-256", detail.artifact.sha256],
                    ["Content Type", detail.artifact.contentType ?? "Unknown"],
                    ["Size", formatBytes(detail.artifact.sizeBytes)],
                    ["Evidence Preview", detail.acceptedRecord.citationPacket.evidencePreview]
                  ]}
                />
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Candidate Review + Provenance
                </div>
                <ContentCard
                  title="Review Context"
                  rows={[
                    ["Source Candidate Status", humanizeStatus(detail.sourceCandidate.reviewStatus)],
                    ["Current Extraction", detail.sourceCandidate.currentExtraction ? "Yes" : "No"],
                    ["Provenance Anchors", String(detail.provenanceAnchors.length)],
                    ["Review Decisions", String(detail.reviewHistory.length)]
                  ]}
                />
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Reconciliation History
                </div>
                {detail.reconciliationHistory.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.6rem" }}>
                    {detail.reconciliationHistory.map((entry) => (
                      <ContentCard
                        key={entry.id}
                        title={`${humanizeStatus(entry.action)} • ${formatTimestamp(entry.createdAt)}`}
                        rows={[
                          [
                            "State Change",
                            `${humanizeStatus(entry.previousProposalState)} -> ${humanizeStatus(entry.newProposalState)}`
                          ],
                          ["Chosen Entity", entry.chosenEntityDisplayName ?? entry.chosenEntityId ?? "None"],
                          ["Created Entity", entry.chosenEntityCreated ? "Yes" : "No"],
                          ["Created Aliases", formatAliasList(entry.createdAliasValues)],
                          ["Reviewer", entry.reviewerActorName],
                          ["Note", entry.reviewNote ?? "None"]
                        ]}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)" }}>
                    No reconciliation decisions have been recorded yet. This proposal is still relying on its current
                    status and match context.
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Auto-Sync System Events
                </div>
                {detail.systemEvents.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.6rem" }}>
                    {detail.systemEvents.map((entry) => (
                      <ContentCard
                        key={entry.id}
                        title={`System • ${humanizeStatus(entry.eventType)} • ${formatTimestamp(entry.createdAt)}`}
                        rows={[
                          ["Summary", entry.summary],
                          [
                            "State Change",
                            entry.previousProposalState && entry.newProposalState
                              ? `${humanizeStatus(entry.previousProposalState)} -> ${humanizeStatus(entry.newProposalState)}`
                              : "No proposal-state transition recorded"
                          ],
                          ["Entity", entry.canonicalEntityDisplayName ?? entry.canonicalEntityId ?? "None"],
                          ["Alias Values", formatAliasList(entry.aliasValues)]
                        ]}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)" }}>
                    No system-driven reconciliation events have been recorded for this proposal yet.
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Reconciliation Action
                </div>
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.82rem", textTransform: "uppercase" }}>
                      Review Note
                    </span>
                    <textarea
                      disabled={actionState.status === "working" || !detail.proposal.currentProposal}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={3}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--line)",
                        borderRadius: "0.8rem",
                        color: "var(--text)",
                        padding: "0.75rem",
                        resize: "vertical"
                      }}
                      value={reviewNote}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.82rem", textTransform: "uppercase" }}>
                      Create-Entity Display Name
                    </span>
                    <input
                      disabled={actionState.status === "working" || !detail.proposal.currentProposal}
                      onChange={(event) => setDisplayName(event.target.value)}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--line)",
                        borderRadius: "0.8rem",
                        color: "var(--text)",
                        padding: "0.75rem"
                      }}
                      value={displayName}
                    />
                  </label>

                  <div style={{ color: "var(--muted)", fontSize: "0.84rem" }}>
                    {!detail.proposal.currentProposal
                      ? "Historical proposals are read-only. Review actions only apply to the current reconciliation proposal."
                      : selectedEntityId
                        ? "Accept will attach this accepted truth to the selected canonical entity and preserve any distinct reviewed identity hints as observed aliases or domains."
                        : "Accept will create a new canonical entity using the display name above."}
                  </div>

                  <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                    <ActionButton
                      disabled={actionState.status === "working" || !detail.proposal.currentProposal}
                      label="Accept Reconciliation"
                      onClick={() => void submitAction("accept")}
                      tone="active"
                    />
                    <ActionButton
                      disabled={actionState.status === "working" || !detail.proposal.currentProposal}
                      label="Reject Proposal"
                      onClick={() => void submitAction("reject")}
                      tone="danger"
                    />
                    <ActionButton
                      disabled={actionState.status === "working" || !detail.proposal.currentProposal}
                      label="Clear Entity Selection"
                      onClick={() => setSelectedEntityId("")}
                    />
                  </div>

                  {actionState.status !== "idle" ? (
                    <div
                      className={statusTone(
                        actionState.status === "success"
                          ? "accepted"
                          : actionState.status === "error"
                            ? "rejected"
                            : "processing"
                      )}
                      style={{
                        borderRadius: "0.8rem",
                        padding: "0.7rem 0.85rem"
                      }}
                    >
                      {actionState.message}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: "var(--muted)" }}>
              Select a reconciliation item to inspect accepted truth and entity options.
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function SummaryCard(props: { label: string; value: string }): ReactElement {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: "1rem",
        padding: "0.95rem 1rem"
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: "0.82rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {props.label}
      </div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, marginTop: "0.35rem" }}>{props.value}</div>
    </div>
  );
}

function MetadataRow(props: { label: string; value: string }): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.24rem" }}>
      <div style={{ color: "var(--muted)", fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {props.label}
      </div>
      <div style={{ fontSize: "0.94rem", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {props.value}
      </div>
    </div>
  );
}

function ContentCard(props: { rows: Array<[string, string]>; title: string }): ReactElement {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "0.8rem",
        padding: "0.75rem"
      }}
    >
      <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.6rem" }}>{props.title}</div>
      <div style={{ display: "grid", gap: "0.45rem" }}>
        {props.rows.map(([label, value]) => (
          <div key={`${props.title}-${label}-${value}`} style={{ display: "grid", gap: "0.16rem" }}>
            <div
              style={{
                color: "var(--muted)",
                fontSize: "0.74rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase"
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: "0.9rem", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton(props: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone?: "active" | "danger" | "neutral";
}): ReactElement {
  const tone = props.tone ?? "neutral";
  const palette =
    tone === "danger"
      ? {
          background: "rgba(213, 99, 99, 0.16)",
          border: "1px solid rgba(213, 99, 99, 0.45)"
        }
      : tone === "active"
        ? {
            background: "rgba(95, 141, 211, 0.18)",
            border: "1px solid rgba(95, 141, 211, 0.42)"
          }
        : {
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid var(--line)"
          };

  return (
    <button
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        ...palette,
        borderRadius: "0.8rem",
        color: "var(--text)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
        padding: "0.75rem 0.95rem"
      }}
      type="button"
    >
      {props.label}
    </button>
  );
}
