/**
 * Seed the demo by pushing the curated fixture set through the real pipeline:
 * upload -> register -> Temporal workflow -> extractor -> Postgres -> conflict detection.
 *
 *   pnpm seed                 # skip files that are already in the intake queue
 *   pnpm seed -- --force      # upload them again (blobs still dedupe by SHA-256)
 *
 * Env: API_BASE_URL (default http://127.0.0.1:4001), SEED_TIMEOUT_SECONDS (default 300).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface DemoSet {
  root: string;
  files: string[];
}

interface IntakeItem {
  fileName: string;
  status: "staged" | "registered" | "processing" | "completed" | "failed";
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = (process.env.API_BASE_URL ?? "http://127.0.0.1:4001").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.SEED_TIMEOUT_SECONDS ?? 300) * 1000;
const FORCE = process.argv.includes("--force");

const CONTENT_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".eml": "message/rfc822",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

async function api<T>(route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${route} failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await api("/api/health");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`API at ${API} did not become healthy within 60s`);
}

async function upload(absolutePath: string): Promise<void> {
  const fileName = path.basename(absolutePath);
  const contentType = CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
  const bytes = await readFile(absolutePath);

  const staged = await fetch(`${API}/api/uploads`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-content-type": contentType,
      "x-file-name": encodeURIComponent(fileName)
    },
    body: bytes
  });
  if (!staged.ok) {
    throw new Error(`Upload of ${fileName} failed with ${staged.status}: ${await staged.text()}`);
  }
  const { uploadKey } = (await staged.json()) as { uploadKey: string };
  await api("/api/intake/register", { fileName, contentType, sizeBytes: bytes.byteLength, uploadKey });
}

async function main(): Promise<void> {
  const demoSet = JSON.parse(await readFile(path.join(REPO_ROOT, "fixtures/demo-set.json"), "utf8")) as DemoSet;
  await waitForApi();

  const existing = new Set((await api<{ items: IntakeItem[] }>("/api/intake")).items.map((item) => item.fileName));
  const pending = demoSet.files.filter((file) => FORCE || !existing.has(path.basename(file)));
  if (pending.length === 0) {
    console.log("Demo data already seeded; nothing to do (use --force to upload again).");
    return;
  }

  console.log(`Seeding ${pending.length} file(s) through ${API}`);
  for (const file of pending) {
    await upload(path.join(REPO_ROOT, demoSet.root, file));
    console.log(`  registered ${path.basename(file)}`);
  }

  const names = new Set(pending.map((file) => path.basename(file)));
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const items = (await api<{ items: IntakeItem[] }>("/api/intake")).items.filter((item) => names.has(item.fileName));
    const done = items.filter((item) => item.status === "completed" || item.status === "failed");
    if (done.length >= names.size) {
      const failed = done.filter((item) => item.status === "failed");
      const conflicts = await api<{ counts: { open: number } }>("/api/conflicts");
      console.log(
        `Processed ${done.length} file(s), ${failed.length} failed; ${conflicts.counts.open} open conflict(s).`
      );
      for (const item of failed) {
        console.log(`  failed: ${item.fileName}`);
      }
      process.exitCode = failed.length > 0 ? 1 : 0;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out after ${TIMEOUT_MS / 1000}s waiting for the pipeline to finish`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
