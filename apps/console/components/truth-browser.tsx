"use client";

import type {
  AcceptedTruthBrowserResponse,
  AcceptedTruthDetail,
  AcceptedTruthFilter,
  AcceptedTruthListItem,
  ReviewHistoryEntry
} from "@remi/domain";
import { formatBytes, statusTone } from "@remi/ui";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { ReactElement } from "react";

import { ConsoleNav } from "./console-nav";

const truthFilters: Array<{ label: string; value: AcceptedTruthFilter }> = [
  { label: "All", value: "all" },
  { label: "Facts", value: "fact" },
  { label: "Relationships", value: "relationship" },
  { label: "Classifications", value: "classification" }
];

type AcceptedRecordSelection = {
  acceptedRecordId: string;
  acceptedRecordType: AcceptedTruthListItem["acceptedRecordType"];
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

function selectionMatches(item: AcceptedTruthListItem, selection: AcceptedRecordSelection | null): boolean {
  return Boolean(
    selection &&
      item.acceptedRecordId === selection.acceptedRecordId &&
      item.acceptedRecordType === selection.acceptedRecordType
  );
}

export function TruthBrowser(props: {
  apiBaseUrl: string;
  initialBrowser: AcceptedTruthBrowserResponse;
  initialDetail: AcceptedTruthDetail | null;
}): ReactElement {
  const [filter, setFilter] = useState<AcceptedTruthFilter>("all");
  const [browser, setBrowser] = useState(props.initialBrowser);
  const [selected, setSelected] = useState<AcceptedRecordSelection | null>(
    props.initialDetail
      ? {
          acceptedRecordId: props.initialDetail.acceptedRecord.id,
          acceptedRecordType: props.initialDetail.acceptedRecord.acceptedRecordType
        }
      : props.initialBrowser.items[0]
        ? {
            acceptedRecordId: props.initialBrowser.items[0].acceptedRecordId,
            acceptedRecordType: props.initialBrowser.items[0].acceptedRecordType
          }
        : null
  );
  const [detail, setDetail] = useState<AcceptedTruthDetail | null>(props.initialDetail);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBrowser = useEffectEvent(async (nextFilter: AcceptedTruthFilter, focus?: AcceptedRecordSelection | null) => {
    setIsRefreshing(true);

    try {
      const payload = await parseJson<AcceptedTruthBrowserResponse>(
        await fetch(`${props.apiBaseUrl}/api/truth?type=${nextFilter}`, {
          cache: "no-store"
        })
      );

      setBrowser(payload);
      setSelected((current) => {
        const preferred = focus ?? current;
        const matching = preferred
          ? payload.items.find((item) => selectionMatches(item, preferred))
          : null;

        if (matching) {
          return {
            acceptedRecordId: matching.acceptedRecordId,
            acceptedRecordType: matching.acceptedRecordType
          };
        }

        const first = payload.items[0];
        return first
          ? {
              acceptedRecordId: first.acceptedRecordId,
              acceptedRecordType: first.acceptedRecordType
            }
          : null;
      });
    } finally {
      setIsRefreshing(false);
    }
  });

  const loadDetail = useEffectEvent(async (nextSelected: AcceptedRecordSelection) => {
    const payload = await parseJson<AcceptedTruthDetail>(
      await fetch(`${props.apiBaseUrl}/api/truth/${nextSelected.acceptedRecordType}/${nextSelected.acceptedRecordId}`, {
        cache: "no-store"
      })
    );

    setDetail(payload);
  });

  useEffect(() => {
    if (selected) {
      void loadDetail(selected);
    } else {
      setDetail(null);
    }
  }, [loadDetail, selected]);

  function handleFilterChange(nextFilter: AcceptedTruthFilter): void {
    setFilter(nextFilter);
    startTransition(() => {
      void loadBrowser(nextFilter, selected);
    });
  }

  return (
    <main
      style={{
        display: "grid",
        gap: "1rem",
        minHeight: "100vh",
        padding: "1.25rem",
        gridTemplateRows: "auto auto auto 1fr"
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
          <h1 style={{ fontSize: "2rem", margin: "0.35rem 0 0.2rem" }}>Accepted Truth Browser</h1>
          <p style={{ color: "var(--muted)", margin: 0, maxWidth: "64ch" }}>
            Read model for operator-reviewed truth. Inspect accepted records, review history, evidence packets, and
            whether the source proposal is still current or has been superseded.
          </p>
          <ConsoleNav current="truth" />
        </div>
        <button
          onClick={() => void loadBrowser(filter, selected)}
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
        <SummaryCard label="All Accepted" value={String(browser.counts.all)} />
        <SummaryCard label="Facts" value={String(browser.counts.fact)} />
        <SummaryCard label="Relationships" value={String(browser.counts.relationship)} />
        <SummaryCard label="Classifications" value={String(browser.counts.classification)} />
      </section>

      <section style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        {truthFilters.map((option) => (
          <button
            key={option.value}
            onClick={() => handleFilterChange(option.value)}
            style={{
              background: filter === option.value ? "rgba(196, 138, 74, 0.18)" : "rgba(255, 255, 255, 0.04)",
              border: filter === option.value ? "1px solid rgba(196, 138, 74, 0.55)" : "1px solid var(--line)",
              borderRadius: 999,
              color: "var(--text)",
              cursor: "pointer",
              padding: "0.55rem 0.85rem"
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(360px, 0.95fr) minmax(460px, 1.25fr)"
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
              gridTemplateColumns: "2.2fr 1fr 1fr",
              letterSpacing: "0.08em",
              padding: "0.85rem 1rem",
              textTransform: "uppercase"
            }}
          >
            <span>Accepted Record</span>
            <span>Source Proposal</span>
            <span>Updated</span>
          </div>
          <div style={{ display: "grid" }}>
            {browser.items.length === 0 ? (
              <div style={{ color: "var(--muted)", padding: "1.25rem" }}>No accepted truth records match this filter.</div>
            ) : (
              browser.items.map((item) => {
                const isSelected = selectionMatches(item, selected);
                const sourceState = item.sourceCandidateCurrentExtraction
                  ? "current proposal"
                  : item.sourceCandidateSupersededAt
                    ? `superseded ${formatTimestamp(item.sourceCandidateSupersededAt)}`
                    : "superseded";

                return (
                  <button
                    key={`${item.acceptedRecordType}-${item.acceptedRecordId}`}
                    onClick={() =>
                      setSelected({
                        acceptedRecordId: item.acceptedRecordId,
                        acceptedRecordType: item.acceptedRecordType
                      })
                    }
                    style={{
                      alignItems: "center",
                      background: isSelected ? "rgba(255, 255, 255, 0.04)" : "transparent",
                      border: 0,
                      borderBottom: "1px solid var(--line)",
                      color: "var(--text)",
                      cursor: "pointer",
                      display: "grid",
                      gap: "1rem",
                      gridTemplateColumns: "2.2fr 1fr 1fr",
                      padding: "0.95rem 1rem",
                      textAlign: "left"
                    }}
                    type="button"
                  >
                    <div>
                      <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600 }}>{item.fieldName}</div>
                        <span
                          className={statusTone(item.sourceCandidateCurrentExtraction ? "accepted" : "rejected")}
                          style={{ borderRadius: 999, padding: "0.18rem 0.5rem" }}
                        >
                          {item.acceptedRecordType}
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.25rem" }}>
                        {item.artifactFileName}
                      </div>
                      <div style={{ fontSize: "0.86rem", marginTop: "0.35rem", whiteSpace: "pre-wrap" }}>
                        {formatCandidateValue(item.acceptedValue)}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      <span
                        className={statusTone(item.sourceCandidateReviewStatus)}
                        style={{ alignSelf: "flex-start", borderRadius: 999, padding: "0.25rem 0.65rem" }}
                      >
                        {humanizeStatus(item.sourceCandidateReviewStatus)}
                      </span>
                      <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{sourceState}</div>
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.84rem" }}>
                      {formatTimestamp(item.updatedAt)}
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
                <div style={{ color: "var(--muted)", fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Accepted Truth
                </div>
                <h2 style={{ margin: "0.35rem 0 0" }}>{detail.acceptedRecord.fieldName}</h2>
                <div style={{ color: "var(--muted)", marginTop: "0.35rem" }}>
                  {detail.acceptedRecord.acceptedRecordType} • {detail.artifact.originalFileName}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Accepted Record</div>
                <ContentCard
                  title={detail.acceptedRecord.id}
                  rows={[
                    ["Accepted Value", formatCandidateValue(detail.acceptedRecord.acceptedValue)],
                    ["Review Status", humanizeStatus(detail.acceptedRecord.reviewStatus)],
                    ["Reviewed By", `${detail.acceptedRecord.reviewerActorName} • ${formatTimestamp(detail.acceptedRecord.reviewedAt)}`],
                    ["Review Note", detail.acceptedRecord.reviewNote ?? "None"],
                    ["Value Type", detail.acceptedRecord.valueType],
                    ["Provenance Anchors", String(detail.acceptedRecord.provenanceAnchorIds.length)]
                  ]}
                />
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
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Evidence Packet</div>
                <ContentCard
                  title={detail.acceptedRecord.citationPacket.fieldName}
                  rows={[
                    ["Evidence Preview", detail.acceptedRecord.citationPacket.evidencePreview],
                    [
                      "Extraction Method",
                      `${detail.acceptedRecord.citationPacket.extractionMethod} • ${detail.acceptedRecord.citationPacket.extractionMethodDetail}`
                    ],
                    ["Source Candidate", detail.acceptedRecord.sourceCandidateId]
                  ]}
                />
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Proposal Lineage</div>
                <ContentCard
                  title={detail.lineage.sourceCandidateId}
                  rows={[
                    ["Source Candidate Status", humanizeStatus(detail.sourceCandidate.reviewStatus)],
                    ["Current Extraction", detail.lineage.sourceCandidateCurrentExtraction ? "Yes" : "No"],
                    [
                      "Superseded At",
                      detail.lineage.sourceCandidateSupersededAt
                        ? formatTimestamp(detail.lineage.sourceCandidateSupersededAt)
                        : "Still current"
                    ],
                    ["Candidate Summary", detail.sourceCandidate.summary],
                    ["Candidate Value", formatCandidateValue(detail.sourceCandidate.candidateValue)]
                  ]}
                />
                <div style={{ marginTop: "0.75rem" }}>
                  <div style={{ color: "var(--muted)", fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Newer Current Candidates In Same Artifact/Field Area
                  </div>
                  {detail.lineage.newerCandidates.length > 0 ? (
                    <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.55rem" }}>
                      {detail.lineage.newerCandidates.map((candidate) => (
                        <ContentCard
                          key={candidate.id}
                          title={candidate.id}
                          rows={[
                            ["Review Status", humanizeStatus(candidate.reviewStatus)],
                            ["Confidence", `${Math.round(candidate.confidence * 100)}%`],
                            ["Candidate Value", formatCandidateValue(candidate.candidateValue)],
                            ["Updated At", formatTimestamp(candidate.updatedAt)]
                          ]}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
                      No newer current candidates were found for this artifact and field area.
                    </div>
                  )}
                </div>
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
                  <div style={{ color: "var(--muted)" }}>No provenance anchors were loaded for this accepted record.</div>
                )}
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Review History</div>
                {detail.reviewHistory.length > 0 ? (
                  <ReviewHistoryTimeline entries={detail.reviewHistory} />
                ) : (
                  <div style={{ color: "var(--muted)" }}>No review history is recorded for this accepted record yet.</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--muted)" }}>Select an accepted record to inspect its source evidence and lineage.</div>
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

function ReviewHistoryTimeline(props: { entries: ReviewHistoryEntry[] }): ReactElement {
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
          {entry.reviewNote ? <div style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{entry.reviewNote}</div> : null}
          {entry.editedValue !== null ? (
            <div style={{ fontFamily: "\"SF Mono\", \"Menlo\", monospace", fontSize: "0.84rem", whiteSpace: "pre-wrap" }}>
              {formatCandidateValue(entry.editedValue)}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
