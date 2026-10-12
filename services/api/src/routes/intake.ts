import {
  bindWorkflowExecutionId,
  buildSourceUri,
  createIntakeRegistration,
  ensureSourceConnection,
  getIntakeQueueItem,
  listIntakeQueueItems
} from "@remi/db";
import {
  INTAKE_REGISTRATION_WORKFLOW,
  IntakeRegistrationWorkflowInputSchema,
  RegisterIntakeRequestSchema
} from "@remi/domain";
import type { FastifyPluginAsync } from "fastify";

import { apiConfig } from "../lib/config";
import { getTemporalClient } from "../lib/temporal";

export const intakeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/intake", async () => ({
    items: await listIntakeQueueItems()
  }));

  app.get("/api/intake/:sourceItemId", async (request, reply) => {
    const sourceItemId = (request.params as { sourceItemId: string }).sourceItemId;
    const item = await getIntakeQueueItem(sourceItemId);

    if (!item) {
      reply.code(404);
      return {
        error: "Not found"
      };
    }

    return item;
  });

  app.post("/api/intake/register", async (request) => {
    const body = RegisterIntakeRequestSchema.parse(request.body);
    const sourceConnection = await ensureSourceConnection({
      key: apiConfig.intakeSourceConnectionKey,
      kind: "upload",
      name: "Local Upload",
      tenantId: apiConfig.tenantId
    });

    const registration = await createIntakeRegistration({
      actorId: request.remiActor.id,
      contentType: body.contentType,
      fileName: body.fileName,
      objectKey: body.uploadKey,
      sizeBytes: body.sizeBytes,
      sourceConnectionId: sourceConnection.id,
      sourceUri: buildSourceUri(body.uploadKey),
      tenantId: apiConfig.tenantId
    });

    if (registration.shouldStartWorkflow) {
      const temporal = await getTemporalClient();
      const workflowHandle = await temporal.workflow.start(INTAKE_REGISTRATION_WORKFLOW, {
        args: [
          IntakeRegistrationWorkflowInputSchema.parse({
            actorId: request.remiActor.id,
            fileName: body.fileName,
            ingestionRunId: registration.ingestionRunId,
            sourceItemId: registration.sourceItemId,
            tenantId: apiConfig.tenantId,
            uploadKey: body.uploadKey,
            workflowRunId: registration.workflowRunId
          })
        ],
        taskQueue: apiConfig.taskQueue,
        workflowId: `intake-${registration.sourceItemId}`
      });

      await bindWorkflowExecutionId({
        actorId: request.remiActor.id,
        externalWorkflowId: workflowHandle.workflowId,
        workflowRunId: registration.workflowRunId
      });
    }

    return {
      ingestionRunId: registration.ingestionRunId,
      sourceItemId: registration.sourceItemId,
      wasReplayed: registration.wasReplayed,
      workflowRunId: registration.workflowRunId
    };
  });
};
