import { buildDocumentView, type ExtractionContext } from "./document-view";
import { type CandidateDraft, dedupeCandidates } from "./draft";
import { extractAssetNameCandidates } from "./rules/asset-identity";
import { describeDocument, firstPerMetric } from "./rules/fact-draft";
import { signalCandidates } from "./rules/signals";
import {
  budgetVarianceFacts,
  labelValueFacts,
  operatingStatementFacts,
  rentRollFacts,
  statementPeriod
} from "./rules/table-facts";
import { coverageTableFacts, keyValueLineFacts } from "./rules/text-facts";

/**
 * Rule-based extraction for one artifact. Every draft cites at least one provenance
 * anchor; drafts without grounding are dropped rather than stored as unreviewable noise.
 */
export function extractEvidenceBackedCandidates(context: ExtractionContext): CandidateDraft[] {
  const drafts = signalCandidates(context);
  const kind = context.normalizedContent.contentKind;

  if (kind === "document" || kind === "workbook") {
    const view = buildDocumentView(context);
    const { identity, drafts: assetNames } = extractAssetNameCandidates(view);
    const fallbackPeriod = view.sheets.map(statementPeriod).find(Boolean) ?? null;
    const document = describeDocument(view, identity?.name ?? null, fallbackPeriod);
    const facts = firstPerMetric([
      ...view.sheets.flatMap((sheet) => [
        ...operatingStatementFacts(document, sheet),
        ...rentRollFacts(document, sheet),
        ...budgetVarianceFacts(document, sheet),
        ...labelValueFacts(document, sheet)
      ]),
      ...keyValueLineFacts(document, view.lines),
      ...coverageTableFacts(document, view.lines)
    ]);
    drafts.push(...assetNames, ...facts);
  }

  return dedupeCandidates(drafts.filter((draft) => draft.reviewReady));
}
