import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { createId } from "@remi/domain";

import { replaceExtractedCandidates } from "./candidates";
import { closeDb, getDb } from "./client";
import {
  type ConflictDetectionInput,
  type DetectedConflictInput,
  decideConflict,
  getConflict,
  listConflicts,
  runConflictDetection
} from "./conflicts";

const sql = getDb();

after(async () => {
  await closeDb();
});

async function seedMetricCandidate(input: { tenantId: string; fileName: string; value: number }): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const artifactId = createId("artifact");
  const anchorId = createId("anchor");

  await sql`
    insert into artifact_blobs (id, tenant_id, sha256, storage_bucket, storage_key, original_file_name, content_type, size_bytes)
    values (${artifactId}, ${input.tenantId}, ${`sha-${suffix}`}, ${"verification"}, ${`tests/${suffix}`}, ${input.fileName}, ${"text/csv"}, ${100})
  `;
  await sql`
    insert into provenance_anchors (
      id, tenant_id, artifact_blob_id, owner_type, owner_id, anchor_kind, anchor_key, title, summary, locator_json, metadata_json
    ) values (
      ${anchorId}, ${input.tenantId}, ${artifactId}, ${"worksheet"}, ${artifactId}, ${"worksheet_row"}, ${"sheet:0:row:20"},
      ${"row 20"}, ${`Landscaping/Grounds | ${input.value}`}, ${"{}"}::jsonb, ${"{}"}::jsonb
    )
  `;

  const candidateValue = { metric: "landscaping_grounds", value: input.value, display: `$${input.value}` };
  const [candidate] = await replaceExtractedCandidates({
    artifactBlobId: artifactId,
    tenantId: input.tenantId,
    candidates: [
      {
        artifactBlobId: artifactId,
        candidateKey: `landscaping-${suffix}`,
        candidateType: "metric_fact_candidate",
        fieldName: "metric.landscaping_grounds",
        valueType: "metric",
        candidateValue,
        confidence: 0.95,
        extractionMethod: "rule",
        extractionMethodDetail: "operating_statement_total_column",
        summary: "Landscaping total",
        reviewReady: true,
        sourceSemanticObjectType: null,
        sourceSemanticObjectId: null,
        citationPacket: {
          candidateType: "metric_fact_candidate",
          fieldName: "metric.landscaping_grounds",
          candidateValue,
          confidenceScore: 0.95,
          sourceArtifactBlobId: artifactId,
          sourceSemanticObjectType: null,
          sourceSemanticObjectId: null,
          provenanceAnchorIds: [anchorId],
          evidencePreview: `Landscaping/Grounds: ${input.value}`,
          extractionMethod: "rule",
          extractionMethodDetail: "operating_statement_total_column",
          extractionMetadata: { locatorHint: "Sheet!N20" },
          createdAt: new Date().toISOString()
        },
        metadata: {},
        tenantId: input.tenantId
      }
    ]
  });
  return candidate.id;
}

function pairDetector(inputs: ConflictDetectionInput[]): DetectedConflictInput[] {
  if (inputs.length < 2) {
    return [];
  }
  return [
    {
      conflictKey: "value_mismatch:test-asset:landscaping-grounds:fy2015",
      kind: "value_mismatch",
      severity: "high",
      assetName: "Test Asset",
      metric: "landscaping_grounds",
      period: "FY2015",
      title: "Conflicting landscaping",
      summary: "Two documents disagree.",
      sides: inputs.map((input) => ({
        candidateId: input.id,
        artifactBlobId: input.artifactBlobId,
        fileName: input.fileName,
        label: input.fileName,
        display: String((input.candidateValue as { display: string }).display),
        value: (input.candidateValue as { value: number }).value,
        note: null,
        evidence: input.evidence,
        locatorHint: input.locatorHint,
        provenanceAnchorIds: input.provenanceAnchorIds
      }))
    }
  ];
}

test("conflict detection persists, links anchors, supersedes, and records decisions", async () => {
  const tenantId = `tenant_conflicts_${randomUUID().slice(0, 8)}`;
  const sellerId = await seedMetricCandidate({ tenantId, fileName: "seller.csv", value: 34200 });
  await seedMetricCandidate({ tenantId, fileName: "rekeyed.csv", value: 43200 });

  let seenInputs: ConflictDetectionInput[] = [];
  const first = await runConflictDetection(tenantId, (inputs) => {
    seenInputs = inputs;
    return pairDetector(inputs);
  });
  assert.deepEqual(first, { current: 1, superseded: 0 });
  assert.deepEqual(seenInputs.map((input) => input.fileName).sort(), ["rekeyed.csv", "seller.csv"]);
  assert.equal(seenInputs[0].locatorHint, "Sheet!N20");

  const listed = await listConflicts(tenantId);
  assert.equal(listed.counts.open, 1);
  const conflict = listed.items[0];
  const [{ count: linkCount }] = await sql<{ count: string }[]>`
    select count(*) from conflict_sides where conflict_id = ${conflict.id}
  `;
  assert.equal(Number(linkCount), 2, "each side links its candidate and anchor relationally");

  const resolved = await decideConflict({
    action: "resolve",
    actorId: "operator-test",
    candidateId: sellerId,
    conflictId: conflict.id,
    note: "Seller version is the source document."
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolvedCandidateId, sellerId);

  const rerun = await runConflictDetection(tenantId, pairDetector);
  assert.deepEqual(rerun, { current: 1, superseded: 0 });
  assert.equal((await getConflict(conflict.id))?.status, "resolved", "re-detection keeps the review decision");

  const cleared = await runConflictDetection(tenantId, () => []);
  assert.deepEqual(cleared, { current: 0, superseded: 1 });
  assert.equal((await listConflicts(tenantId)).items.length, 0);

  const history = await sql<{ action: string; new_status: string }[]>`
    select action, new_status from conflict_resolution_history where conflict_id = ${conflict.id}
  `;
  assert.deepEqual([...history], [{ action: "resolve", new_status: "resolved" }]);
});
