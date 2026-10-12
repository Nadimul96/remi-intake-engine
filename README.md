# REMI Intake Engine

A provenance-tracked document intake and entity reconciliation engine for real
estate investment teams: every number that reaches the "accepted truth" table
can be traced back to the page, cell, or email message it came from, and every
reviewer decision that got it there is on record.

**The problem.** A deal team's knowledge lives in offering memos, T-12s, rent
rolls, underwriting workbooks and email threads. The same property shows up
under four names, three versions of the same model disagree on NOI, a rekeyed
spreadsheet differs from the seller's PDF by one transposed digit, and nobody
can say which file is current or who decided. This repo is the ingestion and
review spine for that problem: immutable storage, normalization, evidence-backed
candidate extraction, human review, and entity resolution with full audit
history.

## Architecture

```
                 ┌────────────────────────────┐
  upload ───────▶│ Fastify API  (services/api) │  POST /api/uploads/presign  → S3 presigned PUT
                 │                            │  POST /api/intake/register  → Temporal workflow start
                 └─────────────┬──────────────┘
                               │ starts registerIntakeSourceItemWorkflow
                               ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Temporal worker (services/workflows)                                              │
│                                                                                  │
│  promote ──▶ inspect ──▶ normalize ──▶ extract candidates ──▶ finalize           │
│  staging→   sniff type,  eml / pdf /   rule-based signals     mark run complete  │
│  immutable  sha256,      xlsx / zip    with citation packets  (or fail + record) │
│  blob       support tier  via extractor and provenance anchors                   │
│                               │                                                  │
│                               ▼                                                  │
│                    Python extractor (services/extractor)                          │
│                    FastAPI: /inspect, /normalize (pypdf, openpyxl, email)         │
└───────────────────────────────┬──────────────────────────────────────────────────┘
                                │ writes
                                ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Postgres (packages/db, 16 SQL migrations)                              │
   │ source_items → artifact_blobs → documents/email_messages/worksheets    │
   │   → provenance_anchors → extracted_candidates                          │
   │   → accepted_{fact,relationship,classification}_records                │
   │   → entity_resolution_proposals → canonical_entities + aliases         │
   │   → asset_organization_relationship_proposals → accepted links         │
   │ + intake_events, candidate_review_history, *_system_events (audit)     │
   └───────────────────────────────┬────────────────────────────────────────┘
                                   │ read / decide
                                   ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Next.js review console (apps/console)                                  │
   │ /intake  /screening  /review  /truth  /relationships  /entities        │
   └────────────────────────────────────────────────────────────────────────┘

   Local infra (docker compose): Postgres 16 + pgvector, Temporal 1.27 + UI, MinIO (S3)
```

The flow a single file takes:

1. **Intake.** The console asks the API for a presigned S3 PUT, uploads
   directly to MinIO, then registers the object. The API creates a
   `source_item`, an `ingestion_run`, and a `workflow_run`, and starts a
   Temporal workflow keyed `intake-<sourceItemId>`.
2. **Promote.** The worker moves the staged object to an immutable prefix keyed
   by SHA-256. A re-upload of the same bytes reuses the existing
   `artifact_blob` instead of creating a new one.
3. **Inspect and normalize.** The extractor sniffs the real type (not the
   extension), assigns a support tier (`supported`, `best_effort`, `deferred`,
   `unsupported`) and a parser target (`pdf`, `eml`, `xlsx`, `archive`,
   `none`), then produces normalized content: document pages, email threads and
   messages with attachments, or workbooks with worksheets and structured
   tables. Email attachments are promoted to their own blobs and processed
   recursively, with a depth limit.
4. **Anchor and extract.** Each page, message, attachment or worksheet gets a
   `provenance_anchor` with a locator. Rule-based extraction then emits
   candidates (metric facts, relationship assertions, classifications) that
   carry a confidence, the extraction method, and a citation packet pointing at
   the anchors that justify them.
5. **Review.** An operator accepts, rejects, or edits-and-accepts each
   candidate. Accepted candidates become `accepted_*_records`; every decision
   is appended to `candidate_review_history`.
6. **Reconcile.** Accepted asset and organization names generate
   `entity_resolution_proposals` against the canonical entity catalog, each
   with a match category, strategy, confidence and the competing matches.
   Accepting one links the record to a canonical entity and records the
   observed name as an alias. Asset-to-organization relationships (currently
   two types: the originating organization and the broker for an asset) go
   through the same proposal/accept cycle.

## What is technically interesting

| Topic | Why it matters | Where |
|-------|----------------|-------|
| **Provenance anchors and citation packets** | A candidate is never just a value. It references anchors (`owner_type`, `owner_id`, `anchor_kind`, `anchor_key`, JSON locator) that point into the normalized content, so a reviewer can open the exact page, message, or worksheet region. Accepted records keep the anchor IDs and the packet. | [`004_provenance_anchors_and_parser_results.sql`](packages/db/src/migrations/004_provenance_anchors_and_parser_results.sql), [`candidate-extraction.ts`](services/workflows/src/lib/candidate-extraction.ts), [`007_candidate_review_and_accepted_truth.sql`](packages/db/src/migrations/007_candidate_review_and_accepted_truth.sql) |
| **Supersession instead of deletion** | Re-running extraction on a blob upserts on `(artifact_blob_id, candidate_key)` and flips candidates that no longer appear to `current_extraction = false` with a `superseded_at` timestamp. The same pattern applies to resolution proposals (`current_proposal`, `superseded_at`): a newer reconciliation context for the same source candidate supersedes the old one, and accepted-but-stale proposals are moved out of the current lane rather than rewritten. | [`candidates.ts`](packages/db/src/candidates.ts), [`entities.ts`](packages/db/src/entities.ts), [`009_entity_resolution_skeleton.sql`](packages/db/src/migrations/009_entity_resolution_skeleton.sql) |
| **Entity resolution proposals with explicit match evidence** | Proposals carry `proposal_kind` (`create_entity` / `attach_to_existing`), `match_category` (`active_link`, `exact_match`, `alias_match`, `possible_match`, `create_new`), a free-text `match_strategy`, a `confidence_score`, and `matching_candidates_json` listing every competing entity with its signal (`exact_name_match`, `exact_domain_match`, `alias_match`, `possible_name_overlap`) and rationale. Names are NFKD-normalized and token-overlap scored; organization identity can come from a sender domain, with public email domains suppressed. | [`entity.ts`](packages/domain/src/entity.ts), [`entities.ts`](packages/db/src/entities.ts), [`010_entity_aliases_and_match_signals.sql`](packages/db/src/migrations/010_entity_aliases_and_match_signals.sql) |
| **Audit and system-event tables** | Human actions and automatic reconciliations are recorded separately. `candidate_review_history` and `entity_resolution_history` capture reviewer decisions; `entity_resolution_system_events` and `asset_organization_relationship_system_events` capture what auto-sync did and why (`proposal_superseded`, `stale_link_removed`, `alias_removed`, `active_link_preserved`, ...), each with an idempotent `event_key`. `intake_events` records every stage transition for a source item. | [`008_candidate_review_history.sql`](packages/db/src/migrations/008_candidate_review_history.sql), [`011_entity_reconciliation_history.sql`](packages/db/src/migrations/011_entity_reconciliation_history.sql), [`012_entity_reconciliation_system_events.sql`](packages/db/src/migrations/012_entity_reconciliation_system_events.sql), [`014_relationship_reconciliation_auditability.sql`](packages/db/src/migrations/014_relationship_reconciliation_auditability.sql) |
| **Why Temporal** | Intake is a multi-step pipeline with external calls (S3, the Python extractor) that can fail halfway. The workflow is six activities with retries (`maximumAttempts: 3`, 5-minute start-to-close) and a compensating `failUploadedArtifact` activity, so a crashed worker resumes rather than leaving a half-processed item. Workflow IDs are derived from the source item, which gives idempotent registration for free. | [`register-intake.ts`](services/workflows/src/workflows/register-intake.ts), [`activities/intake.ts`](services/workflows/src/activities/intake.ts), [`routes/intake.ts`](services/api/src/routes/intake.ts) |
| **Tenant scoping** | Every row that carries business data has a `tenant_id`, and the lookup indexes lead with it (`canonical_entities (tenant_id, entity_type, normalized_name, ...)`). The API currently injects a single tenant and actor from environment variables; the schema is ready for real auth, the service is not. | [`001_intake_spine.sql`](packages/db/src/migrations/001_intake_spine.sql), [`lib/config.ts`](services/api/src/lib/config.ts) |
| **Content-addressed, immutable artifacts** | `artifact_blobs.sha256` is unique. Attachments embedded in emails are promoted to first-class blobs (`promotion_status`: `embedded_only`, `promoted`, `reused_existing_blob`, `promotion_failed`) so a rent roll that arrives both as an upload and as an email attachment is one artifact with two source items. | [`001_intake_spine.sql`](packages/db/src/migrations/001_intake_spine.sql), [`005_attachment_blob_handoff.sql`](packages/db/src/migrations/005_attachment_blob_handoff.sql) |
| **Checksummed migrations** | A small migrator applies `*.sql` in order inside transactions and refuses to continue if an already-applied file's SHA-256 changed. | [`migrate.ts`](packages/db/src/migrate.ts) |
| **Zod schemas as the contract** | Domain enums and payload shapes live in one package consumed by the API, the worker and the console, so a new candidate type or proposal state is a one-line change that the typechecker propagates. | [`packages/domain/src`](packages/domain/src) |

## Data model

Sixteen migrations in [`packages/db/src/migrations`](packages/db/src/migrations). Grouped by concern:

**Intake spine** (`001`, `002`, `005`)
`source_connections`, `source_items`, `artifact_blobs` (unique `sha256`),
`ingestion_runs` (stage: `registered` → `immutable_storage` → `inspection` →
`normalization` → `anchoring` → `candidate_extraction` → `complete` | `failed`),
`workflow_runs` (bound to the Temporal workflow ID), `derived_artifacts`
(versioned inspection reports, previews, anchor manifests, citation packets),
`artifact_processing_states`, `review_items`, `intake_events`.

**Normalized content** (`003`, `004`)
`documents` / `document_pages`, `email_threads` / `email_messages` /
`attachments`, `workbooks` / `worksheets` / `structured_tables`,
`normalization_results`, `provenance_anchors`.

**Candidates and accepted truth** (`006`, `007`, `008`)
`candidate_extraction_states`, `extracted_candidates` (confidence,
`extraction_method`, `citation_packet_json`, `review_status`,
`current_extraction`, `superseded_at`), `accepted_fact_records`,
`accepted_relationship_records`, `accepted_classification_records`,
`candidate_review_history`.

**Entity resolution** (`009`–`012`)
`canonical_entities` (`asset` | `organization`), `canonical_entity_aliases`
(`observed_name` | `observed_domain`), `entity_resolution_proposals`,
`accepted_truth_entity_links`, `entity_resolution_history`,
`entity_resolution_system_events`.

**Asset–organization relationships** (`013`–`016`)
`asset_organization_relationship_proposals`,
`accepted_asset_organization_relationship_links`, their `_resolution_history`
and `_system_events` tables, and two migrations that relax foreign keys so that
deleted accepted truth leaves its relationship history in place.

## Repository layout

```
apps/console/            Next.js 16 review console (intake, screening, review, truth, relationships, entities)
packages/domain/         Zod schemas and enums shared by every service
packages/db/             postgres.js data access, migrator, SQL migrations, DB-backed tests
packages/connectors/     intake connector descriptors (upload, mailbox, file drop, SFTP)
packages/ui/             two formatting helpers used by the console
services/api/            Fastify API: presign, register, review/decision, truth, reconciliation
services/workflows/      Temporal worker, intake workflow, activities, rule-based extraction
services/extractor/      Python FastAPI service: type sniffing + pdf/eml/xlsx normalization
infrastructure/local/    docker compose for Postgres, Temporal, MinIO (plus Neo4j and Valkey, unused)
tests/fixtures/          small eml/pdf/xlsx/zip samples used by the DB-backed tests
fixtures/synthetic-capital/  evaluation dataset with a seven-conflict answer key
```

## Quickstart

Prerequisites: Node 22 (typecheck also passes under Node 24.18), pnpm 10,
Docker with Compose, and Python 3.11+ for the extractor.

```bash
pnpm install --frozen-lockfile
cp .env.example .env                       # defaults match docker-compose
pnpm infra:up                              # Postgres, Temporal + UI (:8080), MinIO (:9001)
pnpm db:migrate                            # applies packages/db/src/migrations/*.sql

# extractor, in a second terminal
python3 -m venv services/extractor/.venv && source services/extractor/.venv/bin/activate
pip install -r services/extractor/requirements.txt
pnpm dev:extractor                         # FastAPI on :4003

# console (:3000), API (:4001) and Temporal worker, in a third terminal
pnpm dev
```

Then open <http://localhost:3000/intake> and drop files from
`fixtures/synthetic-capital/`. A good first set: the two Parkside T-12 CSVs
(deliberate rekey error), the three Oakwood UW workbooks (version conflict),
and `emails/Thread_01_Broker_Oakwood_Intro.txt` (name variants and broker
relationship). Watch the run advance through its stages on `/intake`, review
candidates on `/review`, and resolve names on `/entities`.

Without the console, the same thing over HTTP:

```bash
# 1. presign
curl -s localhost:4001/api/uploads/presign -H 'content-type: application/json' \
  -d '{"fileName":"T12_Parkside_2015_REKEYED_Jordan.csv","contentType":"text/csv","sizeBytes":3133}'
# 2. PUT the file to the returned uploadUrl with the returned headers
# 3. register
curl -s localhost:4001/api/intake/register -H 'content-type: application/json' \
  -d '{"fileName":"T12_Parkside_2015_REKEYED_Jordan.csv","contentType":"text/csv","sizeBytes":3133,"uploadKey":"<uploadKey from step 1>"}'
```

Other root scripts: `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build`,
`pnpm dev:api`, `pnpm dev:workflows`, `pnpm dev:console`, `pnpm infra:down`.

## Verify

Commands run on macOS with Node 22.22.0 and pnpm 10.13.1 at the time this
repo was assembled:

| Command | Result |
|---------|--------|
| `pnpm install --frozen-lockfile` | 346 packages, lockfile up to date, 5 s |
| `pnpm typecheck` (turbo → `tsc --noEmit` in all 7 packages) | 7/7 successful |
| `pnpm test` (`services/workflows/src/lib/candidate-extraction.test.ts`, no infrastructure needed) | 4 tests, 4 pass, 0 fail |
| `pnpm test:db` (`packages/db/src/{entities,relationships,screening}.test.ts`) | **not run**: requires a migrated Postgres (`pnpm infra:up && pnpm db:migrate`); Docker was not running on the machine used to assemble this repo |

There is no lint script in the workspace. The Python extractor was not
exercised here either; its dependencies are pinned in
[`services/extractor/requirements.txt`](services/extractor/requirements.txt).

## Evaluation dataset

[`fixtures/synthetic-capital/`](fixtures/synthetic-capital/) holds 73 fully
synthetic files for a fictional two-fund multifamily investor: PDFs, CSV rent
rolls, formula-driven XLSX underwriting models, seven email threads and a
ground-truth answer key. Seven conflicts are planted on purpose (a rekeyed
T-12, an occupancy mismatch, asset-name variants, three competing UW versions,
seller vs. normalized NOI, a one-time budget blowout, a DSCR covenant breach),
alongside realistic naming chaos: `(1).csv` copies, `USE THIS ONE_FINAL.xlsx`,
misfiled documents, a text file with a `.docx` extension. The
[dataset README](fixtures/synthetic-capital/README.md) lists the conflicts as a
rubric with the expected resolution for each.

Detecting these conflicts automatically is the target this dataset was built
for. Today the engine gets the evidence into one place with provenance and a
review trail; cross-document numeric conflict detection is not yet implemented
(see Status).

## Status

Extracted from a larger private project. What is here:

- The schema, migrator, data-access layer, Temporal workflow, API and
  extraction logic are complete for the intake → review → reconciliation loop
  and typecheck clean.
- The review console is functional but unpolished: inline styles, no
  pagination, a stubbed single operator identity.
- Candidate extraction is rule-based (regex and heuristics over normalized
  content). There is no model-assisted extraction yet, although the
  `extraction_method` column reserves `model_assisted`.
- `docker-compose.yml` also provisions Neo4j and Valkey, and migration `001`
  enables the `vector` extension; none of the three is used by any code in
  this repo yet.
- Authentication is a stub: tenant and actor come from `.env`.
- Cross-document conflict detection (the C1–C7 rubric in the fixtures) is the
  next layer and is not implemented.
- DB-backed tests exist for entity reconciliation, relationship reconciliation
  and the screening workbench, but need Postgres to run.

## License

MIT, see [LICENSE](LICENSE).
