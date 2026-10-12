import type { ProvenanceView } from "@remi/domain";

import { getDb } from "./client";
import { mapAnchor } from "./processing";

const CONTEXT_LINES = 4;
const CONTEXT_ROWS = 2;

type AnchorRow = Parameters<typeof mapAnchor>[0] & { position: number | null };

/**
 * An anchor plus the source around it: for a text line, the lines just above and below;
 * for a worksheet row, the sheet's first row (usually the header) and the rows next to it.
 */
export async function getProvenanceView(anchorId: string): Promise<ProvenanceView | null> {
  const sql = getDb();
  const [row] = await sql<
    (AnchorRow & { artifact_blob_id: string; content_type: string | null; original_file_name: string })[]
  >`
    select
      anchor.*,
      coalesce((anchor.locator_json ->> 'lineNumber')::int, (anchor.locator_json ->> 'rowNumber')::int) as position,
      blob.original_file_name,
      blob.content_type
    from provenance_anchors anchor
    join artifact_blobs blob on blob.id = anchor.artifact_blob_id
    where anchor.id = ${anchorId}
  `;
  if (!row) {
    return null;
  }

  let context: AnchorRow[] = [];
  if (row.position !== null && (row.anchor_kind === "text_line" || row.anchor_kind === "worksheet_row")) {
    const radius = row.anchor_kind === "text_line" ? CONTEXT_LINES : CONTEXT_ROWS;
    const positionKey = row.anchor_kind === "text_line" ? "lineNumber" : "rowNumber";
    context = await sql<AnchorRow[]>`
      with ranked as (
        select *, (locator_json ->> ${positionKey})::int as position
        from provenance_anchors
        where owner_id = ${row.owner_id} and anchor_kind = ${row.anchor_kind}
      )
      select * from ranked
      where position between ${row.position - radius} and ${row.position + radius}
         or (${row.anchor_kind === "worksheet_row"} and position = (select min(position) from ranked))
      order by position
    `;
  }

  return {
    anchor: mapAnchor(row),
    artifact: { id: row.artifact_blob_id, fileName: row.original_file_name, contentType: row.content_type },
    context: context.map(mapAnchor)
  };
}
