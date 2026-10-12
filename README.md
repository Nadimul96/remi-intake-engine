# REMI Intake Engine

Provenance-tracked document intake for real-estate investment teams: every number is cited to the page line or spreadsheet cell it came from, and every disagreement between documents is surfaced as a reviewable conflict.

![Conflicts view: two T-12s disagree on landscaping, with the cited cells one click away](docs/media/conflicts.webp)

[![CI](https://github.com/Nadimul96/remi-intake-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Nadimul96/remi-intake-engine/actions/workflows/ci.yml)
[![Compose end-to-end](https://github.com/Nadimul96/remi-intake-engine/actions/workflows/e2e.yml/badge.svg)](https://github.com/Nadimul96/remi-intake-engine/actions/workflows/e2e.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 24](https://img.shields.io/badge/node-24-339933?logo=node.js&logoColor=white)
![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white)

A deal team's knowledge lives in offering memos, T-12s, rent rolls, underwriting workbooks and email threads. The same property shows up under four names, three versions of a model disagree on price, and a rekeyed spreadsheet differs from the seller's by one transposed digit. REMI ingests those files through a durable pipeline, extracts candidate facts that always carry their citation, and runs deterministic cross-document checks so a reviewer sees the disagreement, both sources, and the exact cells, before anything becomes accepted truth.

## Why it's interesting

- **Citations down to the cell and the line.** Normalization keeps every worksheet cell's A1 reference and every page's line structure; each row and line becomes a provenance anchor that carries its own source text. A candidate is never just a value. [`anchors.ts`](packages/extraction/src/anchors.ts), [`tabular.py`](services/extractor/remi_extractor/tabular.py)
- **Deterministic cross-document conflict detection.** Facts are keyed by asset, metric, period and basis; asset names are clustered conservatively (an ambiguous short name links nothing); readings are compared at the precision of the coarser source, so `2.0x` agrees with `2.01x` but `$41.2M` does not agree with `$41.5M`. Seven of the dataset's planted conflicts are asserted in tests. [`detect.ts`](packages/extraction/src/conflicts/detect.ts), [`asset-clusters.ts`](packages/extraction/src/conflicts/asset-clusters.ts), [`fixtures.test.ts`](packages/extraction/src/fixtures.test.ts)
- **Optional LLM extraction that cannot invent numbers.** With a free Gemini key (or any OpenAI-compatible endpoint, including a local Ollama), a model may propose metrics the rules missed, but a proposal is stored only if it cites one of the numbered source lines, its quote appears verbatim in that line, and its value can be read from the quote. Off by default. [`propose.ts`](packages/extraction/src/model/propose.ts)
- **A durable, idempotent pipeline.** A Temporal workflow promotes uploads to content-addressed storage (identical bytes become one artifact), sniffs the real file type (a `.docx` that is plain text is parsed as text and flagged), normalizes, anchors, extracts, and re-runs detection inside one transaction behind a per-tenant advisory lock. [`register-intake.ts`](services/workflows/src/workflows/register-intake.ts), [`conflicts.ts`](packages/db/src/conflicts.ts)
- **Supersession and audit, not overwrites.** Re-extraction supersedes candidates, re-detection supersedes conflicts that stop reproducing, and every reviewer decision (candidate, entity, relationship, conflict) is appended to a history table. [`migrations/`](packages/db/src/migrations)

## Quickstart

You need Docker. No API keys.

```bash
git clone https://github.com/Nadimul96/remi-intake-engine.git && cd remi-intake-engine
docker compose up --build
```

Then open <http://localhost:3000>. Compose starts Postgres, a Temporal dev server, S3-compatible storage, the extractor, API, worker and console; applies migrations; and seeds the demo by pushing 22 files from [`fixtures/synthetic-capital/`](fixtures/synthetic-capital/) through the real pipeline. `pnpm run doctor` tells you what is missing if anything fails to start. Temporal's UI is at <http://localhost:8233>. Only what the browser needs is published, on 127.0.0.1: the console (3000), the Temporal UI (8233) and storage's S3 port (9000, which the console uploads to). Postgres, Temporal's gRPC port, the API and the extractor stay inside the compose network, so a local Postgres or anything else on those ports doesn't get in the way. Stopping and starting again (`docker compose down`, then the same command) keeps the data and does not seed twice.

This exact sequence runs in CI on a clean runner on every push and pull request ([`e2e.yml`](.github/workflows/e2e.yml)): it waits for every service to report healthy and the seed to exit cleanly, confirms that only those three ports are published, then, through the console's port alone, checks that all 22 files completed, that exactly the 16 expected conflicts exist, that C1's two citations resolve to their cells, and that the main pages and their assets load; then it restarts the stack, checks again, and uploads files the way the browser does (presigned PUT to storage, CORS included).

**Optional AI-assisted extraction (bring your own key):** get a free key at [Google AI Studio](https://aistudio.google.com/apikey), then `MODEL_EXTRACTION=gemini GEMINI_API_KEY=... docker compose up --build`. For a local model: `MODEL_EXTRACTION=openai OPENAI_COMPATIBLE_BASE_URL=http://host.docker.internal:11434/v1 OPENAI_COMPATIBLE_MODEL=llama3.2`. If the provider rejects the key, the worker logs one message saying which variable to fix and carries on with rule-based extraction; CI checks this with a placeholder key.

<details>
<summary>Without Docker for the app (local development)</summary>

Requires Node 22.12+ (24 recommended), pnpm via `corepack enable`, and [uv](https://docs.astral.sh/uv/).

```bash
pnpm install
cp .env.example .env
pnpm dev:infra           # Postgres :5432, Temporal :7233, storage :9000 in Docker (docker-compose.dev.yml), or bring your own
pnpm db:migrate
pnpm dev:extractor        # terminal 1: FastAPI extractor on :4003
pnpm dev                  # terminal 2: console :3000, API :4001, worker
pnpm seed                 # terminal 3: ingest the demo set
```
</details>

## How it works

```mermaid
flowchart LR
  U[Upload or pnpm seed] -->|presigned PUT / POST /api/uploads| S[(S3 storage)]
  U -->|POST /api/intake/register| A[Fastify API]
  A -->|start workflow| T{{Temporal}}
  T --> W[Worker]
  W -->|inspect, normalize| X[Python extractor]
  W -->|anchors, candidates| P[(Postgres)]
  W -->|detect conflicts| P
  C[Next.js console] -->|/api/remi proxy| A
  A --> P
```

1. **Intake.** The file lands in a staging prefix; the API records a source item and starts `registerIntakeSourceItemWorkflow`.
2. **Promote and inspect.** The worker copies the bytes to an immutable key named by SHA-256 and asks the extractor what the file really is (PDF, email, XLSX, CSV or text), whatever its extension says.
3. **Normalize and anchor.** The extractor returns pages with line-structured text, emails with attachments, or workbooks as sparse cell grids. Every page, line, message, sheet and row becomes a provenance anchor.
4. **Extract.** Rules in [`packages/extraction`](packages/extraction/src/rules) read T-12 totals, label/value rows, `Label: value` lines, rent-roll status counts, budget-vs-actual sheets and DSCR tables into metric facts, plus the document's asset name and the variants it uses. Optionally, a model proposes more, subject to the grounding check.
5. **Detect.** After each artifact, detection re-runs over the tenant's current candidates and upserts conflicts by key.
6. **Review.** Operators resolve conflicts (choosing the reading they trust), accept or reject candidates into accepted truth, and reconcile asset names into canonical entities. Click any value to see its source.

## Screenshots

| | |
|---|---|
| ![Provenance panel showing the cited Total cell of the rekeyed T-12](docs/media/provenance.webp) | ![Candidate review with evidence and decision actions](docs/media/review.webp) |
| **Provenance.** The cited cell, outlined, with its header row and neighbours. | **Review.** Every candidate shows its evidence and rule. |
| ![Overview dashboard](docs/media/overview.webp) | ![Entity reconciliation](docs/media/entities.webp) |
| **Overview.** Open conflicts first. | **Entities.** Name variants attached to canonical records (after a few reconciliation decisions). |
| ![Conflicts in dark mode](docs/media/conflicts-dark.webp) | ![Intake queue and pipeline detail](docs/media/intake.webp) |
| **Dark mode.** | **Intake.** Upload, pipeline stages and what each file produced. |

<p align="center"><img src="docs/media/mobile.webp" width="300" alt="Conflict detail on a phone"></p>

## What the detector finds in the demo data

The dataset plants seven conflicts ([rubric](fixtures/synthetic-capital/README.md#designed-conflicts-evaluation-rubric)). [`fixtures.test.ts`](packages/extraction/src/fixtures.test.ts) runs extraction and detection over the extractor's real output for the demo set and asserts each one; the [compose end-to-end job](.github/workflows/e2e.yml) checks that the same 16 conflicts, listed in [`demo-set.json`](fixtures/demo-set.json), appear when the files go through the full pipeline.

| ID | Rubric item | Result |
|----|-------------|--------|
| C1 | Rekeyed Parkside T-12: landscaping `$43,200` vs `$34,200` | Detected, cited to cell `N20` in both files; the knock-on total-opex and NOI differences are flagged too |
| C2 | Parkside Q3 2017 occupancy `95.3%` vs `94.1%` | Detected: rent-roll status count (141 of 148) vs the PM report, plus occupied units 141 vs 139 |
| C3 | Asset-name variants | Detected for Oakwood: `Oakwood Commons at Westchase`, `OC Houston`, `the Houston deal` (declared aliases), `Westchase Multifamily` (alternate-name label), `Oakwood`. For Parkside only `Parkside` occurs in the source files |
| C4 | Three Oakwood underwriting versions | Detected as version conflicts on price, entry and exit cap, levered IRR, equity multiple and loan amount, each labelled with version and analyst. Which version was approved is left to the reviewer (the IC memo and emails say v2) |
| C5 | Seller NOI vs normalized NOI | Detected: `$580,800` vs `$597,400` (normalized basis). The reason for the gap is not inferred |
| C6 | Q2 2023 water/sewer 34% over budget | Flagged with the other lines more than 25% over budget. Whether it is one-time is not decided |
| C7 | DSCR `1.21x` vs `1.25x` covenant | Detected across the debt summary's periods and the alert email |

Not detected: anything that needs reading comprehension rather than numbers and names (why a figure differs, which document is authoritative), and inconsistencies inside the ground-truth files, which are not ingested.

## Configuration

`docker compose up` needs none of these; local development reads them from `.env` (see [`.env.example`](.env.example)).

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `DATABASE_URL` | yes (local) | `postgresql://remi:remi@127.0.0.1:5432/remi` | Postgres connection for API, worker, migrations |
| `TEMPORAL_ADDRESS` | no | `127.0.0.1:7233` | Temporal frontend |
| `S3_ENDPOINT` | yes (local) | `http://127.0.0.1:9000` | Any S3-compatible endpoint (compose runs RustFS) |
| `S3_PUBLIC_ENDPOINT` | no | `S3_ENDPOINT` | Host the browser uses for presigned uploads |
| `S3_BUCKET` | yes (local) | `remi-dev` | Bucket; created with a CORS rule on API start |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | yes (local) | `remi-local` / `remi-local-secret` | Storage credentials (local defaults only) |
| `EXTRACTOR_URL` | yes (local) | `http://127.0.0.1:4003` | Python extractor |
| `API_PORT` | no | `4001` | API port |
| `API_BASE_URL` | no | `http://127.0.0.1:4001` | Where the console's server and proxy reach the API |
| `CONSOLE_ORIGIN` | no | `http://localhost:3000,http://127.0.0.1:3000` | Browser origins allowed for API CORS and storage uploads |
| `CONSOLE_PORT` / `STORAGE_PORT` / `TEMPORAL_UI_PORT` | no | `3000` / `9000` / `8233` | Host ports compose publishes on 127.0.0.1; `docker-compose.dev.yml` adds `POSTGRES_PORT`, `TEMPORAL_PORT`, `API_PORT`, `EXTRACTOR_PORT`, `STORAGE_CONSOLE_PORT` |
| `DEFAULT_TENANT_ID` / `DEFAULT_ACTOR_ID` | no | `fund-zero` / `operator-demo` | Stub identity until real auth exists |
| `MODEL_EXTRACTION` | no | `off` | `off`, `gemini` or `openai` (any OpenAI-compatible endpoint) |
| `GEMINI_API_KEY` | with `gemini` | | Free key from Google AI Studio |
| `GEMINI_MODEL` | no | `gemini-3.5-flash-lite` | Gemini model |
| `OPENAI_COMPATIBLE_BASE_URL` | with `openai` | | e.g. `http://127.0.0.1:11434/v1` for Ollama |
| `OPENAI_COMPATIBLE_MODEL` | with `openai` | | Model name |
| `OPENAI_COMPATIBLE_API_KEY` | no | | Sent as a bearer token when set |

## Development

```bash
pnpm lint            # Biome: format + lint, zero warnings
pnpm typecheck       # tsc (TypeScript 7) across all packages and scripts
pnpm test            # extraction, conflict detection and model grounding (offline, no keys)
pnpm test:db         # DB-backed tests; needs a migrated Postgres (DATABASE_URL)
pnpm build           # console production build
pnpm run doctor      # preflight for both start paths (plain `pnpm doctor` is pnpm's own command)
scripts/wait-for-stack.sh && node scripts/verify-stack.mts   # the CI end-to-end checks, against a running stack
cd services/extractor && uv run ruff check . && uv run pytest
```

Repository layout: `apps/console` (Next.js 16 console), `packages/domain` (zod schemas), `packages/db` (postgres.js data access, 18 SQL migrations, checksummed migrator), `packages/extraction` (anchors, rules, conflict detection, model-assisted extraction; pure and offline-testable), `services/api` (Fastify), `services/workflows` (Temporal worker), `services/extractor` (Python FastAPI), `fixtures/synthetic-capital` (synthetic dataset with the answer key), `scripts` (seed, doctor).

The extraction tests run against committed snapshots of the extractor's output ([`packages/extraction/test/snapshots`](packages/extraction/test/snapshots)); a pytest contract test fails if the extractor drifts from them. Regenerate with `cd services/extractor && uv run python scripts/snapshot_fixtures.py`. A live model check is opt-in: `REMI_LIVE_MODEL_TESTS=1 MODEL_EXTRACTION=gemini GEMINI_API_KEY=... pnpm test`.

## Status and limitations

- Extracted from a larger private project; experimental, single-tenant in practice. Auth is a stub: tenant and actor come from the environment.
- Rule-based extraction is tuned on this dataset's document shapes (T-12s, rent rolls, underwriting summaries, memos). New layouts will need new rules or the optional model path.
- Scanned PDFs are classified as `best_effort`; there is no OCR. `.docx`, `.pptx` and real ZIP archives are deferred.
- Review lists are not paginated, which is fine for the demo's few hundred candidates and would not be for a real data room.
- The relationship page is populated only by broker emails in `.eml` form; the demo set has none, so it starts empty.
- Temporal runs as the single-process dev server with in-memory state, so workflow history does not survive a restart; the pipeline's results live in Postgres and do.
- Verified for this version: install, Biome, `tsc`, the console production build, unit tests (33 TS plus one opt-in live test, 43 Python), DB tests on Postgres 18, and `docker compose up --build` end to end on a clean GitHub-hosted Ubuntu runner on every push and pull request ([`e2e.yml`](.github/workflows/e2e.yml)). The stack has not been run under Docker Desktop on macOS or Windows.

## License

MIT, see [LICENSE](LICENSE). The fixture dataset is fully synthetic.
