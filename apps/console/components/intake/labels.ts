import type { ArtifactParserTarget, IntakeQueueItem } from "@remi/domain";
import { File, FileArchive, FileSpreadsheet, FileText, type LucideIcon, Mail, Sheet as SheetIcon } from "lucide-react";
import { humanize } from "../../lib/format";

export const STAGE_LABEL: Record<IntakeQueueItem["ingestionStage"], string> = {
  registered: "Registered",
  immutable_storage: "Storing artifact",
  inspection: "Inspecting",
  normalization: "Normalizing",
  anchoring: "Anchoring",
  candidate_extraction: "Extracting candidates",
  complete: "Complete",
  failed: "Failed"
};

export const PARSER_LABEL: Record<ArtifactParserTarget, string> = {
  pdf: "PDF",
  eml: "Email",
  xlsx: "Excel",
  csv: "CSV",
  text: "Text",
  archive: "Archive",
  none: "No parser"
};

const PARSER_ICON: Record<ArtifactParserTarget, LucideIcon> = {
  pdf: FileText,
  eml: Mail,
  xlsx: FileSpreadsheet,
  csv: SheetIcon,
  text: FileText,
  archive: FileArchive,
  none: File
};

export function parserIcon(target: ArtifactParserTarget | null): LucideIcon {
  return target ? PARSER_ICON[target] : File;
}

/** Anything registered but not yet finished or failed is still moving through the pipeline. */
export function isInFlight(item: Pick<IntakeQueueItem, "status" | "ingestionStatus">): boolean {
  return (
    item.status === "staged" ||
    item.status === "registered" ||
    item.status === "processing" ||
    item.ingestionStatus === "queued" ||
    item.ingestionStatus === "processing"
  );
}

export const STATUS_FILTERS = ["all", "in_flight", "completed", "failed"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All",
  in_flight: "In flight",
  completed: "Completed",
  failed: "Failed"
};

export function matchesFilter(item: IntakeQueueItem, filter: StatusFilter): boolean {
  switch (filter) {
    case "in_flight":
      return isInFlight(item);
    case "completed":
      return item.status === "completed";
    case "failed":
      return item.status === "failed";
    default:
      return true;
  }
}

/** "metric.landscaping_grounds" -> "landscaping_grounds"; "probable_document_title" -> "document_title". */
export function candidateFieldKey(fieldName: string): string {
  return fieldName.replace(/^metric\./, "").replace(/^probable_/, "");
}

/** humanize() plus the acronyms that appear in classification and anchor kinds ("pdf_page" -> "PDF page"). */
export function kindLabel(value: string | null | undefined): string {
  return humanize(value).replace(/\b(pdf|csv|eml|xlsx)\b/gi, (word) => word.toUpperCase());
}
