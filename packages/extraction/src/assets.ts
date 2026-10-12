/**
 * Asset naming: how a document names its property, and when two names mean the same one.
 *
 * Matching is deliberately conservative. Two names match when they collapse to the
 * same letters, when one is the other's acronym, or when every token of the shorter
 * name matches a token of the longer one (equal, or a prefix of four+ letters) and
 * both start with the same token. "Parkside" matches "Parkside at Meridian";
 * "Parkside Terrace" does not; "Commons" alone never matches "Oakwood Commons".
 */

const CONNECTORS = new Set(["at", "of", "on", "the", "and"]);
const CITY_QUALIFIERS = [
  "atlanta",
  "austin",
  "charlotte",
  "dallas",
  "denver",
  "fort worth",
  "houston",
  "miami",
  "nashville",
  "orlando",
  "phoenix",
  "san antonio",
  "tampa"
];
/** Words that make a phrase a document, organization or place rather than a property name. */
const NON_ASSET_WORDS = new Set([
  "agreement",
  "alert",
  "annual",
  "asset",
  "analysis",
  "approved",
  "breach",
  "budget",
  "capital",
  "closing",
  "committee",
  "company",
  "covenant",
  "debate",
  "draft",
  "executive",
  "final",
  "first",
  "fourth",
  "fund",
  "group",
  "inc",
  "investment",
  "llc",
  "loan",
  "market",
  "management",
  "manager",
  "markets",
  "memo",
  "memorandum",
  "model",
  "notes",
  "offering",
  "partners",
  "property",
  "quarter",
  "realty",
  "report",
  "review",
  "roll",
  "schedule",
  "second",
  "services",
  "statement",
  "submarket",
  "summary",
  "third",
  "urgent",
  "variance",
  "version",
  "visit"
]);
const MONTH_WORDS =
  /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)$/i;
/** Abbreviations that read like acronyms but name roles or documents, never a property. */
const COMMON_ABBREVIATIONS = new Set([
  "AM",
  "CFO",
  "DSCR",
  "GP",
  "IC",
  "IRR",
  "LP",
  "LTV",
  "MP",
  "NOI",
  "OM",
  "PM",
  "PSA",
  "TX",
  "UW"
]);

function foldDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function nameTokens(name: string, options: { keepConnectors?: boolean } = {}): string[] {
  return foldDiacritics(name)
    .toLowerCase()
    .replace(/["“”'’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && (options.keepConnectors || !CONNECTORS.has(token)));
}

function stripCityQualifiers(tokens: string[]): string[] {
  const joined = ` ${tokens.join(" ")} `;
  let stripped = joined;
  for (const city of CITY_QUALIFIERS) {
    stripped = stripped.replace(` ${city} `, " ");
  }
  const result = stripped.trim().split(/\s+/).filter(Boolean);
  return result.length > 0 ? result : tokens;
}

export function acronymOf(name: string): string {
  return nameTokens(name)
    .map((token) => token[0])
    .join("");
}

function tokenMatches(short: string, long: string): boolean {
  return short === long || (short.length >= 4 && long.startsWith(short));
}

export function namesMatch(left: string, right: string): boolean {
  const a = stripCityQualifiers(nameTokens(left));
  const b = stripCityQualifiers(nameTokens(right));
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  if (a.join("") === b.join("")) {
    return true;
  }

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 1 && long.length >= 2 && short[0] === long.map((token) => token[0]).join("")) {
    return true;
  }
  if (!tokenMatches(short[0], long[0])) {
    return false;
  }
  return short.every((token) => long.some((candidate) => tokenMatches(token, candidate)));
}

export function isCity(phrase: string): boolean {
  return CITY_QUALIFIERS.includes(nameTokens(phrase, { keepConnectors: true }).join(" "));
}

/** Whether a phrase could be a property name: 1-6 capitalized words, no digits, no document or org vocabulary. */
export function looksLikeAssetName(phrase: string): boolean {
  const words = phrase.trim().split(/\s+/);
  if (words.length === 0 || words.length > 6 || /\d/.test(phrase) || isCity(phrase)) {
    return false;
  }
  const significant = words.filter((word) => !CONNECTORS.has(word.toLowerCase()));
  if (significant.length === 0) {
    return false;
  }
  return significant.every((word) => {
    const bare = word.replace(/[^A-Za-z'-]/g, "");
    return (
      bare.length > 0 &&
      /^[A-Z]/.test(bare) &&
      !(bare.length > 3 && bare === bare.toUpperCase()) &&
      !NON_ASSET_WORDS.has(bare.toLowerCase()) &&
      !MONTH_WORDS.test(bare)
    );
  });
}

/** "PARKSIDE AT MERIDIAN" -> "Parkside at Meridian", so all-caps title lines can name an asset. */
export function titleCaseShout(line: string): string {
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || letters !== letters.toUpperCase() || line.split(/\s+/).length > 6) {
    return line;
  }
  return line
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (CONNECTORS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** Maximal runs of capitalized words (allowing inner connectors) inside a text segment. */
export function capitalizedRuns(segment: string): string[] {
  const words = segment.split(/\s+/).filter(Boolean);
  const runs: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    while (current.length > 0 && CONNECTORS.has(current[current.length - 1].toLowerCase())) {
      current.pop();
    }
    if (current.length > 0) {
      runs.push(current.join(" "));
    }
    current = [];
  };

  for (const raw of words) {
    const word = raw.replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, "");
    const isCapitalized = /^[A-Z][a-zA-Z'’-]*$/.test(word) && !(word.length > 3 && word === word.toUpperCase());
    const isConnector = current.length > 0 && CONNECTORS.has(word.toLowerCase());
    if (isCapitalized || isConnector) {
      current.push(word);
    } else {
      flush();
    }
    if (/[,.;:!?)]$/.test(raw)) {
      flush();
    }
  }
  flush();
  return runs;
}

export function isCommonAbbreviation(token: string): boolean {
  return COMMON_ABBREVIATIONS.has(token.toUpperCase());
}

export const CITY_PATTERN_SOURCE = CITY_QUALIFIERS.map((city) =>
  city.replace(/(^|\s)([a-z])/g, (_match, space: string, letter: string) => `${space}${letter.toUpperCase()}`)
).join("|");

const FILENAME_NOISE = new Set([
  "bov",
  "budget",
  "budgetvariance",
  "closing",
  "closingstatement",
  "copy",
  "debt",
  "debtsummary",
  "draft",
  "final",
  "ic",
  "lp",
  "memo",
  "om",
  "pm",
  "preclose",
  "psa",
  "rentroll",
  "rent",
  "report",
  "roll",
  "seller",
  "sellerversion",
  "sellersversion",
  "site",
  "sitevisit",
  "statement",
  "submarket",
  "summary",
  "t12",
  "thread",
  "uw",
  "variance",
  "visit"
]);

/** "UW_OakwoodCommons_v2_PN_112020.xlsx" -> "Oakwood Commons"; "T12_Parkside_2015_SellerVersion.csv" -> "Parkside". */
export function assetNameFromFileName(fileName: string): string | null {
  const stem = fileName.replace(/\.[a-z0-9]{2,5}$/i, "");
  const tokens = stem.split(/[\s_\-.()]+/).filter(Boolean);
  const name: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (FILENAME_NOISE.has(lower) || (/^\d+$/.test(token) && name.length === 0)) {
      continue;
    }
    const isStop =
      /\d/.test(token) || /^v\d/i.test(token) || /^[A-Z]{1,3}$/.test(token) || token === token.toUpperCase();
    if (isStop) {
      if (name.length > 0) {
        break;
      }
      continue;
    }
    name.push(...token.split(/(?<=[a-z])(?=[A-Z])/));
    if (name.length >= 3) {
      break;
    }
  }

  const candidate = name.join(" ");
  return candidate && looksLikeAssetName(candidate) ? candidate : null;
}
