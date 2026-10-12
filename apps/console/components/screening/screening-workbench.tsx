import type { CandidateCitationPacket, ConflictSummary, DealScreeningWorkbench } from "@remi/domain";
import type { ReactElement } from "react";

import { AcceptedTruthTable } from "./accepted-truth-table";
import { CandidateTable } from "./candidate-table";
import { IdentityTables } from "./identity-tables";
import { IssueList } from "./issue-list";
import { buildIssueGroups, conflictsForDocument } from "./issues";
import { LaneCards } from "./lane-cards";
import { ScreeningHeader } from "./screening-header";

/** Readiness view for one document: header, lanes, what to do next, then the evidence behind it. */
export function ScreeningWorkbench({
  workbench,
  conflicts
}: {
  workbench: DealScreeningWorkbench;
  conflicts: ConflictSummary[];
}): ReactElement {
  const documentConflicts = conflictsForDocument(conflicts, workbench.sourceItem.artifactBlobId);
  const groups = buildIssueGroups(workbench, documentConflicts);
  const citations = new Map<string, CandidateCitationPacket>(
    workbench.candidateSignals.items.map((candidate) => [candidate.id, candidate.citationPacket])
  );

  return (
    <div className="min-w-0 space-y-4">
      <ScreeningHeader workbench={workbench} />
      <LaneCards workbench={workbench} />
      <IssueList groups={groups} />
      <CandidateTable signals={workbench.candidateSignals} />
      <AcceptedTruthTable truth={workbench.acceptedTruth} citations={citations} />
      <IdentityTables workbench={workbench} />
    </div>
  );
}
