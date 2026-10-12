/**
 * Reporting periods are normalized to "FY2015", "Q3 2017" or "Jan 2023" so that
 * the same period written three different ways groups together.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ORDINAL_QUARTERS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };

const QUARTER_PATTERN = /\bQ([1-4])[\s_-]*(?:FY)?(\d{4})\b/i;
const ORDINAL_QUARTER_PATTERN = /\b(first|second|third|fourth)\s+quarter\s+(?:of\s+)?(\d{4})\b/i;
const FISCAL_YEAR_PATTERN = /\b(?:FY|fiscal year)\s?(\d{4})\b/i;
const MONTH_YEAR_PATTERN =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s_-]*(?:\d{1,2},?\s+)?(\d{4})\b/i;
const AS_OF_PATTERN = /\bas of\s+([a-z]+)\s+\d{1,2},?\s+(\d{4})/i;
const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

function monthIndex(token: string): number {
  return MONTHS.indexOf(token.slice(0, 3).toLowerCase());
}

/** Quarter or fiscal-year period mentioned in a filename, title or heading. */
export function findPeriod(text: string): string | null {
  const normalized = text.replace(/_/g, " ");
  const quarter = normalized.match(QUARTER_PATTERN);
  if (quarter) {
    return `Q${quarter[1]} ${quarter[2]}`;
  }

  const ordinal = normalized.match(ORDINAL_QUARTER_PATTERN);
  if (ordinal) {
    return `Q${ORDINAL_QUARTERS[ordinal[1].toLowerCase()]} ${ordinal[2]}`;
  }

  const fiscal = normalized.match(FISCAL_YEAR_PATTERN);
  if (fiscal) {
    return `FY${fiscal[1]}`;
  }

  const asOf = normalized.match(AS_OF_PATTERN);
  if (asOf && monthIndex(asOf[1]) >= 0) {
    return `Q${Math.floor(monthIndex(asOf[1]) / 3) + 1} ${asOf[2]}`;
  }

  return null;
}

/** Twelve monthly column headers from one calendar year make a fiscal year ("Jan 2015" ... "Dec 2015"). */
export function periodFromMonthHeaders(headers: string[]): string | null {
  const months = headers
    .map((header) => header.match(MONTH_YEAR_PATTERN))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ month: monthIndex(match[1]), year: match[2] }));

  if (months.length < 12) {
    return null;
  }

  const years = new Set(months.map((entry) => entry.year));
  const distinctMonths = new Set(months.map((entry) => entry.month));
  return years.size === 1 && distinctMonths.size === 12 ? `FY${months[0].year}` : null;
}

export function isMonthHeader(text: string): boolean {
  return MONTH_YEAR_PATTERN.test(text) && text.trim().length <= 12;
}

/** A label like "Q2 NOI" names its own quarter; the year comes from the document. */
export function splitQuarterPrefix(
  label: string,
  documentYear: string | null
): { label: string; period: string | null } {
  const match = label.match(/^Q([1-4])\s+(.+)$/i);
  if (!match) {
    return { label, period: null };
  }
  return { label: match[2], period: documentYear ? `Q${match[1]} ${documentYear}` : null };
}

/** Period at the start of a table row: "2023 (Y3 Actual)" -> FY2023, "Q1 2023" -> Q1 2023. */
export function leadingRowPeriod(line: string): string | null {
  const quarter = line.match(/^\s*Q([1-4])\s+(\d{4})\b/i);
  if (quarter) {
    return `Q${quarter[1]} ${quarter[2]}`;
  }
  const year = line.match(/^\s*((?:19|20)\d{2})\b/);
  return year ? `FY${year[1]}` : null;
}

export function findYear(text: string): string | null {
  return text.match(YEAR_PATTERN)?.[0] ?? null;
}
