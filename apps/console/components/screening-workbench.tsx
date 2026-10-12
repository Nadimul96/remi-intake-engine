"use client";

import type { DealScreeningWorkbench, IntakeQueueItem, ScreeningIssue, ScreeningReadinessStatus } from "@remi/domain";
import { formatBytes, statusTone } from "@remi/ui";
import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useMemo, useState } from "react";
import type { ReactElement } from "react";

import { ConsoleNav } from "./console-nav";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  return response.json() as Promise<T>;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

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

function readinessBadge(status: ScreeningReadinessStatus): { background: string; border: string; color: string; label: string } {
  switch (status) {
    case "ready":
      return {
        background: "rgba(34, 197, 94, 0.14)",
        border: "rgba(34, 197, 94, 0.42)",
        color: "#86efac",
        label: "Ready"
      };
    case "needs_review":
      return {
        background: "rgba(245, 158, 11, 0.14)",
        border: "rgba(245, 158, 11, 0.42)",
        color: "#fcd34d",
        label: "Needs Review"
      };
    case "insufficient_context":
      return {
        background: "rgba(239, 68, 68, 0.14)",
        border: "rgba(248, 113, 113, 0.42)",
        color: "#fca5a5",
        label: "Insufficient Context"
      };
  }
}

function issueLabel(issue: ScreeningIssue): string {
  switch (issue.kind) {
    case "candidate_review":
      return "Candidate Review";
    case "asset_identity":
      return "Asset Identity";
    case "organization_identity":
      return "Organization Identity";
    case "relationship_review":
      return "Relationship";
    case "intake_processing":
      return "Intake";
  }
}

export function ScreeningWorkbench(props: {
  apiBaseUrl: string;
  initialItems: IntakeQueueItem[];
  initialWorkbench: DealScreeningWorkbench | null;
}): ReactElement {
  const [items, setItems] = useState(props.initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(
    props.initialWorkbench?.sourceItem.id ?? props.initialItems[0]?.id ?? null
  );
  const [workbench, setWorkbench] = useState<DealScreeningWorkbench | null>(props.initialWorkbench);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );

  const loadItems = useEffectEvent(async (focusId?: string) => {
    setIsRefreshing(true);

    try {
      const payload = await parseJson<{ items: IntakeQueueItem[] }>(
        await fetch(`${props.apiBaseUrl}/api/intake`, {
          cache: "no-store"
        })
      );

      setItems(payload.items);
      setSelectedId((current) => {
        const preferred = focusId ?? current;
        if (preferred && payload.items.some((item) => item.id === preferred)) {
          return preferred;
        }

        return payload.items[0]?.id ?? null;
      });
    } finally {
      setIsRefreshing(false);
    }
  });

  const loadWorkbench = useEffectEvent(async (sourceItemId: string) => {
    const payload = await parseJson<DealScreeningWorkbench>(
      await fetch(`${props.apiBaseUrl}/api/screening/${sourceItemId}`, {
        cache: "no-store"
      })
    );

    setWorkbench(payload);
  });

  useEffect(() => {
    if (selectedItem?.id) {
      void loadWorkbench(selectedItem.id);
    } else {
      setWorkbench(null);
    }
  }, [loadWorkbench, selectedItem?.id]);

  const badge = readinessBadge(workbench?.readiness.status ?? "insufficient_context");

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
          <h1 style={{ fontSize: "2rem", margin: "0.35rem 0 0.2rem" }}>Deal Screening Workbench</h1>
          <p style={{ color: "var(--muted)", margin: 0, maxWidth: "70ch" }}>
            Deterministic operator workspace for one intake package. This surface assembles intake context, candidate
            signals, accepted truth, canonical identity status, relationship status, and the exact gaps that still block
            a trusted screening output.
          </p>
          <ConsoleNav current="screening" />
        </div>
        <button
          onClick={() => {
            startTransition(() => {
              void loadItems(selectedId ?? undefined);
            });
          }}
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
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
        }}
      >
        <SummaryCard label="Readiness" value={badge.label} tone={badge.color} />
        <SummaryCard label="Pending Candidate Reviews" value={String(workbench?.readiness.pendingCandidateReviews ?? 0)} />
        <SummaryCard
          label="Asset Identity"
          value={`${workbench?.readiness.assetIdentity.resolvedCurrent ?? 0}/${workbench?.readiness.assetIdentity.currentTotal ?? 0}`}
        />
        <SummaryCard
          label="Organization Identity"
          value={`${workbench?.readiness.organizationIdentity.resolvedCurrent ?? 0}/${workbench?.readiness.organizationIdentity.currentTotal ?? 0}`}
        />
        <SummaryCard
          label="Relationships"
          value={`${workbench?.readiness.relationships.resolvedCurrent ?? 0}/${workbench?.readiness.relationships.currentTotal ?? 0}`}
        />
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          alignItems: "start",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))"
        }}
      >
        <aside
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "1rem",
            overflow: "hidden"
          }}
        >
          <div style={{ borderBottom: "1px solid var(--line)", padding: "1rem" }}>
            <div style={{ fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
              Source Packets
            </div>
            <div style={{ color: "var(--muted)", marginTop: "0.35rem" }}>
              Select one intake package to inspect readiness and unresolved screening work.
            </div>
          </div>
          {items.length === 0 ? (
            <div style={{ color: "var(--muted)", padding: "1rem" }}>No intake items are available yet.</div>
          ) : (
            <div style={{ display: "grid" }}>
              {items.map((item) => {
                const active = item.id === selectedItem?.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      background: active ? "rgba(196, 138, 74, 0.12)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--line)",
                      color: "var(--text)",
                      cursor: "pointer",
                      padding: "0.9rem 1rem",
                      textAlign: "left"
                    }}
                    type="button"
                  >
                    <div style={{ fontWeight: 600 }}>{item.fileName}</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: "0.15rem" }}>
                      {humanizeStatus(item.ingestionStatus)} / {humanizeStatus(item.ingestionStage)}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                      {formatTimestamp(item.updatedAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {!workbench ? (
          <section
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: "1rem",
              padding: "1.25rem",
              color: "var(--muted)"
            }}
          >
            Select a source packet to inspect its screening workbench.
          </section>
        ) : (
          <section style={{ display: "grid", gap: "1rem" }}>
            <Panel title="Screening Readiness">
              <div style={{ display: "grid", gap: "0.9rem" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "fit-content",
                    padding: "0.4rem 0.7rem",
                    borderRadius: 999,
                    background: badge.background,
                    border: `1px solid ${badge.border}`,
                    color: badge.color
                  }}
                >
                  {badge.label}
                </div>
                <div style={{ fontSize: "1.02rem", lineHeight: 1.6 }}>{workbench.readiness.about}</div>
                <div style={{ color: "var(--muted)" }}>
                  Human attention required: {workbench.readiness.needsAttention.length}
                </div>
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  {workbench.readiness.needsAttention.length === 0 ? (
                    <div style={{ color: "var(--muted)" }}>No unresolved screening blockers are currently visible.</div>
                  ) : (
                    workbench.readiness.needsAttention.map((issue) => (
                      <div
                        key={issue.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid var(--line)",
                          borderRadius: "0.85rem",
                          padding: "0.85rem"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                          <strong>{issue.title}</strong>
                          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{issueLabel(issue)}</span>
                        </div>
                        <div style={{ color: "var(--muted)", marginTop: "0.35rem" }}>{issue.summary}</div>
                        <Link href={issue.href} style={{ color: "var(--accent)", display: "inline-block", marginTop: "0.55rem" }}>
                          Open lane
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Panel>

            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              <Panel title="Source Packet Context">
                <MetadataGrid
                  rows={[
                    ["File", workbench.sourceItem.fileName],
                    ["Content Type", workbench.sourceItem.contentType ?? "Unknown"],
                    ["Size", formatBytes(workbench.sourceItem.sizeBytes)],
                    ["Source", workbench.sourceItem.sourceConnectionName],
                    ["Support Tier", workbench.sourceItem.supportTier ?? "Unknown"],
                    ["Parser Target", workbench.sourceItem.parserTarget ?? "Unknown"],
                    ["Normalized Kind", workbench.sourceItem.normalizedContent.contentKind ?? "None"],
                    ["Thread Subject", workbench.sourceItem.normalizedContent.emailThread?.subject ?? "No email thread"],
                    ["Messages", String(workbench.sourceItem.normalizedContent.emailMessages.length)],
                    ["Attachments", String(workbench.sourceItem.normalizedContent.attachments.length)]
                  ]}
                />
                <div style={{ color: "var(--muted)", marginTop: "0.85rem" }}>
                  Candidate extraction: {workbench.sourceItem.candidateExtractionResult.summary}
                </div>
              </Panel>

              <Panel title="Accepted Truth Summary">
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  <div style={{ color: "var(--muted)" }}>
                    {workbench.acceptedTruth.counts.all} accepted record(s) from this intake package.
                  </div>
                  {workbench.acceptedTruth.items.length === 0 ? (
                    <div style={{ color: "var(--muted)" }}>No accepted truth is attached to this source packet yet.</div>
                  ) : (
                    workbench.acceptedTruth.items.map((item) => (
                      <div
                        key={item.acceptedRecordId}
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid var(--line)",
                          borderRadius: "0.85rem",
                          padding: "0.8rem"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                          <strong>{item.fieldName.replaceAll("_", " ")}</strong>
                          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{item.acceptedRecordType}</span>
                        </div>
                        <pre style={{ margin: "0.45rem 0 0", whiteSpace: "pre-wrap", color: "var(--muted)" }}>
                          {formatCandidateValue(item.acceptedValue)}
                        </pre>
                      </div>
                    ))
                  )}
                  <Link href="/truth" style={{ color: "var(--accent)" }}>
                    Open accepted truth browser
                  </Link>
                </div>
              </Panel>

              <Panel title="Candidate Signals">
                <div style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
                  {workbench.candidateSignals.items.length} current signal(s), {workbench.candidateSignals.pendingReview} pending review.
                </div>
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  {workbench.candidateSignals.items.length === 0 ? (
                    <div style={{ color: "var(--muted)" }}>No candidate signals were recorded for this source packet.</div>
                  ) : (
                    workbench.candidateSignals.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid var(--line)",
                          borderRadius: "0.85rem",
                          padding: "0.8rem"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                          <strong>{item.fieldName.replaceAll("_", " ")}</strong>
                          <span className={statusTone(item.reviewStatus)} style={{ textTransform: "capitalize" }}>
                            {humanizeStatus(item.reviewStatus)}
                          </span>
                        </div>
                        <div style={{ color: "var(--muted)", marginTop: "0.35rem" }}>{item.summary}</div>
                      </div>
                    ))
                  )}
                  <Link href="/review" style={{ color: "var(--accent)" }}>
                    Open candidate review
                  </Link>
                </div>
              </Panel>

              <Panel title="Canonical Identity Status">
                <div style={{ display: "grid", gap: "0.9rem" }}>
                  <LaneSection
                    items={workbench.entityResolution.assetItems.map((item) => ({
                      id: item.proposal.id,
                      label: item.acceptedFieldName.replaceAll("_", " "),
                      resolvedLabel: item.currentEntityLink?.canonicalEntityDisplayName ?? null,
                      statusExplanation: item.proposal.statusExplanation
                    }))}
                    title="Asset identity"
                  />
                  <LaneSection
                    items={workbench.entityResolution.organizationItems.map((item) => ({
                      id: item.proposal.id,
                      label: item.acceptedFieldName.replaceAll("_", " "),
                      resolvedLabel: item.currentEntityLink?.canonicalEntityDisplayName ?? null,
                      statusExplanation: item.proposal.statusExplanation
                    }))}
                    title="Organization identity"
                  />
                  <Link href="/entities" style={{ color: "var(--accent)" }}>
                    Open entity reconciliation
                  </Link>
                </div>
              </Panel>

              <Panel title="Relationship Summary">
                <div style={{ display: "grid", gap: "0.9rem" }}>
                  <LaneSection
                    items={workbench.relationships.currentItems.map((item) => ({
                      id: item.proposal.id,
                      label: item.proposal.relationshipType.replaceAll("_", " "),
                      resolvedLabel: item.currentRelationshipLink
                        ? `${item.currentRelationshipLink.canonicalAssetDisplayName} -> ${item.currentRelationshipLink.canonicalOrganizationDisplayName}`
                        : null,
                      statusExplanation: item.proposal.statusExplanation
                    }))}
                    title="Current relationship lanes"
                  />
                  <LaneSection
                    items={workbench.relationships.historicalItems.map((item) => ({
                      id: item.proposal.id,
                      label: item.proposal.relationshipType.replaceAll("_", " "),
                      resolvedLabel: item.currentRelationshipLink
                        ? `${item.currentRelationshipLink.canonicalAssetDisplayName} -> ${item.currentRelationshipLink.canonicalOrganizationDisplayName}`
                        : null,
                      statusExplanation: item.proposal.statusExplanation
                    }))}
                    title="Historical relationship lanes"
                  />
                  <Link href="/relationships" style={{ color: "var(--accent)" }}>
                    Open relationship reconciliation
                  </Link>
                </div>
              </Panel>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function SummaryCard(props: { label: string; tone?: string; value: string }): ReactElement {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: "1rem",
        padding: "0.9rem 1rem"
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {props.label}
      </div>
      <div style={{ color: props.tone ?? "var(--text)", fontSize: "1.2rem", fontWeight: 600, marginTop: "0.35rem" }}>
        {props.value}
      </div>
    </div>
  );
}

function Panel(props: { children: ReactElement | ReactElement[]; title: string }): ReactElement {
  return (
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: "1rem",
        padding: "1rem"
      }}
    >
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem" }}>{props.title}</h2>
      {props.children}
    </section>
  );
}

function MetadataGrid(props: { rows: Array<[string, string]> }): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      {props.rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            display: "grid",
            gap: "0.35rem",
            gridTemplateColumns: "180px minmax(0, 1fr)",
            paddingBottom: "0.55rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.05)"
          }}
        >
          <div style={{ color: "var(--muted)" }}>{label}</div>
          <div>{value}</div>
        </div>
      ))}
    </div>
  );
}

function LaneSection(props: {
  items: Array<{ id: string; label: string; resolvedLabel: string | null; statusExplanation: string }>;
  title: string;
}): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.55rem" }}>
      <div style={{ color: "var(--muted)", fontSize: "0.86rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {props.title}
      </div>
      {props.items.length === 0 ? (
        <div style={{ color: "var(--muted)" }}>No lanes are currently present.</div>
      ) : (
        props.items.map((item) => (
          <div
            key={item.id}
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--line)",
              borderRadius: "0.85rem",
              padding: "0.8rem"
            }}
          >
            <div style={{ fontWeight: 600 }}>{item.label}</div>
            <div style={{ color: item.resolvedLabel ? "var(--text)" : "var(--muted)", marginTop: "0.25rem" }}>
              {item.resolvedLabel ?? item.statusExplanation}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
