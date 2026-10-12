"use client";

import type { CandidateCitationPacket } from "@remi/domain";
import { FileSearch } from "lucide-react";
import { type ReactElement, useState } from "react";

import { cellRefFromHint, ProvenancePanel, type ProvenanceTarget } from "../provenance/provenance-panel";
import { Button } from "../ui/button";

function targetFor(packet: CandidateCitationPacket, label: string): ProvenanceTarget {
  const metadata = packet.extractionMetadata;
  const locatorHint = typeof metadata.locatorHint === "string" ? metadata.locatorHint : null;
  return {
    anchorIds: packet.provenanceAnchorIds,
    label,
    cellRef: cellRefFromHint(locatorHint),
    highlight: typeof metadata.matchedValue === "string" ? metadata.matchedValue : label.replace(/^\$/, "")
  };
}

/** Opens the provenance panel on the line, cell or message a value was read from. */
export function ViewSourceButton({
  packet,
  label
}: {
  packet: CandidateCitationPacket | null;
  label: string;
}): ReactElement {
  const [target, setTarget] = useState<ProvenanceTarget | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={!packet}
        aria-label={`View source of ${label}`}
        title={
          packet
            ? "View the cited source"
            : "The citation for this record is not part of this document's current extraction"
        }
        onClick={() => packet && setTarget(targetFor(packet, label))}
      >
        <FileSearch className="size-3.5" />
        <span className="hidden sm:inline">Source</span>
      </Button>
      <ProvenancePanel target={target} onClose={() => setTarget(null)} />
    </>
  );
}
