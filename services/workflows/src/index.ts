import path from "node:path";
import { fileURLToPath } from "node:url";

import { NativeConnection, Worker } from "@temporalio/worker";
import * as conflictActivities from "./activities/conflicts";
import * as intakeActivities from "./activities/intake";
import { workflowConfig } from "./config";

/** Temporal may still be starting when the stack comes up together; keep trying for about a minute. */
async function connectWithRetry(tries = 30): Promise<NativeConnection> {
  for (let remaining = tries; ; remaining -= 1) {
    try {
      return await NativeConnection.connect({ address: workflowConfig.temporal.address });
    } catch (error) {
      if (remaining <= 1) {
        throw error;
      }
      console.warn(`Waiting for Temporal at ${workflowConfig.temporal.address}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main(): Promise<void> {
  const connection = await connectWithRetry();

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
