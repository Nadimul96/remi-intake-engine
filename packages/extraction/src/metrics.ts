import type { MetricUnit } from "./values";

export interface MetricDefinition {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Deal terms (price, cap rates, returns) are compared across documents even without a reporting period. */
  dealTerm: boolean;
}

interface LabelRule {
  pattern: RegExp;
  key: string;
  basis?: string;
}

export const METRICS: Record<string, MetricDefinition> = {
  gross_potential_rent: { key: "gross_potential_rent", label: "Gross potential rent", unit: "usd", dealTerm: false },
  total_revenue: { key: "total_revenue", label: "Total revenue", unit: "usd", dealTerm: false },
  effective_gross_revenue: {
    key: "effective_gross_revenue",
    label: "Effective gross revenue",
    unit: "usd",
    dealTerm: false
  },
  total_operating_expenses: {
    key: "total_operating_expenses",
    label: "Total operating expenses",
    unit: "usd",
    dealTerm: false
  },
  noi: { key: "noi", label: "Net operating income", unit: "usd", dealTerm: false },
  purchase_price: { key: "purchase_price", label: "Purchase price", unit: "usd", dealTerm: true },
  entry_cap_rate: { key: "entry_cap_rate", label: "Entry cap rate", unit: "percent", dealTerm: true },
  exit_cap_rate: { key: "exit_cap_rate", label: "Exit cap rate", unit: "percent", dealTerm: true },
  levered_irr: { key: "levered_irr", label: "Levered IRR", unit: "percent", dealTerm: true },
  equity_multiple: { key: "equity_multiple", label: "Equity multiple", unit: "ratio", dealTerm: true },
  units: { key: "units", label: "Unit count", unit: "count", dealTerm: true },
  occupied_units: { key: "occupied_units", label: "Occupied units", unit: "count", dealTerm: false },
  physical_occupancy: { key: "physical_occupancy", label: "Physical occupancy", unit: "percent", dealTerm: false },
  loan_amount: { key: "loan_amount", label: "Loan amount", unit: "usd", dealTerm: true },
  interest_rate: { key: "interest_rate", label: "Interest rate", unit: "percent", dealTerm: true },
  annual_debt_service: { key: "annual_debt_service", label: "Annual debt service", unit: "usd", dealTerm: false },
  dscr: { key: "dscr", label: "DSCR", unit: "ratio", dealTerm: false },
  minimum_dscr: { key: "minimum_dscr", label: "Minimum DSCR covenant", unit: "ratio", dealTerm: true }
};

const LABEL_RULES: LabelRule[] = [
  { pattern: /^gross potential rent$/, key: "gross_potential_rent" },
  { pattern: /^total revenue$/, key: "total_revenue" },
  { pattern: /^effective gross revenue$/, key: "effective_gross_revenue" },
  { pattern: /^(total )?operating expenses$/, key: "total_operating_expenses" },
  { pattern: /^(net operating income|noi)$/, key: "noi" },
  { pattern: /^normali[sz]ed (net operating income|noi)$/, key: "noi", basis: "normalized" },
  { pattern: /^in-?place (net operating income|noi)$/, key: "noi", basis: "in-place" },
  { pattern: /^(purchase|acquisition) price$/, key: "purchase_price" },
  { pattern: /^(entry|going-in) cap( rate)?$/, key: "entry_cap_rate" },
  { pattern: /^exit cap( rate)?$/, key: "exit_cap_rate" },
  { pattern: /^levered irr$/, key: "levered_irr" },
  { pattern: /^equity multiple$/, key: "equity_multiple" },
  { pattern: /^(units|total units|unit count|number of units)$/, key: "units" },
  { pattern: /^occupied( units)?$/, key: "occupied_units" },
  { pattern: /^(physical )?occupancy$/, key: "physical_occupancy" },
  { pattern: /^(loan amount|senior loan)$/, key: "loan_amount" },
  { pattern: /^interest rate$/, key: "interest_rate" },
  { pattern: /^annual debt service$/, key: "annual_debt_service" },
  { pattern: /^dscr$/, key: "dscr" },
  { pattern: /^(minimum dscr|covenant minimum|dscr covenant)$/, key: "minimum_dscr" }
];

/** Strip bullets, markdown emphasis, trailing qualifiers in parentheses and colons from a row or line label. */
export function cleanLabel(raw: string): { label: string; qualifier: string | null } {
  let label = raw
    .replace(/^[\s\-•*·]+/, "")
    .replace(/\*+/g, "")
    .replace(/:\s*$/, "")
    .trim();
  const qualifier = label.match(/\(([^)]*)\)\s*$/)?.[1]?.trim() ?? null;
  label = label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return { label, qualifier };
}

/** Map a human label to a canonical metric key, or null when the label is not a tracked metric. */
export function canonicalMetric(rawLabel: string): { key: string; basis: string | null } | null {
  const normalized = rawLabel.toLowerCase().replace(/\s+/g, " ").trim();
  for (const rule of LABEL_RULES) {
    if (rule.pattern.test(normalized)) {
      return { key: rule.key, basis: rule.basis ?? null };
    }
  }
  return null;
}

/** Statement line items that are not in the dictionary still get a stable key ("Landscaping/Grounds" -> landscaping_grounds). */
export function slugMetric(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function metricLabel(key: string, fallback: string): string {
  return METRICS[key]?.label ?? fallback;
}
