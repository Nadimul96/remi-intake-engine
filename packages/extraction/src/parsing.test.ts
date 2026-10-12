import assert from "node:assert/strict";
import test from "node:test";

import { assetNameFromFileName, namesMatch } from "./assets";
import { clusterAssetNames } from "./conflicts/asset-clusters";
import { canonicalMetric, cleanLabel } from "./metrics";
import { findPeriod, periodFromMonthHeaders, splitQuarterPrefix } from "./periods";
import { parseLeadingValue, parseNumericCell } from "./values";

test("values: currency, negatives, percentages, multiples and suffixes", () => {
  assert.deepEqual(parseLeadingValue("$41,200,000 ($177,586/unit)"), {
    value: 41200000,
    unit: "usd",
    raw: "$41,200,000"
  });
  assert.equal(parseLeadingValue("-$3,150")?.value, -3150);
  assert.equal(parseLeadingValue("(1,250)")?.value, -1250);
  assert.deepEqual(parseLeadingValue("94.1% [NOTE: ...]"), { value: 94.1, unit: "percent", raw: "94.1%" });
  assert.equal(parseLeadingValue("1.21x")?.unit, "ratio");
  assert.equal(parseLeadingValue("$41.2M")?.value, 41200000);
  assert.equal(parseLeadingValue("$180K")?.value, 180000);
  assert.equal(parseLeadingValue("1,2,3"), null, "malformed grouping is rejected, not guessed");
});

test("values: a numeric cell must be only a number", () => {
  assert.equal(parseNumericCell("$943,500*")?.value, 943500);
  assert.equal(parseNumericCell("232-unit"), null);
});

test("periods: quarters, ordinal quarters, fiscal years and month headers", () => {
  assert.equal(findPeriod("RentRoll_Parkside_Q3_2017.csv"), "Q3 2017");
  assert.equal(findPeriod("Third Quarter 2017"), "Q3 2017");
  assert.equal(findPeriod("OCCUPANCY (as of September 30, 2017)"), "Q3 2017");
  assert.equal(findPeriod("FY 2020 budget"), "FY2020");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  assert.equal(periodFromMonthHeaders(months.map((month) => `${month} 2015`)), "FY2015");
  assert.equal(periodFromMonthHeaders(months.slice(0, 11).map((month) => `${month} 2015`)), null);
  assert.deepEqual(splitQuarterPrefix("Q2 NOI", "2023"), { label: "NOI", period: "Q2 2023" });
});

test("metrics: labels map to canonical keys with an optional basis", () => {
  assert.deepEqual(canonicalMetric("NET OPERATING INCOME"), { key: "noi", basis: null });
  assert.deepEqual(canonicalMetric("Normalized NOI"), { key: "noi", basis: "normalized" });
  assert.deepEqual(canonicalMetric("Covenant Minimum"), { key: "minimum_dscr", basis: null });
  assert.equal(canonicalMetric("Average New Rent"), null);
  assert.deepEqual(cleanLabel("- **DSCR (stabilized):**"), { label: "DSCR", qualifier: "stabilized" });
});

test("asset names: conservative matching", () => {
  assert.ok(namesMatch("Parkside", "Parkside at Meridian"));
  assert.ok(namesMatch("ParkSide Meridian", "Parkside at Meridian"), "case and connectors are ignored");
  assert.ok(namesMatch("OC Houston", "Oakwood Commons"), "acronym plus a city qualifier");
  assert.ok(namesMatch("Oakwood Commons at Westchase", "Oakwood Commons"));
  assert.equal(namesMatch("Parkside Terrace", "Parkside at Meridian"), false);
  assert.equal(namesMatch("Commons", "Oakwood Commons"), false, "a shared trailing word is not enough");
});

test("asset names: read from file names, ignoring document-type and version tokens", () => {
  assert.equal(assetNameFromFileName("UW_OakwoodCommons_v2_PN_112020.xlsx"), "Oakwood Commons");
  assert.equal(assetNameFromFileName("T12_Parkside_2015_SellerVersion.csv"), "Parkside");
  assert.equal(assetNameFromFileName("Investment_Memo_FINAL.docx"), null);
});

test("asset clusters: an ambiguous short name links nothing", () => {
  const primary = (surface: string) => ({
    surface,
    identityName: surface,
    role: "primary" as const,
    fromFileName: false,
    artifactBlobId: surface
  });
  const clusters = clusterAssetNames([primary("Oakwood Commons"), primary("Oakwood Terrace"), primary("Oakwood")]);
  assert.notEqual(clusters.canonicalOf("Oakwood Commons"), clusters.canonicalOf("Oakwood Terrace"));
  assert.equal(clusters.canonicalOf("Oakwood"), "Oakwood");
});
