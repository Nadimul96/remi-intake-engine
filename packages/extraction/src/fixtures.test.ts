import assert from "node:assert/strict";
import test from "node:test";

import { type DetectedConflict, detectConflicts } from "./conflicts/detect";
import { demoSet, extractFixtureRecords } from "./test-support";

/**
 * Runs rule-based extraction and conflict detection over the curated demo set
 * (fixtures/demo-set.json, as normalized by the real extractor) and checks each
 * item of the seven-conflict rubric in fixtures/synthetic-capital/README.md.
 */
const conflicts = detectConflicts(extractFixtureRecords());

function find(kind: DetectedConflict["kind"], predicate: (conflict: DetectedConflict) => boolean): DetectedConflict {
  const match = conflicts.find((conflict) => conflict.kind === kind && predicate(conflict));
  assert.ok(match, `expected a ${kind} conflict; got:\n${conflicts.map((c) => `  ${c.conflictKey}`).join("\n")}`);
  return match;
}

function displays(conflict: DetectedConflict): string[] {
  return conflict.sides.map((side) => side.display).sort();
}

test("C1: the rekeyed Parkside T-12 landscaping line disagrees with the seller's", () => {
  const landscaping = find("value_mismatch", (c) => c.metric === "landscaping_grounds" && c.period === "FY2015");
  assert.equal(landscaping.assetName, "Parkside at Meridian");
  assert.deepEqual(displays(landscaping), ["$34,200", "$43,200"]);
  assert.ok(
    landscaping.sides.every((side) => side.locatorHint?.endsWith("!N20")),
    "cited to the Total cell"
  );

  const noi = find("value_mismatch", (c) => c.metric === "noi" && c.period === "FY2015");
  assert.deepEqual(displays(noi), ["$346,400", "$355,400"]);
});

test("C2: Parkside Q3 2017 occupancy from the rent roll disagrees with the PM report", () => {
  const occupancy = find("value_mismatch", (c) => c.metric === "physical_occupancy" && c.period === "Q3 2017");
  assert.deepEqual(displays(occupancy), ["94.1%", "95.3%"]);
  const units = find("value_mismatch", (c) => c.metric === "occupied_units" && c.period === "Q3 2017");
  assert.deepEqual(displays(units), ["139", "141"]);
});

test("C3: Oakwood name variants resolve to one asset", () => {
  const oakwood = find("name_variants", (c) => c.assetName === "Oakwood Commons");
  for (const name of ["Oakwood Commons at Westchase", "OC Houston", "the Houston deal", "Westchase Multifamily"]) {
    assert.ok(displays(oakwood).includes(name), `missing variant ${name}`);
  }
  find("name_variants", (c) => c.assetName === "Parkside at Meridian");
});

test("C4: the three Oakwood underwriting versions disagree on price and entry cap", () => {
  const price = find("version_conflict", (c) => c.metric === "purchase_price");
  assert.ok(displays(price).includes("$41,500,000") && displays(price).includes("$41,200,000"));
  const cap = find("version_conflict", (c) => c.metric === "entry_cap_rate");
  const versions = cap.sides.map((side) => side.label).filter((label) => label.startsWith("v"));
  assert.deepEqual(versions.map((label) => label.slice(0, 2)).sort(), ["v1", "v2", "v3"]);
});

test("C5: seller NOI disagrees with the normalized NOI", () => {
  const noi = find("value_mismatch", (c) => c.metric === "noi" && c.period === "FY2020");
  assert.ok(displays(noi).includes("$580,800") && displays(noi).includes("$597,400"));
  assert.ok(noi.sides.some((side) => side.note === "normalized"));
});

test("C6: the Q2 2023 water/sewer overrun is flagged", () => {
  const budget = find("budget_variance", (c) => c.period === "Q2 2023");
  const utilities = budget.sides.find((side) => side.label === "Utilities");
  assert.equal(utilities?.display, "34%");
});

test("C7: the 1.21x DSCR is flagged against the 1.25x covenant", () => {
  const breach = find("covenant_breach", (c) => c.assetName === "Oakwood Commons");
  assert.ok(displays(breach).includes("1.21x") && displays(breach).includes("1.25x"));
  assert.equal(breach.severity, "high");
});

test("byte-identical copies are one artifact and add no conflicts of their own", () => {
  const files = new Set(conflicts.flatMap((conflict) => conflict.sides.map((side) => side.fileName)));
  assert.equal(files.has("UW_Oakwood_v2_PN_USE THIS ONE_FINAL.xlsx"), false);
});

test("every conflict side cites at least one provenance anchor", () => {
  for (const conflict of conflicts) {
    for (const side of conflict.sides) {
      assert.ok(side.provenanceAnchorIds.length > 0, `${conflict.conflictKey} has an uncited side`);
    }
  }
});

test("the demo set produces exactly the expected conflicts", () => {
  // The docker compose end-to-end job asserts the same list against the running stack.
  assert.deepEqual(conflicts.map((conflict) => conflict.conflictKey).sort(), demoSet().expectedConflictKeys);
});

test("detection is deterministic", () => {
  const again = detectConflicts(extractFixtureRecords());
  assert.deepEqual(
    again.map((conflict) => conflict.conflictKey),
    conflicts.map((conflict) => conflict.conflictKey)
  );
});
