import { buildDocumentView, type ExtractionContext } from "./document-view";
import { type CandidateDraft, dedupeCandidates } from "./draft";
import type { ModelClient } from "./model/clients";
import { proposeModelCandidates } from "./model/propose";
import { extractAssetNameCandidates } from "./rules/asset-identity";
import { type DocumentFacts, describeDocument, firstPerMetric } from "./rules/fact-draft";
import { signalCandidates } from "./rules/signals";
import {
  budgetVarianceFacts,
  labelValueFacts,
  operatingStatementFacts,
  rentRollFacts,
  statementPeriod
} from "./rules/table-facts";
import { coverageTableFacts, keyValueLineFacts } from "./rules/text-facts";

function ruleExtraction(context: ExtractionContext): { drafts: CandidateDraft[]; document: DocumentFacts | null } {
  const drafts = signalCandidates(context);
  const kind = context.normalizedContent.contentKind;
  if (kind !== "document" && kind !== "workbook") {
    return { drafts, document: null };
  }

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
  return { drafts: [...drafts, ...assetNames, ...facts], document };
}

/**
 * Rule-based extraction for one artifact. Every draft cites at least one provenance
 * anchor; drafts without grounding are dropped rather than stored as unreviewable noise.
 */
export function extractEvidenceBackedCandidates(context: ExtractionContext): CandidateDraft[] {
  return dedupeCandidates(ruleExtraction(context).drafts.filter((draft) => draft.reviewReady));
}

export interface CandidateExtraction {
  drafts: CandidateDraft[];
  model: { used: boolean; proposed: number; rejected: number; warnings: string[] };
}

/**
 * Rules first, then (when a model client is configured) grounded model proposals for
 * anything the rules missed. Model failures become warnings; they never fail extraction.
 */
export async function extractCandidates(
  context: ExtractionContext,
  options: { modelClient?: ModelClient | null } = {}
): Promise<CandidateExtraction> {
  const { drafts, document } = ruleExtraction(context);
  const grounded = dedupeCandidates(drafts.filter((draft) => draft.reviewReady));
  if (!options.modelClient || !document) {
    return { drafts: grounded, model: { used: false, proposed: 0, rejected: 0, warnings: [] } };
  }

  const proposals = await proposeModelCandidates({
    client: options.modelClient,
    context,
    document,
    existing: grounded
  });
  return {
    drafts: dedupeCandidates([...grounded, ...proposals.drafts]),
    model: {
      used: true,
      proposed: proposals.drafts.length,
      rejected: proposals.rejected.length,
      warnings: proposals.warnings
    }
  };
}
