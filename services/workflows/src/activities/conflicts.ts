import { runConflictDetection } from "@remi/db";
import { detectConflicts } from "@remi/extraction";

/** Re-run corpus-wide conflict detection after an artifact's candidates change. */
export async function detectConflictsForTenant(input: {
  tenantId: string;
}): Promise<{ current: number; superseded: number }> {
  return runConflictDetection(input.tenantId, detectConflicts);
}
