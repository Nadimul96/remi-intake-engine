import { createHash } from "node:crypto";

import type {
  CandidateCitationPacket,
  CandidateExtractionMethod,
  ExtractedCandidateType,
  NormalizedContentSummary,
  ProvenanceAnchorSummary,
  ProvenanceAnchorsSummary
} from "@remi/domain";

export interface CandidateDraft {
  candidateKey: string;
  candidateType: ExtractedCandidateType;
  candidateValue: unknown;
  citationPacket: CandidateCitationPacket;
  confidence: number;
  extractionMethod: CandidateExtractionMethod;
  extractionMethodDetail: string;
  fieldName: string;
  metadata?: Record<string, unknown>;
  reviewReady: boolean;
  sourceSemanticObjectId: string | null;
  sourceSemanticObjectType: string | null;
  summary: string;
  valueType: string;
}

interface ExtractionContext {
  artifactBlobId: string;
  fileName: string;
  normalizedContent: NormalizedContentSummary;
  provenanceAnchors: ProvenanceAnchorsSummary;
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "protonmail.com",
  "yahoo.com"
]);
const ORGANIZATION_NAME_HINT_PATTERN =
  /\b(advisors?|apartments?|asset management|capital|communities|company|corp|corporation|equity|group|holdings?|housing|investments?|llc|lp|management|partners?|properties|real estate|realty|residential|ventures?)\b/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function anchorFor(
  anchors: ProvenanceAnchorSummary[],
  input: { anchorKind?: string; ownerId?: string; ownerType?: string }
): ProvenanceAnchorSummary | null {
  return (
    anchors.find((anchor) => {
      if (input.anchorKind && anchor.anchorKind !== input.anchorKind) {
        return false;
      }

      if (input.ownerType && anchor.ownerType !== input.ownerType) {
        return false;
      }

      if (input.ownerId && anchor.ownerId !== input.ownerId) {
        return false;
      }

      return true;
    }) ?? null
  );
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function collapseAlphaNumeric(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseSenderIdentity(sender: string | null): { displayName: string | null; domain: string | null; emailAddress: string | null } {
  if (!sender) {
    return {
      displayName: null,
      domain: null,
      emailAddress: null
    };
  }

  const trimmed = normalizeWhitespace(sender);
  const angleMatch = trimmed.match(/^(.*?)[<\[](.*?)?[>\]]$/);
  const candidateEmail = angleMatch?.[2]?.trim() || trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
  const emailAddress = candidateEmail ? candidateEmail.toLowerCase() : null;
  const domain = emailAddress?.split("@")[1] ?? null;
  const displayName = angleMatch?.[1]
    ? normalizeWhitespace(angleMatch[1].replace(/^["']|["']$/g, ""))
    : emailAddress === trimmed.toLowerCase()
      ? null
      : trimmed;

  return {
    displayName: displayName || null,
    domain,
    emailAddress
  };
}

function inferOrganizationDomain(sender: string | null): { confidence: number; domain: string } | null {
  const parsed = parseSenderIdentity(sender);
  if (!parsed.domain || PUBLIC_EMAIL_DOMAINS.has(parsed.domain)) {
    return null;
  }

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.domain)) {
    return null;
  }

  return {
    confidence: 0.95,
    domain: parsed.domain
  };
}

function inferOrganizationName(input: { sender: string | null; domain: string | null }): { confidence: number; name: string } | null {
  const parsed = parseSenderIdentity(input.sender);
  if (!parsed.displayName) {
    return null;
  }

  const displayName = normalizeWhitespace(parsed.displayName.replace(/^["']|["']$/g, ""));
  if (!displayName || displayName.length < 4) {
    return null;
  }

  const collapsedDisplayName = collapseAlphaNumeric(displayName);
  if (!collapsedDisplayName || parsed.emailAddress === collapsedDisplayName) {
    return null;
  }

  const baseDomainLabel = input.domain ? input.domain.split(".").slice(-2, -1)[0] ?? input.domain.split(".")[0] : null;
  const collapsedDomainLabel = baseDomainLabel ? collapseAlphaNumeric(baseDomainLabel) : "";
  const hasCorporateSignal = ORGANIZATION_NAME_HINT_PATTERN.test(displayName);
  const matchesDomainIdentity = Boolean(collapsedDomainLabel) && (
    collapsedDisplayName.includes(collapsedDomainLabel) || collapsedDomainLabel.includes(collapsedDisplayName)
  );

  if (!hasCorporateSignal && !matchesDomainIdentity) {
    return null;
  }

  return {
    confidence: hasCorporateSignal && matchesDomainIdentity ? 0.91 : 0.84,
    name: displayName
  };
}

function inferAssetName(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  const normalized = normalizeWhitespace(
    rawValue
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/[()[\]<>]/g, " ")
  );

  const stripped = normalizeWhitespace(
    normalized
      .split(/\b(?:rent roll|workbook|teaser|offering memorandum|om|summary|attached|attachment|updated|sample)\b/i)[0] ?? ""
  );

  if (!stripped || /^remi\b/i.test(stripped) || /^sample\b/i.test(stripped) || stripped.length < 5) {
    return null;
  }

  const titled = /[A-Z]/.test(stripped) ? stripped : toTitleCase(stripped);
  return titled.split(/\s+/).length >= 2 ? titled : null;
}

function classifyDocument(input: { fileName: string; hints: string[] }): { confidence: number; label: string; methodDetail: string } | null {
  const combined = normalizeWhitespace([input.fileName, ...input.hints].join(" ")).toLowerCase();

  if (/\brent roll\b/.test(combined)) {
    return {
      confidence: 0.93,
      label: "rent_roll",
      methodDetail: "filename_or_sheet_name_rule"
    };
  }

  if (/\b(offering memorandum|om)\b/.test(combined)) {
    return {
      confidence: 0.9,
      label: "offering_memorandum",
      methodDetail: "filename_or_subject_rule"
    };
  }

  if (/\bteaser\b/.test(combined)) {
    return {
      confidence: 0.88,
      label: "teaser",
      methodDetail: "subject_or_filename_rule"
    };
  }

  if (/\bworkbook\b/.test(combined)) {
    return {
      confidence: 0.8,
      label: "workbook",
      methodDetail: "filename_or_subject_rule"
    };
  }

  return null;
}

function inferOriginatorRole(input: { bodyPreview: string | null; sender: string | null; subject: string | null }): { confidence: number; role: string } | null {
  const haystack = normalizeWhitespace([input.sender ?? "", input.subject ?? "", input.bodyPreview ?? ""].join(" ")).toLowerCase();

  if (!haystack) {
    return null;
  }

  if (haystack.includes("broker")) {
    return {
      confidence: 0.9,
      role: "broker"
    };
  }

  if (/\bteaser\b/.test(haystack) || /\boffering memorandum\b/.test(haystack) || /\basking price\b/.test(haystack)) {
    return {
      confidence: 0.78,
      role: "broker"
    };
  }

  return null;
}

function parseUsdAmount(rawValue: string, multiplier: string | undefined): number {
  const numeric = Number(rawValue.replace(/,/g, ""));

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (!multiplier) {
    return numeric;
  }

  const normalized = multiplier.toLowerCase();
  if (normalized === "m" || normalized === "mm" || normalized === "million") {
    return numeric * 1_000_000;
  }

  return numeric;
}

function extractAskPrice(text: string | null): { amountUsd: number; rawText: string } | null {
  if (!text) {
    return null;
  }

  const match = text.match(/ask(?:ing)?\s+price(?:\s+is|[:\s-]){0,3}\$?\s*([\d,.]+)\s*(million|mm|m)?/i);
  if (!match) {
    return null;
  }

  const amountUsd = parseUsdAmount(match[1], match[2]);
  if (!amountUsd) {
    return null;
  }

  return {
    amountUsd,
    rawText: match[0]
  };
}

function extractUnitCount(text: string | null): { count: number; rawText: string } | null {
  if (!text) {
    return null;
  }

  const match = text.match(/(\d{1,5})\s*(?:unit|units)\b/i);
  if (!match) {
    return null;
  }

  const count = Number(match[1]);
  if (!Number.isFinite(count)) {
    return null;
  }

  return {
    count,
    rawText: match[0]
  };
}

function buildCandidateDraft(input: {
  artifactBlobId: string;
  candidateType: ExtractedCandidateType;
  candidateValue: unknown;
  confidence: number;
  evidencePreview: string;
  extractionMetadata?: Record<string, unknown>;
  extractionMethod: CandidateExtractionMethod;
  extractionMethodDetail: string;
  fieldName: string;
  metadata?: Record<string, unknown>;
  provenanceAnchors: ProvenanceAnchorSummary[];
  sourceSemanticObjectId: string | null;
  sourceSemanticObjectType: string | null;
  summary: string;
  valueType: string;
}): CandidateDraft {
  const provenanceAnchorIds = input.provenanceAnchors.map((anchor) => anchor.id);
  const createdAt = new Date().toISOString();
  const candidateKey = createHash("sha1")
    .update(
      JSON.stringify({
        artifactBlobId: input.artifactBlobId,
        candidateType: input.candidateType,
        fieldName: input.fieldName,
        provenanceAnchorIds,
        sourceSemanticObjectId: input.sourceSemanticObjectId,
        sourceSemanticObjectType: input.sourceSemanticObjectType,
        value: input.candidateValue
      })
    )
    .digest("hex");

  return {
    candidateKey,
    candidateType: input.candidateType,
    candidateValue: input.candidateValue,
    citationPacket: {
      candidateType: input.candidateType,
      fieldName: input.fieldName,
      candidateValue: input.candidateValue,
      confidenceScore: input.confidence,
      sourceArtifactBlobId: input.artifactBlobId,
      sourceSemanticObjectType: input.sourceSemanticObjectType,
      sourceSemanticObjectId: input.sourceSemanticObjectId,
      provenanceAnchorIds,
      evidencePreview: input.evidencePreview,
      extractionMethod: input.extractionMethod,
      extractionMethodDetail: input.extractionMethodDetail,
      extractionMetadata: input.extractionMetadata ?? {},
      createdAt
    },
    confidence: input.confidence,
    extractionMethod: input.extractionMethod,
    extractionMethodDetail: input.extractionMethodDetail,
    fieldName: input.fieldName,
    metadata: input.metadata,
    reviewReady: provenanceAnchorIds.length > 0,
    sourceSemanticObjectId: input.sourceSemanticObjectId,
    sourceSemanticObjectType: input.sourceSemanticObjectType,
    summary: input.summary,
    valueType: input.valueType
  };
}

function dedupeCandidates(candidates: CandidateDraft[]): CandidateDraft[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.candidateKey)) {
      return false;
    }

    seen.add(candidate.candidateKey);
    return true;
  });
}

function buildDocumentCandidates(input: ExtractionContext): CandidateDraft[] {
  if (!input.normalizedContent.document) {
    return [];
  }

  const candidates: CandidateDraft[] = [];
  const previewAnchor =
    anchorFor(input.provenanceAnchors.items, { anchorKind: "pdf_text_section" }) ??
    anchorFor(input.provenanceAnchors.items, { anchorKind: "pdf_page" });
  const previewText = input.normalizedContent.document.textPreview;

  if (previewAnchor && previewText) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: previewText,
        confidence: 0.72,
        evidencePreview: previewText,
        extractionMethod: "rule",
        extractionMethodDetail: "document_preview_title_rule",
        fieldName: "probable_document_title",
        provenanceAnchors: [previewAnchor],
        sourceSemanticObjectId: previewAnchor.ownerId,
        sourceSemanticObjectType: previewAnchor.ownerType,
        summary: `Document preview suggests the title "${previewText}".`,
        valueType: "text"
      })
    );
  }

  const assetName = inferAssetName(input.fileName) ?? inferAssetName(previewText);
  if (assetName && previewAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: assetName,
        confidence: 0.69,
        evidencePreview: previewText ?? input.fileName,
        extractionMethod: "rule",
        extractionMethodDetail: "document_asset_name_rule",
        fieldName: "probable_asset_name_mention",
        provenanceAnchors: [previewAnchor],
        sourceSemanticObjectId: previewAnchor.ownerId,
        sourceSemanticObjectType: previewAnchor.ownerType,
        summary: `Document text suggests the asset name "${assetName}".`,
        valueType: "text"
      })
    );
  }

  const docClass = classifyDocument({
    fileName: input.fileName,
    hints: [previewText ?? ""]
  });
  if (docClass && previewAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: docClass.label,
        confidence: docClass.confidence,
        evidencePreview: previewText ?? input.fileName,
        extractionMethod: "rule",
        extractionMethodDetail: docClass.methodDetail,
        fieldName: "probable_document_classification",
        provenanceAnchors: [previewAnchor],
        sourceSemanticObjectId: previewAnchor.ownerId,
        sourceSemanticObjectType: previewAnchor.ownerType,
        summary: `Document appears to be a ${docClass.label.replaceAll("_", " ")}.`,
        valueType: "classification"
      })
    );
  }

  const askPrice = extractAskPrice(previewText);
  if (askPrice && previewAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "metric_fact_candidate",
        candidateValue: {
          amountUsd: askPrice.amountUsd,
          currency: "USD"
        },
        confidence: 0.93,
        evidencePreview: askPrice.rawText,
        extractionMetadata: {
          currency: "USD"
        },
        extractionMethod: "rule",
        extractionMethodDetail: "ask_price_regex_rule",
        fieldName: "probable_ask_price",
        provenanceAnchors: [previewAnchor],
        sourceSemanticObjectId: previewAnchor.ownerId,
        sourceSemanticObjectType: previewAnchor.ownerType,
        summary: `Document likely references an asking price of $${askPrice.amountUsd.toLocaleString("en-US")}.`,
        valueType: "currency_usd"
      })
    );
  }

  const unitCount = extractUnitCount(previewText);
  if (unitCount && previewAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "metric_fact_candidate",
        candidateValue: unitCount.count,
        confidence: 0.9,
        evidencePreview: unitCount.rawText,
        extractionMethod: "rule",
        extractionMethodDetail: "unit_count_regex_rule",
        fieldName: "probable_unit_count",
        provenanceAnchors: [previewAnchor],
        sourceSemanticObjectId: previewAnchor.ownerId,
        sourceSemanticObjectType: previewAnchor.ownerType,
        summary: `Document likely references ${unitCount.count} units.`,
        valueType: "integer"
      })
    );
  }

  return candidates;
}

function buildWorkbookCandidates(input: ExtractionContext): CandidateDraft[] {
  if (!input.normalizedContent.workbook) {
    return [];
  }

  const candidates: CandidateDraft[] = [];
  const worksheetAnchors = input.provenanceAnchors.items.filter((anchor) => anchor.anchorKind === "worksheet_range");
  const tableAnchors = input.provenanceAnchors.items.filter((anchor) => anchor.anchorKind === "structured_table_range");
  const combinedHints = [
    input.normalizedContent.workbook.fileName,
    ...input.normalizedContent.worksheets.map((sheet) => sheet.name),
    ...input.normalizedContent.structuredTables.map((table) => table.name)
  ];

  const workbookAnchor = worksheetAnchors[0] ?? tableAnchors[0] ?? null;

  if (workbookAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: input.normalizedContent.workbook.fileName,
        confidence: 0.86,
        evidencePreview: input.normalizedContent.workbook.fileName,
        extractionMethod: "parser",
        extractionMethodDetail: "workbook_filename_parser",
        fieldName: "probable_document_title",
        provenanceAnchors: [workbookAnchor],
        sourceSemanticObjectId: workbookAnchor.ownerId,
        sourceSemanticObjectType: workbookAnchor.ownerType,
        summary: `Workbook filename suggests the title "${input.normalizedContent.workbook.fileName}".`,
        valueType: "text"
      })
    );
  }

  const docClass = classifyDocument({
    fileName: input.normalizedContent.workbook.fileName,
    hints: combinedHints
  });
  if (docClass && workbookAnchor) {
    const supportingAnchors = tableAnchors.length > 0 ? [workbookAnchor, tableAnchors[0]] : [workbookAnchor];
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: docClass.label,
        confidence: docClass.confidence,
        evidencePreview: combinedHints.join(" | "),
        extractionMethod: "rule",
        extractionMethodDetail: docClass.methodDetail,
        fieldName: "probable_document_classification",
        provenanceAnchors: supportingAnchors,
        sourceSemanticObjectId: workbookAnchor.ownerId,
        sourceSemanticObjectType: workbookAnchor.ownerType,
        summary: `Workbook appears to be a ${docClass.label.replaceAll("_", " ")}.`,
        valueType: "classification"
      })
    );
  }

  const assetName = inferAssetName(input.normalizedContent.workbook.fileName);
  if (assetName && workbookAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: assetName,
        confidence: 0.81,
        evidencePreview: input.normalizedContent.workbook.fileName,
        extractionMethod: "rule",
        extractionMethodDetail: "workbook_filename_asset_name_rule",
        fieldName: "probable_asset_name_mention",
        provenanceAnchors: [workbookAnchor],
        sourceSemanticObjectId: workbookAnchor.ownerId,
        sourceSemanticObjectType: workbookAnchor.ownerType,
        summary: `Workbook filename suggests the asset name "${assetName}".`,
        valueType: "text"
      })
    );
  }

  return candidates;
}

function buildEmailCandidates(input: ExtractionContext): CandidateDraft[] {
  if (!input.normalizedContent.emailThread || input.normalizedContent.emailMessages.length === 0) {
    return [];
  }

  const message = input.normalizedContent.emailMessages[0];
  const headerAnchor = anchorFor(input.provenanceAnchors.items, {
    anchorKind: "email_header",
    ownerId: message.id,
    ownerType: "email_message"
  });
  const bodyAnchor = anchorFor(input.provenanceAnchors.items, {
    anchorKind: "email_body",
    ownerId: message.id,
    ownerType: "email_message"
  });
  const threadAnchor = anchorFor(input.provenanceAnchors.items, {
    anchorKind: "email_thread",
    ownerId: input.normalizedContent.emailThread.id,
    ownerType: "email_thread"
  });
  const candidates: CandidateDraft[] = [];

  if (message.subject && headerAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: message.subject,
        confidence: 0.95,
        evidencePreview: message.subject,
        extractionMethod: "parser",
        extractionMethodDetail: "email_subject_parser",
        fieldName: "probable_document_title",
        provenanceAnchors: [headerAnchor],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email subject suggests the working title "${message.subject}".`,
        valueType: "text"
      })
    );
  }

  const assetName = inferAssetName(message.subject) ?? inferAssetName(input.normalizedContent.emailThread.subject);
  if (assetName && headerAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: assetName,
        confidence: 0.86,
        evidencePreview: message.subject ?? input.fileName,
        extractionMethod: "rule",
        extractionMethodDetail: "email_subject_asset_name_rule",
        fieldName: "probable_asset_name_mention",
        provenanceAnchors: [headerAnchor],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email subject suggests the asset name "${assetName}".`,
        valueType: "text"
      })
    );
  }

  const docClass = classifyDocument({
    fileName: input.fileName,
    hints: [message.subject ?? "", message.bodyPreview ?? ""]
  });
  if (docClass && (headerAnchor ?? bodyAnchor)) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: docClass.label,
        confidence: docClass.confidence,
        evidencePreview: normalizeWhitespace([message.subject ?? "", message.bodyPreview ?? ""].join(" ")),
        extractionMethod: "rule",
        extractionMethodDetail: docClass.methodDetail,
        fieldName: "probable_document_classification",
        provenanceAnchors: [headerAnchor, bodyAnchor].filter((value): value is ProvenanceAnchorSummary => Boolean(value)),
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email appears to be a ${docClass.label.replaceAll("_", " ")} intake artifact.`,
        valueType: "classification"
      })
    );
  }

  const originatorRole = inferOriginatorRole({
    sender: message.sender,
    subject: message.subject,
    bodyPreview: message.bodyPreview
  });
  if (originatorRole && headerAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: originatorRole.role,
        confidence: originatorRole.confidence,
        evidencePreview: normalizeWhitespace([message.sender ?? "", message.subject ?? "", message.bodyPreview ?? ""].join(" | ")),
        extractionMethod: "rule",
        extractionMethodDetail: "originator_role_rule",
        fieldName: "probable_originator_role",
        provenanceAnchors: [headerAnchor, ...(bodyAnchor ? [bodyAnchor] : [])],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email sender appears to be acting as a ${originatorRole.role}.`,
        valueType: "classification"
      })
    );
  }

  const strongBrokerRelationshipSignal = originatorRole?.role === "broker" && originatorRole.confidence >= 0.9;

  const organizationDomain = inferOrganizationDomain(message.sender);
  if (organizationDomain && headerAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: organizationDomain.domain,
        confidence: organizationDomain.confidence,
        evidencePreview: message.sender ?? organizationDomain.domain,
        extractionMethod: "rule",
        extractionMethodDetail: "email_sender_domain_rule",
        fieldName: "probable_originating_organization_domain",
        metadata: {
          normalizedDomain: organizationDomain.domain
        },
        provenanceAnchors: [headerAnchor],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email sender domain suggests organization identity around "${organizationDomain.domain}".`,
        valueType: "domain"
      })
    );
  }

  const organizationName = inferOrganizationName({
    sender: message.sender,
    domain: organizationDomain?.domain ?? null
  });
  if (organizationName && headerAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "classification_candidate",
        candidateValue: organizationName.name,
        confidence: organizationName.confidence,
        evidencePreview: message.sender ?? organizationName.name,
        extractionMethod: "rule",
        extractionMethodDetail: "email_sender_organization_name_rule",
        fieldName: "probable_originating_organization_name",
        provenanceAnchors: [headerAnchor],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email sender display name suggests the organization "${organizationName.name}".`,
        valueType: "text"
      })
    );
  }

  if (assetName && headerAnchor && (organizationDomain || organizationName)) {
    const relationshipEvidence = normalizeWhitespace([message.sender ?? "", message.subject ?? "", message.bodyPreview ?? ""].join(" | "));
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "relationship_assertion_candidate",
        candidateValue: {
          assetName,
          emailMessageId: message.id,
          organizationDomain: organizationDomain?.domain ?? null,
          organizationName: organizationName?.name ?? null,
          relationshipType: strongBrokerRelationshipSignal ? "broker_organization_for_asset" : "originating_organization_for_asset"
        },
        confidence: strongBrokerRelationshipSignal ? 0.93 : organizationDomain && organizationName ? 0.9 : 0.82,
        evidencePreview: relationshipEvidence,
        extractionMetadata: {
          assetName,
          organizationDomain: organizationDomain?.domain ?? null,
          organizationName: organizationName?.name ?? null,
          relationshipType: strongBrokerRelationshipSignal ? "broker_organization_for_asset" : "originating_organization_for_asset"
        },
        extractionMethod: "rule",
        extractionMethodDetail: strongBrokerRelationshipSignal
          ? "email_sender_broker_asset_relationship_rule"
          : "email_sender_asset_relationship_rule",
        fieldName: strongBrokerRelationshipSignal
          ? "probable_broker_organization_for_asset"
          : "probable_originating_organization_for_asset",
        provenanceAnchors: [headerAnchor, ...(bodyAnchor ? [bodyAnchor] : [])],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: strongBrokerRelationshipSignal
          ? `Email sender likely represents the broker organization for asset "${assetName}".`
          : `Email sender likely represents the originating organization for asset "${assetName}".`,
        valueType: "relationship"
      })
    );
  }

  if (message.sentAt && headerAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "metric_fact_candidate",
        candidateValue: message.sentAt,
        confidence: 0.99,
        evidencePreview: message.sentAtRaw ?? message.sentAt,
        extractionMethod: "parser",
        extractionMethodDetail: "email_sent_at_parser",
        fieldName: "probable_origination_date",
        provenanceAnchors: [headerAnchor],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email headers indicate an origination timestamp of ${message.sentAt}.`,
        valueType: "date_iso"
      })
    );
  }

  const askPrice = extractAskPrice(message.bodyPreview);
  if (askPrice && bodyAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "metric_fact_candidate",
        candidateValue: {
          amountUsd: askPrice.amountUsd,
          currency: "USD"
        },
        confidence: 0.9,
        evidencePreview: askPrice.rawText,
        extractionMetadata: {
          currency: "USD"
        },
        extractionMethod: "rule",
        extractionMethodDetail: "email_body_ask_price_rule",
        fieldName: "probable_ask_price",
        provenanceAnchors: [bodyAnchor],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email body likely references an asking price of $${askPrice.amountUsd.toLocaleString("en-US")}.`,
        valueType: "currency_usd"
      })
    );
  }

  const unitCount = extractUnitCount(message.bodyPreview);
  if (unitCount && bodyAnchor) {
    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "metric_fact_candidate",
        candidateValue: unitCount.count,
        confidence: 0.88,
        evidencePreview: unitCount.rawText,
        extractionMethod: "rule",
        extractionMethodDetail: "email_body_unit_count_rule",
        fieldName: "probable_unit_count",
        provenanceAnchors: [bodyAnchor],
        sourceSemanticObjectId: message.id,
        sourceSemanticObjectType: "email_message",
        summary: `Email body likely references ${unitCount.count} units.`,
        valueType: "integer"
      })
    );
  }

  for (const attachment of input.normalizedContent.attachments) {
    const attachmentAnchor = anchorFor(input.provenanceAnchors.items, {
      anchorKind: "email_attachment",
      ownerId: attachment.id,
      ownerType: "attachment"
    });

    if (!attachmentAnchor || !attachment.promotedArtifactBlobId) {
      continue;
    }

    const relationEvidence = normalizeWhitespace(
      [attachment.fileName ?? "", message.subject ?? "", message.bodyPreview ?? ""].join(" | ")
    );

    candidates.push(
      buildCandidateDraft({
        artifactBlobId: input.artifactBlobId,
        candidateType: "relationship_assertion_candidate",
        candidateValue: {
          relationshipType: "supports_origination_package",
          attachmentId: attachment.id,
          childArtifactBlobId: attachment.promotedArtifactBlobId,
          childContentKind: attachment.promotedArtifact?.contentKind ?? null,
          emailMessageId: message.id
        },
        confidence: 0.87,
        evidencePreview: relationEvidence,
        extractionMetadata: {
          childArtifactBlobId: attachment.promotedArtifactBlobId,
          childContentKind: attachment.promotedArtifact?.contentKind ?? null
        },
        extractionMethod: "rule",
        extractionMethodDetail: "attachment_context_relationship_rule",
        fieldName: "probable_deal_package_relationship",
        provenanceAnchors: [attachmentAnchor, ...(threadAnchor ? [threadAnchor] : []), ...(bodyAnchor ? [bodyAnchor] : [])],
        sourceSemanticObjectId: attachment.id,
        sourceSemanticObjectType: "attachment",
        summary: `Attachment ${attachment.fileName ?? `part ${attachment.partIndex + 1}`} likely supports the originating deal package context.`,
        valueType: "relationship"
      })
    );
  }

  return candidates;
}

export function extractEvidenceBackedCandidates(input: ExtractionContext): CandidateDraft[] {
  const candidates = (() => {
    switch (input.normalizedContent.contentKind) {
      case "document":
        return buildDocumentCandidates(input);
      case "email":
        return buildEmailCandidates(input);
      case "workbook":
        return buildWorkbookCandidates(input);
      default:
        return [];
    }
  })();

  return dedupeCandidates(candidates.filter((candidate) => candidate.reviewReady));
}
