"use client";

import type { CandidateReviewDetail, CandidateReviewQueueResponse, ReviewCandidateActionResponse } from "@remi/domain";
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

function serializeEditableValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "";
  }
}

function parseEditedValue(text: string, originalValue: unknown): unknown {
  const trimmed = text.trim();

  if (!trimmed.length) {
    throw new Error("Edited value cannot be empty.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    if (typeof originalValue === "string") {
      return trimmed;
    }

    throw new Error("Edited value must be valid JSON for non-text candidates.");
  }
}

export function ReviewConsole(props: {
  apiBaseUrl: string;
  initialDetail: CandidateReviewDetail | null;
  initialQueue: CandidateReviewQueueResponse;
}): ReactElement {
  const [queue, setQueue] = useState(props.initialQueue);
  const [selectedId, setSelectedId] = useState<string | null>(
    props.initialDetail?.candidate.id ?? props.initialQueue.items[0]?.candidateId ?? null
  );
  const [detail, setDetail] = useState<CandidateReviewDetail | null>(props.initialDetail);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionState, setActionState] = useState<ActionState>({
    message: "",
    status: "idle"
  });
  const [reviewNote, setReviewNote] = useState(props.initialDetail?.candidate.reviewNote ?? "");
  const [editedValueText, setEditedValueText] = useState(
    serializeEditableValue(
      props.initialDetail?.candidate.reviewedValue ?? props.initialDetail?.candidate.candidateValue
    )
  );

  const loadQueue = useEffectEvent(async (focusCandidateId?: string) => {
    setIsRefreshing(true);

    try {
      const payload = await parseJson<CandidateReviewQueueResponse>(
        await fetch(`${props.apiBaseUrl}/api/review/candidates`, {
          cache: "no-store"
        })
      );

      setQueue(payload);
      setSelectedId((current) => {
        const preferred = focusCandidateId ?? current;
        if (preferred && payload.items.some((item) => item.candidateId === preferred)) {
          return preferred;
        }

        return payload.items[0]?.candidateId ?? null;
      });
    } finally {
      setIsRefreshing(false);
    }
  });

  const loadDetail = useEffectEvent(async (candidateId: string) => {
    const payload = await parseJson<CandidateReviewDetail>(
      await fetch(`${props.apiBaseUrl}/api/review/candidates/${candidateId}`, {
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
    setReviewNote(detail?.candidate.reviewNote ?? "");
    setEditedValueText(serializeEditableValue(detail?.candidate.reviewedValue ?? detail?.candidate.candidateValue));
    setActionState({
      message: "",
      status: "idle"
    });
  }, [detail?.candidate.id]);

  async function submitAction(action: "accept" | "edit_and_accept" | "reject"): Promise<void> {
    if (!detail) {
      return;
    }

    if (!detail.candidate.currentExtraction) {
      setActionState({
        message: "This candidate was superseded by a rerun and can no longer be reviewed.",
        status: "error"
      });
      return;
    }

    setActionState({
      message: action === "reject" ? "Rejecting candidate..." : "Saving review outcome...",
      status: "working"
    });

    try {
      const reviewedValue =
        action === "edit_and_accept" ? parseEditedValue(editedValueText, detail.candidate.candidateValue) : undefined;

      const payload = await parseJson<ReviewCandidateActionResponse>(
        await fetch(`${props.apiBaseUrl}/api/review/candidates/${detail.candidate.id}/decision`, {
          body: JSON.stringify({
            action,
            note: reviewNote.trim() || null,
            reviewedValue
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        })
      );

      setDetail({
        acceptedRecord: payload.acceptedRecord,
        artifact: payload.artifact,
        candidate: payload.candidate,
        provenanceAnchors: payload.provenanceAnchors,
        reviewHistory: payload.reviewHistory
      });
      setActionState({
        message:
          action === "reject"
            ? "Candidate rejected."
            : action === "edit_and_accept"
              ? "Candidate edited and accepted."
              : "Candidate accepted.",
        status: "success"
      });

      startTransition(() => {
        void loadQueue(detail.candidate.id);
      });
    } catch (error) {
      setActionState({
        message: error instanceof Error ? error.message : "Review action failed.",
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
          <h1 style={{ fontSize: "2rem", margin: "0.35rem 0 0.2rem" }}>Candidate Review Queue</h1>
          <p style={{ color: "var(--muted)", margin: 0, maxWidth: "60ch" }}>
            Operator review lane for provisional candidate proposals. Accept, reject, or edit-and-accept without
            collapsing candidate evidence into graph truth.
          </p>
          <ConsoleNav current="review" />
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
        <SummaryCard label="Accepted" value={String(queue.counts.accepted)} />
        <SummaryCard label="Rejected" value={String(queue.counts.rejected)} />
        <SummaryCard label="Edited & Accepted" value={String(queue.counts.editedAndAccepted)} />
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(360px, 1fr) minmax(420px, 1.2fr)"
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
              gridTemplateColumns: "2fr 1fr 0.9fr",
              letterSpacing: "0.08em",
              padding: "0.85rem 1rem",
              textTransform: "uppercase"
            }}
          >
            <span>Candidate</span>
            <span>Status</span>
            <span>Confidence</span>
          </div>
          <div style={{ display: "grid" }}>
            {queue.items.length === 0 ? (
              <div style={{ color: "var(--muted)", padding: "1.25rem" }}>No review-ready candidate proposals yet.</div>
            ) : (
              queue.items.map((item) => {
                const isSelected = item.candidateId === selectedId;

                return (
                  <button
                    key={item.candidateId}
                    onClick={() => setSelectedId(item.candidateId)}
                    style={{
                      alignItems: "center",
                      background: isSelected ? "rgba(255, 255, 255, 0.04)" : "transparent",
                      border: 0,
                      borderBottom: "1px solid var(--line)",
                      color: "var(--text)",
                      cursor: "pointer",
                      display: "grid",
                      gap: "1rem",
                      gridTemplateColumns: "2fr 1fr 0.9fr",
                      padding: "0.95rem 1rem",
                      textAlign: "left"
                    }}
                    type="button"
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.fieldName}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.2rem" }}>
                        {item.candidateType} • {item.artifactFileName}
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.25rem" }}>
                        {item.summary}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      <span
                        className={statusTone(item.reviewStatus)}
                        style={{ alignSelf: "flex-start", borderRadius: 999, padding: "0.25rem 0.65rem" }}
                      >
                        {humanizeStatus(item.reviewStatus)}
                      </span>
                      <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                        {item.reviewedAt ? formatTimestamp(item.reviewedAt) : "Awaiting operator"}
                      </div>
                    </div>
                    <div>{Math.round(item.confidence * 100)}%</div>
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
                  Candidate Proposal
                </div>
                <h2 style={{ margin: "0.35rem 0 0" }}>{detail.candidate.fieldName}</h2>
                <div style={{ color: "var(--muted)", marginTop: "0.35rem" }}>
                  {detail.candidate.candidateType} • {detail.artifact.originalFileName}
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.8rem" }}>
                <MetadataRow label="Review Status" value={humanizeStatus(detail.candidate.reviewStatus)} />
                <MetadataRow
                  label="Current Extraction"
                  value={
                    detail.candidate.currentExtraction
                      ? "Yes"
                      : `No${detail.candidate.supersededAt ? ` • superseded ${formatTimestamp(detail.candidate.supersededAt)}` : ""}`
                  }
                />
                <MetadataRow label="Proposed Value" value={formatCandidateValue(detail.candidate.candidateValue)} />
                <MetadataRow label="Value Type" value={detail.candidate.valueType} />
                <MetadataRow label="Confidence" value={`${Math.round(detail.candidate.confidence * 100)}%`} />
                <MetadataRow
                  label="Method"
                  value={`${detail.candidate.extractionMethod} • ${detail.candidate.extractionMethodDetail}`}
                />
                <MetadataRow label="Summary" value={detail.candidate.summary} />
                <MetadataRow label="Evidence Preview" value={detail.candidate.citationPacket.evidencePreview} />
                <MetadataRow
                  label="Reviewed By"
                  value={
                    detail.candidate.reviewedByActorName
                      ? `${detail.candidate.reviewedByActorName} • ${detail.candidate.reviewedAt ? formatTimestamp(detail.candidate.reviewedAt) : "pending timestamp"}`
                      : "Not reviewed"
                  }
                />
                <MetadataRow
                  label="Edited Value"
                  value={
                    detail.candidate.reviewedValue !== null
                      ? formatCandidateValue(detail.candidate.reviewedValue)
                      : "None"
                  }
                />
                <MetadataRow label="Review Note" value={detail.candidate.reviewNote ?? "None"} />
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Accepted Outcome</div>
                {detail.acceptedRecord ? (
                  <div style={{ display: "grid", gap: "0.65rem" }}>
                    <ContentCard
                      title={`${detail.acceptedRecord.acceptedRecordType} record`}
                      rows={[
                        ["Accepted Value", formatCandidateValue(detail.acceptedRecord.acceptedValue)],
                        ["Review Status", humanizeStatus(detail.acceptedRecord.reviewStatus)],
                        [
                          "Reviewed By",
                          `${detail.acceptedRecord.reviewerActorName} • ${formatTimestamp(detail.acceptedRecord.reviewedAt)}`
                        ],
                        ["Review Note", detail.acceptedRecord.reviewNote ?? "None"],
                        ["Source Candidate", detail.acceptedRecord.sourceCandidateId]
                      ]}
                    />
                    <Link
                      href={`/truth`}
                      style={{
                        color: "var(--accent)",
                        fontSize: "0.88rem"
                      }}
                    >
                      Open accepted truth browser
                    </Link>
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)" }}>
                    No accepted truth record has been created for this candidate.
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Review History</div>
                {detail.reviewHistory.length > 0 ? (
                  <HistoryCard entries={detail.reviewHistory} />
                ) : (
                  <div style={{ color: "var(--muted)" }}>
                    No review decisions have been recorded for this candidate yet.
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Source Artifact</div>
                <ContentCard
                  title={detail.artifact.originalFileName}
                  rows={[
                    ["Artifact Blob", detail.artifact.artifactBlobId],
                    ["SHA-256", detail.artifact.sha256],
                    ["Content Type", detail.artifact.contentType ?? "Unknown"],
                    ["Size", formatBytes(detail.artifact.sizeBytes)],
                    ["Source Item", detail.artifact.sourceItemId ?? "Child artifact or reused blob"],
                    ["Source URI", detail.artifact.sourceUri ?? "No direct source item link"]
                  ]}
                />
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Provenance Anchors</div>
                {detail.provenanceAnchors.length > 0 ? (
                  <ContentCard
                    title="Anchor Packet"
                    rows={detail.provenanceAnchors.map((anchor) => [
                      `${anchor.anchorKind} • ${anchor.title}`,
                      `${anchor.summary} • ${JSON.stringify(anchor.locator)}`
                    ])}
                  />
                ) : (
                  <div style={{ color: "var(--muted)" }}>No provenance anchors were loaded for this candidate.</div>
                )}
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Review Action</div>
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.82rem", textTransform: "uppercase" }}>
                      Review Note
                    </span>
                    <textarea
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
                      Edited Value
                    </span>
                    <textarea
                      onChange={(event) => setEditedValueText(event.target.value)}
                      rows={6}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--line)",
                        borderRadius: "0.8rem",
                        color: "var(--text)",
                        fontFamily: '"SF Mono", "Menlo", monospace',
                        padding: "0.75rem",
                        resize: "vertical"
                      }}
                      value={editedValueText}
                    />
                  </label>

                  <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                    <ActionButton
                      disabled={actionState.status === "working"}
                      label="Approve"
                      onClick={() => void submitAction("accept")}
                    />
                    <ActionButton
                      disabled={actionState.status === "working"}
                      label="Reject"
                      onClick={() => void submitAction("reject")}
                      tone="danger"
                    />
                    <ActionButton
                      disabled={actionState.status === "working"}
                      label="Edit & Approve"
                      onClick={() => void submitAction("edit_and_accept")}
                      tone="active"
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
            <div style={{ color: "var(--muted)" }}>Select a candidate to inspect evidence and review outcome.</div>
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

function HistoryCard(props: { entries: CandidateReviewDetail["reviewHistory"] }): ReactElement {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "0.8rem",
        overflow: "hidden"
      }}
    >
      {props.entries.map((entry, index) => (
        <div
          key={entry.id}
          style={{
            borderBottom: index < props.entries.length - 1 ? "1px solid var(--line)" : "none",
            display: "grid",
            gap: "0.4rem",
            padding: "0.8rem"
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: "0.55rem", justifyContent: "space-between" }}>
            <span
              className={statusTone(entry.newReviewStatus)}
              style={{ borderRadius: 999, padding: "0.22rem 0.6rem" }}
            >
              {humanizeStatus(entry.action)}
            </span>
            <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{formatTimestamp(entry.createdAt)}</span>
          </div>
          <div style={{ color: "var(--muted)", fontSize: "0.84rem" }}>
            {humanizeStatus(entry.previousReviewStatus)} {"->"} {humanizeStatus(entry.newReviewStatus)} •{" "}
            {entry.reviewerActorName}
          </div>
          {entry.reviewNote ? (
            <div style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{entry.reviewNote}</div>
          ) : null}
          {entry.editedValue !== null ? (
            <div style={{ fontFamily: '"SF Mono", "Menlo", monospace', fontSize: "0.84rem", whiteSpace: "pre-wrap" }}>
              {formatCandidateValue(entry.editedValue)}
            </div>
          ) : null}
        </div>
      ))}
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
