/**
 * End-to-end checks against a running `docker compose up` stack, through the console's
 * port only (the one a user opens): its pages, and the API behind its /api/remi proxy.
 *
 *   node scripts/verify-stack.mts                   # demo data, conflicts, provenance, pages
 *   node scripts/verify-stack.mts --model-fallback  # upload like a browser; expect rules-only
 *                                                   # extraction after the model rejects its key
 *
 * Runs on Node 24 with no install. Env: CONSOLE_URL (default http://localhost:3000).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

interface DemoSet {
  root: string;
  files: string[];
  expectedConflictKeys: string[];
}

interface IntakeItem {
  id: string;
  fileName: string;
  status: string;
  ingestionStatus: string;
  workflowStatus: string | null;
}

interface IntakeDetail extends IntakeItem {
  candidateExtractionResult: { status: string; candidateCount: number; warnings: { message: string }[] };
}

interface ConflictSide {
  fileName: string;
  display: string;
  locatorHint: string | null;
  provenanceAnchorIds: string[];
}

interface Conflict {
  conflictKey: string;
  status: string;
  title: string;
  sides: ConflictSide[];
}

interface ConflictList {
  counts: { open: number; resolved: number; dismissed: number };
  items: Conflict[];
}

const CONSOLE = (process.env.CONSOLE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DEMO_SET = JSON.parse(readFileSync(new URL("../fixtures/demo-set.json", import.meta.url), "utf8")) as DemoSet;
const PAGES = ["/", "/conflicts", "/review", "/truth", "/entities", "/intake"];
/** Markup that only appears when a page failed: Next's error shell, or the console's ErrorState. */
const ERROR_MARKERS = ['id="__next_error__"', "Application error", "Internal Server Error", 'role="alert"'];

async function api<T>(route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${CONSOLE}/api/remi${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  assert.equal(response.status, 200, `${route} answered ${response.status}: ${await response.clone().text()}`);
  return (await response.json()) as T;
}

function check(name: string, run: () => Promise<void>): Promise<void> {
  return run().then(
    () => console.log(`ok    ${name}`),
    (error: unknown) => {
      console.log(`FAIL  ${name}`);
      throw error;
    }
  );
}

async function verifyDemo(): Promise<void> {
  const expectedFiles = DEMO_SET.files.map((file) => file.split("/").at(-1)).sort();

  await check(`all ${expectedFiles.length} demo files completed the pipeline, once each`, async () => {
    const { items } = await api<{ items: IntakeItem[] }>("/intake");
    assert.deepEqual(items.map((item) => item.fileName).sort(), expectedFiles);
    const unfinished = items.filter(
      (item) =>
        item.status !== "completed" || item.ingestionStatus !== "completed" || item.workflowStatus !== "completed"
    );
    assert.deepEqual(
      unfinished.map((item) => `${item.fileName}: ${item.status}/${item.ingestionStatus}/${item.workflowStatus}`),
      []
    );
  });

  const conflicts = await api<ConflictList>("/conflicts");
  await check(`exactly the ${DEMO_SET.expectedConflictKeys.length} expected conflicts, all open`, async () => {
    assert.deepEqual(conflicts.items.map((conflict) => conflict.conflictKey).sort(), DEMO_SET.expectedConflictKeys);
    assert.deepEqual(conflicts.counts, { open: DEMO_SET.expectedConflictKeys.length, resolved: 0, dismissed: 0 });
  });

  await check("C1: rekeyed T-12 landscaping $43,200 vs $34,200, both readings cited and resolvable", async () => {
    const c1 = conflicts.items.find(
      (conflict) => conflict.conflictKey === "value_mismatch:parkside-at-meridian:landscaping-grounds:fy2015"
    );
    assert.ok(c1, "C1 conflict missing");
    assert.deepEqual(c1.sides.map((side) => side.display).sort(), ["$34,200", "$43,200"]);
    assert.deepEqual(c1.sides.map((side) => side.fileName).sort(), [
      "T12_Parkside_2015_REKEYED_Jordan.csv",
      "T12_Parkside_2015_SellerVersion.csv"
    ]);
    for (const side of c1.sides) {
      assert.match(side.locatorHint ?? "", /!N20$/, `${side.fileName} is not cited to the Total cell`);
      assert.ok(side.provenanceAnchorIds.length > 0, `${side.fileName} has no anchor`);
      const view = await api<{ artifact: { fileName: string } }>(`/provenance/${side.provenanceAnchorIds[0]}`);
      assert.equal(view.artifact.fileName, side.fileName);
      const shown = JSON.stringify(view);
      const value = side.display.replace("$", "");
      assert.ok(shown.includes(value) || shown.includes(value.replace(/,/g, "")), "anchor does not show the value");
    }
  });

  for (const page of PAGES) {
    await check(`page ${page} renders without an error state`, async () => {
      const response = await fetch(`${CONSOLE}${page}`);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      for (const marker of ERROR_MARKERS) {
        assert.ok(!html.includes(marker), `${page} contains ${marker}`);
      }
    });
  }

  const conflictsHtml = await (await fetch(`${CONSOLE}/conflicts`)).text();
  await check("the conflicts page lists every conflict, server-rendered", async () => {
    for (const conflict of conflicts.items) {
      assert.ok(conflictsHtml.includes(conflict.title), `missing "${conflict.title}"`);
    }
  });

  await check("the console's scripts and styles are served (standalone build has its static files)", async () => {
    const assets = [...new Set(conflictsHtml.match(/\/_next\/static\/[^"'\s)]+\.(?:js|css)/g) ?? [])];
    assert.ok(assets.length > 0, "the page references no /_next/static assets");
    for (const asset of assets) {
      const response = await fetch(`${CONSOLE}${asset}`);
      assert.equal(response.status, 200, `${asset} answered ${response.status}`);
    }
  });
}

/** The browser path from the Intake page: presign via the proxy, PUT to storage (CORS), register. */
async function uploadLikeBrowser(fileName: string, text: string): Promise<string> {
  const descriptor = { fileName, contentType: "text/plain", sizeBytes: Buffer.byteLength(text) };
  const presign = await api<{ uploadUrl: string; uploadKey: string; headers: Record<string, string> }>(
    "/uploads/presign",
    descriptor
  );
  const preflight = await fetch(presign.uploadUrl, {
    method: "OPTIONS",
    headers: {
      origin: CONSOLE,
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type"
    }
  });
  assert.ok(preflight.ok, `storage CORS preflight answered ${preflight.status}`);
  assert.ok(
    [CONSOLE, "*"].includes(preflight.headers.get("access-control-allow-origin") ?? ""),
    `storage CORS does not allow ${CONSOLE}`
  );
  const stored = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { ...presign.headers, origin: CONSOLE },
    body: text
  });
  assert.equal(stored.status, 200, `presigned PUT answered ${stored.status}: ${await stored.text()}`);
  const registered = await api<{ sourceItemId: string }>("/intake/register", {
    ...descriptor,
    uploadKey: presign.uploadKey
  });
  return registered.sourceItemId;
}

async function verifyModelFallback(): Promise<void> {
  const source = DEMO_SET.files.find((file) => file.endsWith("SiteVisit_Parkside_2018_DF.txt"));
  assert.ok(source);
  const text = readFileSync(new URL(`../${DEMO_SET.root}/${source}`, import.meta.url), "utf8");
  const runId = Date.now().toString(36);
  const ids: string[] = [];

  await check("browser-style upload: presign, CORS preflight, PUT to storage, register", async () => {
    for (const copy of [1, 2]) {
      ids.push(await uploadLikeBrowser(`ModelProbe_${runId}_${copy}.txt`, `${text}\nProbe ${runId}-${copy}\n`));
    }
  });

  await check("both uploads completed with rule-based candidates and a model warning", async () => {
    const deadline = Date.now() + 180_000;
    for (const id of ids) {
      let detail = await api<IntakeDetail>(`/intake/${id}`);
      while (!["completed", "failed"].includes(detail.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        detail = await api<IntakeDetail>(`/intake/${id}`);
      }
      assert.equal(detail.status, "completed", `${detail.fileName} ended as ${detail.status}`);
      const extraction = detail.candidateExtractionResult;
      assert.equal(extraction.status, "completed_with_warnings");
      assert.ok(extraction.candidateCount > 0, "no rule-based candidates");
      assert.ok(
        extraction.warnings.some((warning) => /rejected the API key/.test(warning.message)),
        `no auth warning in ${JSON.stringify(extraction.warnings)}`
      );
    }
  });
}

const run = process.argv.includes("--model-fallback") ? verifyModelFallback : verifyDemo;
run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
