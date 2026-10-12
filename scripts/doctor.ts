/**
 * Preflight: tells you exactly what is missing before you start the stack.
 *
 *   pnpm doctor
 *
 * Checks the Docker path (`docker compose up`) and the local-dev path (`pnpm dev`)
 * separately, so a missing tool only fails the path that needs it.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Status = "ok" | "warn" | "fail";
interface Check {
  group: string;
  name: string;
  status: Status;
  detail: string;
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks: Check[] = [];
const add = (group: string, name: string, status: Status, detail: string): void => {
  checks.push({ group, name, status, detail });
};

function run(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000
    }).trim();
  } catch {
    return null;
  }
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main(): Promise<void> {
  const [major, minor] = process.versions.node.split(".").map(Number);
  add(
    "common",
    "Node.js",
    major > 22 || (major === 22 && minor >= 12) ? "ok" : "fail",
    `v${process.versions.node} (needs 22.12+)`
  );

  const docker = run("docker", ["--version"]);
  const daemon = docker ? run("docker", ["info", "--format", "{{.ServerVersion}}"]) : null;
  const compose = docker ? run("docker", ["compose", "version", "--short"]) : null;
  add("docker", "Docker CLI", docker ? "ok" : "fail", docker ?? "install Docker Desktop or Docker Engine");
  add("docker", "Docker daemon", daemon ? "ok" : "fail", daemon ? `server ${daemon}` : "start Docker, then re-run");
  add("docker", "Compose v2", compose ? "ok" : "fail", compose ?? "docker compose plugin not found");

  const ports: [number, string][] = [
    [3000, "console"],
    [4001, "API"],
    [4003, "extractor"],
    [5432, "Postgres"],
    [7233, "Temporal"],
    [8233, "Temporal UI"],
    [9000, "object storage"]
  ];
  for (const [port, service] of ports) {
    const busy = await portInUse(port);
    add(
      "docker",
      `port ${port}`,
      busy ? "warn" : "ok",
      busy ? `in use (${service}); fine if this stack is already running, else set the *_PORT override` : "free"
    );
  }

  const pnpm = run("pnpm", ["--version"]);
  const uv = run("uv", ["--version"]);
  add("local dev", "pnpm", pnpm ? "ok" : "fail", pnpm ?? "run `corepack enable`");
  add("local dev", "uv (extractor)", uv ? "ok" : "fail", uv ?? "install uv: https://docs.astral.sh/uv/");
  add(
    "local dev",
    "dependencies",
    existsSync(path.join(REPO_ROOT, "node_modules")) ? "ok" : "fail",
    "run `pnpm install`"
  );
  add(
    "local dev",
    ".env",
    existsSync(path.join(REPO_ROOT, ".env")) ? "ok" : "warn",
    "copy .env.example to .env (only needed for `pnpm dev`)"
  );

  const mode = (process.env.MODEL_EXTRACTION ?? "off").toLowerCase();
  if (mode === "off") {
    add("optional", "AI-assisted extraction", "ok", "off (rule-based extraction needs no keys)");
  } else {
    const key = mode === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_COMPATIBLE_BASE_URL;
    add(
      "optional",
      "AI-assisted extraction",
      key ? "ok" : "fail",
      key
        ? `${mode} configured`
        : mode === "gemini"
          ? "MODEL_EXTRACTION=gemini needs GEMINI_API_KEY (free key: https://aistudio.google.com/apikey)"
          : "MODEL_EXTRACTION=openai needs OPENAI_COMPATIBLE_BASE_URL"
    );
  }

  const label: Record<Status, string> = { ok: " ok ", warn: "warn", fail: "FAIL" };
  let group = "";
  for (const check of checks) {
    if (check.group !== group) {
      group = check.group;
      console.log(`\n${group}`);
    }
    console.log(`  [${label[check.status]}] ${check.name.padEnd(24)} ${check.detail}`);
  }

  const dockerReady = checks.filter((check) => check.group === "docker" && check.status === "fail").length === 0;
  const localReady = checks.filter((check) => check.group === "local dev" && check.status === "fail").length === 0;
  console.log(`\ndocker compose up --build: ${dockerReady ? "ready" : "not ready"}`);
  console.log(`pnpm dev (local):          ${localReady ? "ready" : "not ready"}`);
  process.exitCode = dockerReady || localReady ? 0 : 1;
}

void main();
