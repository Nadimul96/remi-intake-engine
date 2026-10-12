import { ConflictNotFoundError, decideConflict, getConflict, listConflicts } from "@remi/db";
import { ConflictListResponseSchema, ConflictResolutionRequestSchema, ConflictSummarySchema } from "@remi/domain";
import type { FastifyPluginAsync } from "fastify";

import { apiConfig } from "../lib/config";

export const conflictRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/conflicts", async () => ConflictListResponseSchema.parse(await listConflicts(apiConfig.tenantId)));

  app.get("/api/conflicts/:conflictId", async (request, reply) => {
    const conflict = await getConflict((request.params as { conflictId: string }).conflictId);
    if (!conflict) {
      reply.code(404);
      return { error: "Not found" };
    }
    return ConflictSummarySchema.parse(conflict);
  });

  app.post("/api/conflicts/:conflictId/decision", async (request, reply) => {
    const body = ConflictResolutionRequestSchema.parse(request.body);
    try {
      return ConflictSummarySchema.parse(
        await decideConflict({
          action: body.action,
          actorId: request.remiActor.id,
          candidateId: body.candidateId ?? null,
          conflictId: (request.params as { conflictId: string }).conflictId,
          note: body.note ?? null
        })
      );
    } catch (error) {
      if (error instanceof ConflictNotFoundError) {
        reply.code(404);
        return { error: error.message };
      }
      throw error;
    }
  });
};
