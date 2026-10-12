"use client";

import type { IntakeDetail, IntakeQueueItem } from "@remi/domain";
import { formatBytes, statusTone } from "@remi/ui";
import type { DragEvent, ReactElement } from "react";
import { startTransition, useEffect, useEffectEvent, useMemo, useState } from "react";

import { ConsoleNav } from "./console-nav";

type UploadState = {
  fileName: string;
  status: "done" | "error" | "uploading";
  message: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) {
    return "Not assessed";
  }

  return value ? "Yes" : "No";
}

function formatReasonCodes(codes: string[]): string {
  return codes.length > 0 ? codes.join(", ") : "None";
}

function humanizeStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function formatCandidateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Unserializable value";
  }
}

export function IntakeConsole(props: {
  apiBaseUrl: string;
  initialDetail: IntakeDetail | null;
  initialItems: IntakeQueueItem[];
}): ReactElement {
  const [items, setItems] = useState(props.initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialItems[0]?.id ?? null);
  const [detail, setDetail] = useState<IntakeDetail | null>(props.initialDetail);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStates, setUploadStates] = useState<UploadState[]>([]);

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
      setSelectedId(focusId ?? payload.items[0]?.id ?? null);
    } finally {
      setIsRefreshing(false);
    }
  });

  const loadDetail = useEffectEvent(async (sourceItemId: string) => {
    const payload = await parseJson<IntakeDetail>(
      await fetch(`${props.apiBaseUrl}/api/intake/${sourceItemId}`, {
        cache: "no-store"
      })
    );

    setDetail(payload);
  });

  useEffect(() => {
    if (selectedItem?.id) {
      void loadDetail(selectedItem.id);
    } else {
      setDetail(null);
    }
  }, [loadDetail, selectedItem?.id]);

  async function uploadSingleFile(file: File): Promise<string> {
    const contentType = file.type || "application/octet-stream";
    const presign = await parseJson<{ headers: Record<string, string>; uploadKey: string; uploadUrl: string }>(
      await fetch(`${props.apiBaseUrl}/api/uploads/presign`, {
        body: JSON.stringify({
          contentType,
          fileName: file.name,
          sizeBytes: file.size
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      })
    );

    const uploadResponse = await fetch(presign.uploadUrl, {
      body: file,
      headers: presign.headers,
      method: "PUT"
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload ${file.name}`);
    }

    const registration = await parseJson<{ sourceItemId: string }>(
      await fetch(`${props.apiBaseUrl}/api/intake/register`, {
        body: JSON.stringify({
          contentType,
          fileName: file.name,
          sizeBytes: file.size,
          uploadKey: presign.uploadKey
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      })
    );

    return registration.sourceItemId;
  }

  async function handleFiles(fileList: FileList | null): Promise<void> {
    if (!fileList?.length) {
      return;
    }

    const files = Array.from(fileList);
    setUploadStates(files.map((file) => ({ fileName: file.name, status: "uploading", message: "Uploading" })));

    let lastSourceItemId: string | null = null;

    for (const file of files) {
      try {
        lastSourceItemId = await uploadSingleFile(file);
        setUploadStates((current) =>
          current.map((state) =>
            state.fileName === file.name ? { ...state, message: "Registered", status: "done" } : state
          )
        );
      } catch (error) {
        setUploadStates((current) =>
          current.map((state) =>
            state.fileName === file.name
              ? {
                  ...state,
                  message: error instanceof Error ? error.message : "Upload failed",
                  status: "error"
                }
              : state
          )
        );
      }
    }

    startTransition(() => {
      void loadItems(lastSourceItemId ?? undefined);
    });
  }

  function handleDragEvent(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
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
          <h1 style={{ fontSize: "2rem", margin: "0.35rem 0 0.2rem" }}>Intake Queue</h1>
          <p style={{ color: "var(--muted)", margin: 0, maxWidth: "60ch" }}>
            Immutable artifact intake for uploads, mailbox drops, and file handoff. This slice only captures source
            truth, provenance, and run state.
          </p>
          <ConsoleNav current="intake" />
        </div>
        <button
          onClick={() => void loadItems(selectedId ?? undefined)}
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
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: "1rem",
          padding: "1rem"
        }}
      >
        <label
          htmlFor="intake-upload"
          onDragEnter={(event) => {
            handleDragEvent(event);
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            handleDragEvent(event);
            setIsDragging(false);
          }}
          onDragOver={handleDragEvent}
          onDrop={(event) => {
            handleDragEvent(event);
            setIsDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
          style={{
            alignItems: "center",
            background: isDragging
              ? "linear-gradient(135deg, rgba(196, 138, 74, 0.18), rgba(255, 255, 255, 0.04))"
              : "linear-gradient(135deg, rgba(196, 138, 74, 0.12), rgba(255, 255, 255, 0.02))",
            border: isDragging ? "1px solid rgba(196, 138, 74, 0.75)" : "1px dashed rgba(196, 138, 74, 0.45)",
            borderRadius: "0.85rem",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            padding: "1rem"
          }}
        >
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>
              {isDragging ? "Release files to stage intake" : "Drop files here or browse"}
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.92rem", marginTop: "0.2rem" }}>
              Inspection and minimal normalization are live for PDF, EML, and XLSX. Deferred formats stay visible
              without queue spam.
            </div>
          </div>
          <span
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              borderRadius: 999,
              padding: "0.55rem 0.85rem"
            }}
          >
            Select Files
          </span>
        </label>
        <input
          id="intake-upload"
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
          style={{ display: "none" }}
          type="file"
        />
        {uploadStates.length > 0 ? (
          <div
            style={{
              display: "grid",
              gap: "0.45rem",
              marginTop: "0.85rem"
            }}
          >
            {uploadStates.map((state) => (
              <div
                key={`${state.fileName}-${state.status}`}
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem"
                }}
              >
                <div>{state.fileName}</div>
                <span
                  className={statusTone(state.status)}
                  style={{
                    borderRadius: 999,
                    fontSize: "0.82rem",
                    padding: "0.28rem 0.65rem"
                  }}
                >
                  {state.message}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.9fr)"
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
              gridTemplateColumns: "2.4fr 1fr 1fr 0.9fr",
              letterSpacing: "0.08em",
              padding: "0.85rem 1rem",
              textTransform: "uppercase"
            }}
          >
            <span>Artifact</span>
            <span>Source</span>
            <span>Status</span>
            <span>Size</span>
          </div>
          <div style={{ display: "grid" }}>
            {items.length === 0 ? (
              <div style={{ color: "var(--muted)", padding: "1.25rem" }}>No intake items yet.</div>
            ) : (
              items.map((item) => {
                const isSelected = item.id === selectedItem?.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      alignItems: "center",
                      background: isSelected ? "rgba(255, 255, 255, 0.04)" : "transparent",
                      border: 0,
                      borderBottom: "1px solid var(--line)",
                      color: "var(--text)",
                      cursor: "pointer",
                      display: "grid",
                      gap: "1rem",
                      gridTemplateColumns: "2.4fr 1fr 1fr 0.9fr",
                      padding: "0.95rem 1rem",
                      textAlign: "left"
                    }}
                    type="button"
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.fileName}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.2rem" }}>
                        {item.contentType ?? "unknown content type"}
                      </div>
                    </div>
                    <div>
                      <div>{item.sourceConnectionName}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.2rem" }}>
                        {item.sourceConnectionKind}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      <span
                        className={statusTone(item.status)}
                        style={{ alignSelf: "flex-start", borderRadius: 999, padding: "0.25rem 0.65rem" }}
                      >
                        {item.status}
                      </span>
                      <span style={{ color: "var(--muted)", fontSize: "0.84rem" }}>
                        {item.supportTier ?? "pending"} •{" "}
                        {item.normalizationStatus ?? item.inspectionStatus ?? item.ingestionStage}
                      </span>
                    </div>
                    <div>{formatBytes(item.sizeBytes)}</div>
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
                  Provenance
                </div>
                <h2 style={{ margin: "0.35rem 0 0" }}>{detail.fileName}</h2>
              </div>

              <div style={{ display: "grid", gap: "0.8rem" }}>
                <MetadataRow label="Support Tier" value={detail.supportTier ?? "Pending"} />
                <MetadataRow label="Parser Target" value={detail.parserTarget ?? "Pending"} />
                <MetadataRow label="Inspection Status" value={detail.inspectionStatus ?? "Pending"} />
                <MetadataRow label="Normalization Status" value={detail.normalizationResult.status} />
                <MetadataRow label="File Classification" value={detail.fileClassification ?? "Pending"} />
                <MetadataRow label="Normalized Extension" value={detail.normalizedExtension ?? "Unknown"} />
                <MetadataRow label="Source URI" value={detail.sourceUri} />
                <MetadataRow label="Created" value={formatTimestamp(detail.createdAt)} />
                <MetadataRow label="Updated" value={formatTimestamp(detail.updatedAt)} />
                <MetadataRow label="Content Type" value={detail.contentType ?? "Unknown"} />
                <MetadataRow label="Parser Eligible" value={detail.parserEligible ? "Yes" : "No"} />
                <MetadataRow label="Native Text Present" value={formatNullableBoolean(detail.nativeTextPresent)} />
                <MetadataRow label="OCR Needed Later" value={formatNullableBoolean(detail.ocrNeededLater)} />
                <MetadataRow label="Container / Archive" value={formatNullableBoolean(detail.isContainer)} />
                <MetadataRow label="Immutable Key" value={detail.immutableStorageKey ?? "Pending"} />
                <MetadataRow label="Artifact SHA" value={detail.artifactSha256 ?? "Pending"} />
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Parser Result</div>
                <div style={{ display: "grid", gap: "0.65rem", marginBottom: "1rem" }}>
                  <MetadataRow label="Summary" value={detail.normalizationResult.summary} />
                  <MetadataRow label="Reason Codes" value={formatReasonCodes(detail.normalizationResult.reasonCodes)} />
                  <MetadataRow
                    label="Retry Recommended"
                    value={detail.normalizationResult.retryRecommended ? "Yes" : "No"}
                  />
                  <MetadataRow
                    label="Reprocess Recommended"
                    value={detail.normalizationResult.reprocessRecommended ? "Yes" : "No"}
                  />
                  <MetadataRow
                    label="Last Updated"
                    value={
                      detail.normalizationResult.lastUpdatedAt
                        ? formatTimestamp(detail.normalizationResult.lastUpdatedAt)
                        : "Not recorded"
                    }
                  />

                  {detail.normalizationResult.warnings.length > 0 ? (
                    <ContentCard
                      title="Warnings"
                      rows={detail.normalizationResult.warnings.map((warning) => [warning.code, warning.message])}
                    />
                  ) : null}
                </div>

                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Normalized Content</div>
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  <MetadataRow label="Content Kind" value={detail.normalizedContent.contentKind ?? "None"} />
                  <MetadataRow
                    label="Last Normalized"
                    value={
                      detail.normalizedContent.lastNormalizedAt
                        ? formatTimestamp(detail.normalizedContent.lastNormalizedAt)
                        : "Not available"
                    }
                  />

                  {!detail.normalizedContent.contentKind ? (
                    <div style={{ color: "var(--muted)" }}>
                      No normalized content objects are currently stored for this artifact.
                    </div>
                  ) : null}

                  {detail.normalizedContent.document ? (
                    <ContentCard
                      title="Document"
                      rows={[
                        ["Document ID", detail.normalizedContent.document.id],
                        ["Title", detail.normalizedContent.document.title ?? "Untitled"],
                        ["Page Count", String(detail.normalizedContent.document.pageCount)],
                        ["Text Available", detail.normalizedContent.document.textAvailable ? "Yes" : "No"],
                        ["Text Preview", detail.normalizedContent.document.textPreview ?? "No preview"]
                      ]}
                    />
                  ) : null}

                  {detail.normalizedContent.documentPages.length > 0 ? (
                    <ContentCard
                      title="Document Pages"
                      rows={detail.normalizedContent.documentPages.map((page) => [
                        `Page ${page.pageNumber}`,
                        `${page.charCount} chars${page.textAvailable ? " • text available" : ""}${page.textPreview ? ` • ${page.textPreview}` : ""}`
                      ])}
                    />
                  ) : null}

                  {detail.normalizedContent.emailThread ? (
                    <ContentCard
                      title="Email Thread"
                      rows={[
                        ["Thread ID", detail.normalizedContent.emailThread.id],
                        ["Thread Key", detail.normalizedContent.emailThread.threadKey],
                        ["Subject", detail.normalizedContent.emailThread.subject ?? "No subject"],
                        ["Message Count", String(detail.normalizedContent.emailThread.messageCount)]
                      ]}
                    />
                  ) : null}

                  {detail.normalizedContent.emailMessages.length > 0 ? (
                    <ContentCard
                      title="Email Message"
                      rows={detail.normalizedContent.emailMessages.flatMap((message) => [
                        ["Message ID", message.id],
                        ["Position", String(message.position)],
                        ["From", message.sender ?? "Unknown"],
                        ["To", message.to.join(", ") || "None"],
                        ["CC", message.cc.join(", ") || "None"],
                        ["Sent", message.sentAt ? formatTimestamp(message.sentAt) : (message.sentAtRaw ?? "Unknown")],
                        ["Attachment Count", String(message.attachmentCount)],
                        ["Body Preview", message.bodyPreview ?? "No preview"]
                      ])}
                    />
                  ) : null}

                  {detail.normalizedContent.attachments.length > 0 ? (
                    <ContentCard
                      title="Attachments"
                      rows={detail.normalizedContent.attachments.map((attachment) => [
                        `Part ${attachment.partIndex}`,
                        `${attachment.fileName ?? "Unnamed"} • ${attachment.contentType ?? "unknown"}${attachment.sizeBytes ? ` • ${formatBytes(attachment.sizeBytes)}` : ""}${attachment.sha256 ? ` • ${attachment.sha256}` : ""}${attachment.promotionStatus ? ` • promotion ${attachment.promotionStatus}` : ""}${attachment.promotionSummary ? ` • ${attachment.promotionSummary}` : ""}${attachment.promotedArtifact ? ` • child ${attachment.promotedArtifact.artifactBlobId} • ${attachment.promotedArtifact.supportTier ?? "pending"} / ${attachment.promotedArtifact.parserTarget ?? "none"} / ${attachment.promotedArtifact.normalizationStatus ?? "pending"}${attachment.promotedArtifact.contentKind ? ` / ${attachment.promotedArtifact.contentKind}` : ""}${attachment.promotedArtifact.summary ? ` • ${attachment.promotedArtifact.summary}` : ""}` : ""}`
                      ])}
                    />
                  ) : null}

                  {detail.normalizedContent.workbook ? (
                    <ContentCard
                      title="Workbook"
                      rows={[
                        ["Workbook ID", detail.normalizedContent.workbook.id],
                        ["File Name", detail.normalizedContent.workbook.fileName],
                        ["Sheet Count", String(detail.normalizedContent.workbook.sheetCount)]
                      ]}
                    />
                  ) : null}

                  {detail.normalizedContent.worksheets.length > 0 ? (
                    <ContentCard
                      title="Worksheets"
                      rows={detail.normalizedContent.worksheets.map((worksheet) => [
                        `${worksheet.sheetIndex}: ${worksheet.name}`,
                        `${worksheet.maxRow ?? 0} rows • ${worksheet.maxColumn ?? 0} cols • ${worksheet.tableCount} tables`
                      ])}
                    />
                  ) : null}

                  {detail.normalizedContent.structuredTables.length > 0 ? (
                    <ContentCard
                      title="Structured Tables"
                      rows={detail.normalizedContent.structuredTables.map((table) => [
                        table.name,
                        `${table.ref ?? "No ref"}${table.headerRowCount !== null ? ` • header rows ${table.headerRowCount}` : ""}`
                      ])}
                    />
                  ) : null}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Provenance Anchors</div>
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  <MetadataRow label="Total Anchors" value={String(detail.provenanceAnchors.totalCount)} />
                  <MetadataRow
                    label="Anchor Groups"
                    value={
                      detail.provenanceAnchors.groups.length > 0
                        ? detail.provenanceAnchors.groups
                            .map((group) => `${group.anchorKind} (${group.count})`)
                            .join(", ")
                        : "None"
                    }
                  />

                  {detail.provenanceAnchors.items.length > 0 ? (
                    <ContentCard
                      title="Anchor Manifest"
                      rows={detail.provenanceAnchors.items.map((anchor) => [
                        `${anchor.anchorKind} • ${anchor.title}`,
                        `${anchor.summary} • ${JSON.stringify(anchor.locator)}`
                      ])}
                    />
                  ) : (
                    <div style={{ color: "var(--muted)" }}>
                      No provenance anchors are currently recorded for this artifact.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Candidate Signals</div>
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  <MetadataRow label="Extraction Status" value={detail.candidateExtractionResult.status} />
                  <MetadataRow label="Summary" value={detail.candidateExtractionResult.summary} />
                  <MetadataRow
                    label="Candidate Count"
                    value={String(detail.candidateExtractionResult.candidateCount)}
                  />
                  <MetadataRow
                    label="Reason Codes"
                    value={formatReasonCodes(detail.candidateExtractionResult.reasonCodes)}
                  />
                  <MetadataRow
                    label="Retry Recommended"
                    value={detail.candidateExtractionResult.retryRecommended ? "Yes" : "No"}
                  />
                  <MetadataRow
                    label="Reprocess Recommended"
                    value={detail.candidateExtractionResult.reprocessRecommended ? "Yes" : "No"}
                  />
                  <MetadataRow
                    label="Last Updated"
                    value={
                      detail.candidateExtractionResult.lastUpdatedAt
                        ? formatTimestamp(detail.candidateExtractionResult.lastUpdatedAt)
                        : "Not recorded"
                    }
                  />

                  {detail.candidateExtractionResult.warnings.length > 0 ? (
                    <ContentCard
                      title="Candidate Warnings"
                      rows={detail.candidateExtractionResult.warnings.map((warning) => [warning.code, warning.message])}
                    />
                  ) : null}

                  {detail.candidateSignals.length > 0 ? (
                    detail.candidateSignals.map((candidate) => (
                      <ContentCard
                        key={candidate.id}
                        title={`${candidate.candidateType} • ${candidate.fieldName}`}
                        rows={[
                          ["Value", formatCandidateValue(candidate.candidateValue)],
                          ["Confidence", `${Math.round(candidate.confidence * 100)}%`],
                          ["Method", `${candidate.extractionMethod} • ${candidate.extractionMethodDetail}`],
                          ["Review Ready", candidate.reviewReady ? "Yes" : "No"],
                          ["Review Status", humanizeStatus(candidate.reviewStatus)],
                          [
                            "Reviewed By",
                            candidate.reviewedByActorName
                              ? `${candidate.reviewedByActorName}${candidate.reviewedAt ? ` • ${formatTimestamp(candidate.reviewedAt)}` : ""}`
                              : "Not reviewed"
                          ],
                          [
                            "Edited Value",
                            candidate.reviewedValue !== null ? formatCandidateValue(candidate.reviewedValue) : "None"
                          ],
                          [
                            "Accepted Record",
                            candidate.acceptedRecordId
                              ? `${candidate.acceptedRecordType} • ${candidate.acceptedRecordId}`
                              : "None"
                          ],
                          ["Summary", candidate.summary],
                          ["Evidence Preview", candidate.citationPacket.evidencePreview],
                          ["Anchor IDs", candidate.citationPacket.provenanceAnchorIds.join(", ")],
                          [
                            "Source Semantic Object",
                            candidate.sourceSemanticObjectId
                              ? `${candidate.sourceSemanticObjectType ?? "unknown"} • ${candidate.sourceSemanticObjectId}`
                              : "Artifact scoped"
                          ]
                        ]}
                      />
                    ))
                  ) : (
                    <div style={{ color: "var(--muted)" }}>
                      No reviewable candidate signals are currently stored for this artifact.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Derived Artifacts</div>
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  {detail.derivedArtifacts.length > 0 ? (
                    detail.derivedArtifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        style={{
                          border: "1px solid var(--line)",
                          borderRadius: "0.8rem",
                          padding: "0.75rem"
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {artifact.kind} • v{artifact.version}
                        </div>
                        <div
                          style={{
                            color: "var(--muted)",
                            fontSize: "0.82rem",
                            marginTop: "0.2rem",
                            wordBreak: "break-word"
                          }}
                        >
                          {artifact.storageKey}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "var(--muted)" }}>No derived artifacts recorded yet.</div>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>Timeline</div>
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {detail.timeline.map((event) => (
                    <div
                      key={event.id}
                      style={{ borderLeft: "2px solid rgba(196, 138, 74, 0.4)", paddingLeft: "0.75rem" }}
                    >
                      <div style={{ fontWeight: 600 }}>{event.message}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: "0.18rem" }}>
                        {event.eventType} • {formatTimestamp(event.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: "var(--muted)" }}>Select an intake item to inspect its provenance and run state.</div>
          )}
        </aside>
      </section>
    </main>
  );
}

function MetadataRow(props: { label: string; value: string }): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.24rem" }}>
      <div style={{ color: "var(--muted)", fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {props.label}
      </div>
      <div style={{ fontSize: "0.94rem", lineHeight: 1.45, wordBreak: "break-word" }}>{props.value}</div>
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
            <div style={{ fontSize: "0.9rem", lineHeight: 1.45, wordBreak: "break-word" }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
