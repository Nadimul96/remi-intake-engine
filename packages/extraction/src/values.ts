export type MetricUnit = "usd" | "percent" | "ratio" | "count";

export interface ParsedValue {
  value: number;
  unit: MetricUnit | null;
  /** The exact substring the number was read from, for evidence and verification. */
  raw: string;
}

const NUMBER_PATTERN = /\(?-?\$?\s?\d[\d,]*(?:\.\d+)?\)?\s?(?:%|x\b|[kKmM]{1,2}\b|million\b|thousand\b)?/;
const MULTIPLIERS: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6 };

/**
 * Read the first number in a cell or text fragment, with its unit.
 * Handles "$41,200,000", "-$3,150", "(1,250)", "5.6%", "1.21x", "$41.2M", "$180K".
 */
export function parseLeadingValue(text: string): ParsedValue | null {
  const match = text.match(NUMBER_PATTERN);
  if (!match) {
    return null;
  }

  const raw = match[0].trim();
  const negative = raw.startsWith("-") || (raw.startsWith("(") && raw.endsWith(")"));
  const digits = raw.match(/\d[\d,]*(?:\.\d+)?/)?.[0] ?? "";
  // Reject thousands separators in the wrong place ("1,2,3") rather than guess.
  if (digits.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(digits)) {
    return null;
  }

  let value = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(value)) {
    return null;
  }

  const suffix = raw.match(/(%|x|[kKmM]{1,2}|million|thousand)\)?$/)?.[1]?.toLowerCase() ?? null;
  const hasDollar = raw.includes("$");
  let unit: MetricUnit | null = hasDollar ? "usd" : null;

  if (suffix === "%") {
    unit = "percent";
  } else if (suffix === "x") {
    unit = "ratio";
  } else if (suffix && suffix in MULTIPLIERS) {
    value *= MULTIPLIERS[suffix];
    unit = "usd";
  }

  return { value: negative ? -value : value, unit, raw };
}

/** A cell is numeric when its whole content is one number (allowing currency, %, x and a trailing asterisk). */
export function parseNumericCell(text: string): ParsedValue | null {
  const trimmed = text.trim().replace(/\*+$/, "");
  const parsed = parseLeadingValue(trimmed);
  if (!parsed || parsed.raw.length < trimmed.length) {
    return null;
  }
  return parsed;
}

export function formatValue(value: number, unit: MetricUnit | null): string {
  switch (unit) {
    case "usd":
      return `$${Math.round(value).toLocaleString("en-US")}`;
    case "percent":
      return `${Number(value.toFixed(2))}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    default:
      return Number.isInteger(value) ? value.toLocaleString("en-US") : String(Number(value.toFixed(4)));
  }
}

/** Whether two readings of the same metric disagree by more than rounding noise. */
export function valuesDiffer(left: number, right: number, unit: MetricUnit | null): boolean {
  const delta = Math.abs(left - right);
  switch (unit) {
    case "percent":
      return delta > 0.05;
    case "ratio":
      return delta > 0.005;
    case "usd":
      return delta > Math.max(1, Math.max(Math.abs(left), Math.abs(right)) * 0.001);
    default:
      return delta > 1e-9;
  }
}
