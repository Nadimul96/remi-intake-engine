import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { modelConfigFromEnv } from "@remi/extraction";
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

/** Exists while the worker is polling; the compose healthcheck looks for it. */
const READY_FILE = path.join(tmpdir(), "remi-worker-ready");

async function main(): Promise<void> {
  // A restarted container keeps /tmp, so clear a marker left by the previous process.
  await rm(READY_FILE, { force: true });
  const model = modelConfigFromEnv(process.env);
  console.log(`Model-assisted extraction: ${model ? `${model.provider} (${model.model})` : "off, rules only"}`);
  const connection = await connectWithRetry();

  const worker = await Worker.create({
    activities: { ...intakeActivities, ...conflictActivities },
    connection,
    namespace: workflowConfig.temporal.namespace,
    taskQueue: workflowConfig.taskQueue,
    workflowsPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "workflows/register-intake.ts")
  });

  await writeFile(READY_FILE, `${process.pid}\n`);
  try {
    await worker.run();
  } finally {
    await rm(READY_FILE, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
