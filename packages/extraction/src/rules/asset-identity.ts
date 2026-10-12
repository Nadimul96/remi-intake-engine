import {
  acronymOf,
  assetNameFromFileName,
  CITY_PATTERN_SOURCE,
  capitalizedRuns,
  isCommonAbbreviation,
  looksLikeAssetName,
  namesMatch,
  nameTokens,
  titleCaseShout
} from "../assets";
import type { DocumentView, SourceLine } from "../document-view";
import { buildCandidateDraft, type CandidateDraft } from "../draft";

export const ASSET_NAME_FIELD = "probable_asset_name_mention";

export type AssetNameRole = "primary" | "variant" | "alias";

export interface AssetIdentity {
  name: string;
  line: SourceLine | null;
  rule: string;
}

interface ScoredName {
  name: string;
  line: SourceLine;
  rule: string;
  explicit: boolean;
  headerIndex: number;
}

const HEADER_LINES = 8;
const EXPLICIT_LABEL = /^(?:property|asset|property name)\s*:\s*(.+)$/i;
const UNDERWRITING_TITLE = /^(.+?)\s+underwriting model\b/i;
const TRANSACTION_OF = /\b(?:acquisition|disposition|sale|refinancing)\s+of\s+(.+)$/i;
const KNOWN_AS = /\b(?:asset|property|community)\s+known\s+as\s+["“]([^"”]+)["”]/i;
const DECLARED_ALIASES =
  /\b(?:also\s+)?(?:known|referred\s+to)(?:\s+by\s+[\w ]+?)?\s+as\s+((?:["“][^"”]+["”][\s,]*(?:or|and)?\s*)+)/gi;
const ALTERNATE_NAME = /^(?:alternate|alternative|former|also known as|aka)\s*(?:name)?\s*:\s*(.+)$/i;
const HEADER_PREFIX = /^(?:subject|re|fw|fwd)\s*:\s*/i;
/** Address and date headers name people and days, never the asset. */
const SKIPPED_HEADER = /^(?:from|to|cc|bcc|date|sent|attendees|prepared by)\s*:/i;
const MAX_TITLE_ROW_CELLS = 2;
/** "Nadi, Sarah —" opens a message; it names recipients, not the asset. */
const SALUTATION = /^[A-Z][a-z]+(?:\s*(?:,|and|&)\s*[A-Z][a-z]+)*\s*[—–,-]?\s*$/;
const SUBJECT_LINE = /^subject\s*:/i;

function occurrences(haystack: string, needle: string): number {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return haystack.match(new RegExp(`\\b${escaped}\\b`, "gi"))?.length ?? 0;
}

function nameCandidatesFromLine(line: SourceLine): ScoredName[] {
  const cellCount = line.text.split(" | ").length;
  const text = titleCaseShout(line.text.replace(/\s*\|\s*/g, " ").trim());
  const found: ScoredName[] = [];
  if (SKIPPED_HEADER.test(text) || SALUTATION.test(text) || cellCount > MAX_TITLE_ROW_CELLS) {
    return found;
  }
  const add = (raw: string, rule: string, explicit: boolean): void => {
    const name = raw.replace(/^["“]|["”]$/g, "").trim();
    if (looksLikeAssetName(name)) {
      found.push({ name, line, rule, explicit, headerIndex: Number.POSITIVE_INFINITY });
    }
  };

  const label = text.match(EXPLICIT_LABEL);
  if (label) {
    add(label[1], "explicit_property_label", true);
  }
  const underwriting = text.match(UNDERWRITING_TITLE);
  if (underwriting) {
    add(underwriting[1], "underwriting_model_title", true);
  }
  const knownAs = text.match(KNOWN_AS);
  if (knownAs) {
    add(knownAs[1], "known_as_declaration", true);
  }
  const transaction = text.match(TRANSACTION_OF);
  if (transaction) {
    for (const run of capitalizedRuns(transaction[1].split(/\s[—–-]\s/)[0])) {
      add(run, "transaction_subject", false);
    }
  }
  for (const segment of text.replace(HEADER_PREFIX, "").split(/\s[—–|]\s|,|\(|\)/)) {
    for (const run of capitalizedRuns(segment)) {
      // A lone capitalized word is usually a sentence start ("Unit 103: ..."); accept it only as a whole segment.
      if (run.includes(" ") || segment.trim() === run) {
        add(run, "title_segment", false);
      }
    }
  }
  return found;
}

/**
 * The asset a document is about: explicit labels and titles in the first lines win;
 * otherwise the title-like name mentioned most often; otherwise the file name.
 */
export function identifyAsset(view: DocumentView): AssetIdentity | null {
  const header = view.lines.slice(0, HEADER_LINES);
  const candidates = header.flatMap((line, headerIndex) =>
    nameCandidatesFromLine(line).map((candidate) => ({ ...candidate, headerIndex }))
  );
  const knownAs = view.lines.flatMap((line) => {
    const match = line.text.match(KNOWN_AS);
    return match && looksLikeAssetName(match[1])
      ? [{ name: match[1], line, rule: "known_as_declaration", explicit: true, headerIndex: Number.POSITIVE_INFINITY }]
      : [];
  });
  candidates.push(...knownAs);

  const explicit = candidates.find((candidate) => candidate.explicit);
  if (explicit) {
    return { name: explicit.name, line: explicit.line, rule: explicit.rule };
  }

  // A name earns its place by repetition, by sitting in the title lines, or by being the subject of a transaction.
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score:
        occurrences(view.fullText, candidate.name) +
        (candidate.headerIndex < 2 ? 1.5 : 0) +
        (SUBJECT_LINE.test(candidate.line.text) ? 2 : 0) +
        (candidate.rule === "transaction_subject" ? 2 : 0)
    }))
    .filter((entry) => entry.score >= 2)
    .sort((left, right) => right.score - left.score || right.candidate.name.length - left.candidate.name.length);
  if (scored[0]) {
    const { name, line, rule } = scored[0].candidate;
    return { name, line, rule };
  }

  const fromFile = assetNameFromFileName(view.context.fileName);
  return fromFile ? { name: fromFile, line: null, rule: "file_name" } : null;
}

interface FoundName {
  name: string;
  line: SourceLine;
  role: AssetNameRole;
  rule: string;
}

function declaredAliases(view: DocumentView): { alias: string; rule: string }[] {
  const aliases: { alias: string; rule: string }[] = [];
  const flattened = view.fullText.replace(/\s+/g, " ");
  for (const match of flattened.matchAll(DECLARED_ALIASES)) {
    for (const quoted of match[1].matchAll(/["“]([^"”]+)["”]/g)) {
      aliases.push({ alias: quoted[1].trim(), rule: "declared_alias" });
    }
  }
  for (const line of view.lines) {
    const alternate = line.text.replace(/\s*\|\s*/g, " ").match(ALTERNATE_NAME);
    if (alternate) {
      aliases.push({ alias: alternate[1].trim(), rule: "alternate_name_label" });
    }
  }
  return aliases;
}

function firstLineContaining(view: DocumentView, phrase: string): SourceLine | null {
  const head = phrase.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
  return view.lines.find((line) => line.text.toLowerCase().includes(head)) ?? null;
}

/** Other names the document uses for its own asset: declared aliases, shortened or extended forms, acronyms. */
function findVariants(view: DocumentView, identity: AssetIdentity): FoundName[] {
  const found: FoundName[] = [];
  const firstToken = identity.name.split(/\s+/)[0];
  const escapedFirst = firstToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const extended = new RegExp(`\\b${escapedFirst}(?:\\s+(?:(?:at|of|on)\\s+)?[A-Z][a-zA-Z'’]+){0,3}`, "gi");
  const acronym = acronymOf(identity.name).toUpperCase();
  const acronymPattern =
    acronym.length >= 2 && !isCommonAbbreviation(acronym)
      ? new RegExp(`\\b${acronym}(?:\\s+(?:${CITY_PATTERN_SOURCE}))?\\b`, "g")
      : null;

  for (const { alias, rule } of declaredAliases(view)) {
    const line = firstLineContaining(view, alias);
    if (line) {
      found.push({ name: alias, line, role: "alias", rule });
    }
  }

  for (const line of view.lines) {
    for (const match of line.text.matchAll(extended)) {
      const phrase = capitalizedRuns(match[0])[0] ?? match[0];
      if (looksLikeAssetName(phrase) && namesMatch(phrase, identity.name)) {
        found.push({ name: phrase, line, role: "variant", rule: "shortened_or_extended_form" });
      }
    }
    for (const match of acronymPattern ? line.text.matchAll(acronymPattern) : []) {
      found.push({ name: match[0], line, role: "variant", rule: "acronym" });
    }
  }
  return found;
}

/**
 * One candidate per distinct name: the primary identity, plus every variant and alias.
 * Variants carry the primary name in metadata so the detector can link them even
 * when the variant alone would never match (an alias like "the Houston deal").
 */
export function extractAssetNameCandidates(view: DocumentView): {
  identity: AssetIdentity | null;
  drafts: CandidateDraft[];
} {
  const identity = identifyAsset(view);
  if (!identity) {
    return { identity: null, drafts: [] };
  }

  const fallbackAnchor = identity.line?.anchor ?? view.sheets[0]?.rangeAnchor ?? view.lines[0]?.anchor ?? null;
  const fallback = view.context.provenanceAnchors.items[0] ?? null;
  const primaryAnchor = fallbackAnchor ?? fallback;
  if (!primaryAnchor) {
    return { identity, drafts: [] };
  }

  const drafts: CandidateDraft[] = [];
  const seen = new Set<string>();
  const push = (name: string, role: AssetNameRole, rule: string, line: SourceLine | null): void => {
    const key = nameTokens(name, { keepConnectors: true }).join(" ");
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const anchor = line?.anchor ?? primaryAnchor;
    const evidence = line?.text ?? `File name: ${view.context.fileName}`;
    drafts.push(
      buildCandidateDraft({
        artifactBlobId: view.context.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: name,
        confidence: role === "primary" ? (rule === "file_name" ? 0.7 : 0.88) : role === "alias" ? 0.9 : 0.8,
        evidencePreview: evidence,
        extractionMetadata: { assetRole: role, identityName: identity.name, locatorHint: line?.locatorHint ?? null },
        extractionMethod: "rule",
        extractionMethodDetail: `asset_name_${rule}`,
        fieldName: ASSET_NAME_FIELD,
        metadata: { assetRole: role, identityName: identity.name },
        provenanceAnchors: [anchor],
        summary:
          role === "primary"
            ? `Document is about the asset "${name}".`
            : `Document refers to "${identity.name}" as "${name}".`,
        valueType: "text"
      })
    );
  };

  push(identity.name, "primary", identity.rule, identity.line);
  for (const variant of findVariants(view, identity)) {
    push(variant.name, variant.role, variant.rule, variant.line);
  }
  return { identity, drafts };
}
