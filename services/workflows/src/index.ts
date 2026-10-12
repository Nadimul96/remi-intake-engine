import path from "node:path";
import { fileURLToPath } from "node:url";

import { NativeConnection, Worker } from "@temporalio/worker";
import * as conflictActivities from "./activities/conflicts";
import * as intakeActivities from "./activities/intake";
import { workflowConfig } from "./config";

async function main(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: workflowConfig.temporal.address
  });

  const worker = await Worker.create({
    activities: { ...intakeActivities, ...conflictActivities },
    connection,
    namespace: workflowConfig.temporal.namespace,
    taskQueue: workflowConfig.taskQueue,
    workflowsPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "workflows/register-intake.ts")
  });

  await worker.run();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
