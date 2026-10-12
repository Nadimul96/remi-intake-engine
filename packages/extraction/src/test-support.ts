import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NormalizedContentSummary, ProvenanceAnchorsSummary, WorksheetRow } from "@remi/domain";

import { buildProvenanceAnchors } from "./anchors";
import type { CandidateRecord } from "./conflicts/detect";
import type { ExtractionContext } from "./document-view";
import { extractEvidenceBackedCandidates } from "./extract";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");

interface Snapshot {
  fileName: string;
  sha256: string;
  parserTarget: string;
  normalized: {
    kind: "document" | "email" | "workbook";
    document?: {
      title: string | null;
      pageCount: number;
      textAvailable: boolean;
      textPreview: string | null;
      metadata: { source?: string };
      pages: {
        pageNumber: number;
        textAvailable: boolean;
        charCount: number;
        text: string | null;
        textPreview: string | null;
      }[];
    };
    workbook?: {
      fileName: string;
      sheetCount: number;
      worksheets: {
        sheetIndex: number;
        name: string;
        maxRow: number | null;
        maxColumn: number | null;
        tableCount: number;
        rows: WorksheetRow[];
      }[];
    };
  };
}

export interface FixtureArtifact {
  relativePath: string;
  sha256: string;
  context: ExtractionContext;
}

export function demoSet(): { root: string; files: string[]; expectedConflictKeys: string[] } {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "fixtures/demo-set.json"), "utf8"));
}

function snapshotName(relativePath: string): string {
  const base = path.basename(relativePath);
  return `${base
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()}.json`;
}

/** Mirror what persistence does in production: assign ids to normalized content, then anchors. */
export function toNormalizedSummary(snapshot: Snapshot, prefix: string): NormalizedContentSummary {
  const { normalized } = snapshot;
  const document = normalized.document;
  const workbook = normalized.workbook;

  return {
    contentKind: normalized.kind,
    lastNormalizedAt: null,
    document: document
      ? {
          id: `${prefix}_document`,
          sourceFormat: document.metadata.source === "pdf" ? "pdf" : "text",
          title: document.title,
          pageCount: document.pageCount,
          textAvailable: document.textAvailable,
          textPreview: document.textPreview
        }
      : null,
    documentPages: (document?.pages ?? []).map((page) => ({
      id: `${prefix}_page_${page.pageNumber}`,
      pageNumber: page.pageNumber,
      textAvailable: page.textAvailable,
      charCount: page.charCount,
      textPreview: page.textPreview,
      text: page.text
    })),
    emailThread: null,
    emailMessages: [],
    attachments: [],
    workbook: workbook
      ? { id: `${prefix}_workbook`, fileName: workbook.fileName, sheetCount: workbook.sheetCount }
      : null,
    worksheets: (workbook?.worksheets ?? []).map((sheet) => ({
      id: `${prefix}_sheet_${sheet.sheetIndex}`,
      sheetIndex: sheet.sheetIndex,
      name: sheet.name,
      maxRow: sheet.maxRow,
      maxColumn: sheet.maxColumn,
      tableCount: sheet.tableCount,
      rows: sheet.rows
    })),
    structuredTables: []
  };
}

export function anchorsFor(content: NormalizedContentSummary, prefix: string): ProvenanceAnchorsSummary {
  const items = buildProvenanceAnchors(content).map((anchor, index) => ({
    id: `${prefix}_anchor_${index}`,
    ...anchor
  }));
  return { totalCount: items.length, groups: [], items };
}

/** Load the demo set as the pipeline would see it, collapsing byte-identical files into one artifact. */
export function loadFixtureArtifacts(): FixtureArtifact[] {
  const seen = new Set<string>();
  const artifacts: FixtureArtifact[] = [];

  demoSet().files.forEach((relativePath, index) => {
    const snapshot: Snapshot = JSON.parse(
      readFileSync(path.join(PACKAGE_ROOT, "test/snapshots", snapshotName(relativePath)), "utf8")
    );
    if (seen.has(snapshot.sha256)) {
      return;
    }
    seen.add(snapshot.sha256);
    const prefix = `a${index}`;
    const normalizedContent = toNormalizedSummary(snapshot, prefix);
    artifacts.push({
      relativePath,
      sha256: snapshot.sha256,
      context: {
        artifactBlobId: `blob_${prefix}`,
        fileName: snapshot.fileName,
        normalizedContent,
        provenanceAnchors: anchorsFor(normalizedContent, prefix)
      }
    });
  });
  return artifacts;
}

/** Run extraction over the demo set and shape the drafts the way the candidate store returns them. */
export function extractFixtureRecords(): CandidateRecord[] {
  return loadFixtureArtifacts().flatMap((artifact) =>
    extractEvidenceBackedCandidates(artifact.context).map((draft, index) => ({
      id: `${artifact.context.artifactBlobId}_candidate_${index}`,
      artifactBlobId: artifact.context.artifactBlobId,
      fileName: artifact.context.fileName,
      fieldName: draft.fieldName,
      candidateValue: draft.candidateValue,
      extractionMethodDetail: draft.extractionMethodDetail,
      metadata: draft.metadata ?? {},
      provenanceAnchorIds: draft.citationPacket.provenanceAnchorIds,
      evidence: draft.citationPacket.evidencePreview,
      locatorHint: (draft.citationPacket.extractionMetadata.locatorHint as string | null | undefined) ?? null
    }))
  );
}
