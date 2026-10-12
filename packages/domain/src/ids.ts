import { randomUUID } from "node:crypto";

export type RemiId =
  | `accclass_${string}`
  | `accfact_${string}`
  | `accrel_${string}`
  | `attachment_${string}`
  | `anchor_${string}`
  | `artifact_${string}`
  | `artifactproc_${string}`
  | `candidate_${string}`
  | `candextract_${string}`
  | `document_${string}`
  | `docpage_${string}`
  | `derived_${string}`
  | `emailmsg_${string}`
  | `emailthread_${string}`
  | `entity_${string}`
  | `entityalias_${string}`
  | `entityevent_${string}`
  | `entityhist_${string}`
  | `entitylink_${string}`
  | `entityprop_${string}`
  | `event_${string}`
  | `ingest_${string}`
  | `normresult_${string}`
  | `review_${string}`
  | `relevent_${string}`
  | `relhist_${string}`
  | `rellink_${string}`
  | `relprop_${string}`
  | `sourceconn_${string}`
  | `sourceitem_${string}`
  | `table_${string}`
  | `workbook_${string}`
  | `worksheet_${string}`
  | `workflow_${string}`;

export function createId(prefix: RemiIdPrefix): RemiId {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export type RemiIdPrefix =
  | "accclass"
  | "accfact"
  | "accrel"
  | "attachment"
  | "anchor"
  | "artifact"
  | "artifactproc"
  | "candidate"
  | "candextract"
  | "document"
  | "docpage"
  | "derived"
  | "emailmsg"
  | "emailthread"
  | "entity"
  | "entityalias"
  | "entityevent"
  | "entityhist"
  | "entitylink"
  | "entityprop"
  | "event"
  | "ingest"
  | "normresult"
  | "review"
  | "relevent"
  | "relhist"
  | "rellink"
  | "relprop"
  | "sourceconn"
  | "sourceitem"
  | "table"
  | "workbook"
  | "worksheet"
  | "workflow";
