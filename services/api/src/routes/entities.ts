import {
  EntityResolutionDecisionRequestSchema,
  EntityResolutionDecisionResponseSchema,
  EntityResolutionDetailSchema,
  EntityResolutionQueueResponseSchema
} from "@remi/domain";
import {
  EntityResolutionConflictError,
  EntityResolutionNotFoundError,
  getEntityResolutionDetail,
  listEntityResolutionQueue,
  reviewEntityResolutionProposal
} from "@remi/db";
import type { FastifyPluginAsync } from "fastify";

export const entityRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/entities/reconciliation", async () => {
    const payload = await listEntityResolutionQueue();
    return EntityResolutionQueueResponseSchema.parse(payload);
  });

  app.get("/api/entities/reconciliation/:proposalId", async (request, reply) => {
    const proposalId = (request.params as { proposalId: string }).proposalId;
    const detail = await getEntityResolutionDetail(proposalId);

    if (!detail) {
      reply.code(404);
      return {
        error: "Not found"
      };
    }

    return EntityResolutionDetailSchema.parse(detail);
  });

  app.post("/api/entities/reconciliation/:proposalId/decision", async (request, reply) => {
    const proposalId = (request.params as { proposalId: string }).proposalId;
    const body = EntityResolutionDecisionRequestSchema.parse(request.body);

    try {
      const detail = await reviewEntityResolutionProposal({
        action: body.action,
        actorId: request.remiActor.id,
        actorName: request.remiActor.name,
        proposalId,
        note: body.note ?? null,
        targetEntityId: body.targetEntityId,
        displayName: body.displayName,
        entityType: body.entityType
      });

      return EntityResolutionDecisionResponseSchema.parse({
        action: body.action,
        ...detail
      });
    } catch (error) {
      if (error instanceof EntityResolutionNotFoundError) {
        reply.code(404);
        return {
          error: error.message
        };
      }

      if (error instanceof EntityResolutionConflictError) {
        reply.code(409);
        return {
          error: error.message
        };
      }

      throw error;
    }
  });
};
