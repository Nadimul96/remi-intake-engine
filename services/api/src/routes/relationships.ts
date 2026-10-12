import {
  AssetOrganizationRelationshipConflictError,
  AssetOrganizationRelationshipNotFoundError,
  getAssetOrganizationRelationshipDetail,
  listAssetOrganizationRelationshipQueue,
  reviewAssetOrganizationRelationshipProposal
} from "@remi/db";
import {
  AssetOrganizationRelationshipDetailSchema,
  AssetOrganizationRelationshipQueueResponseSchema,
  RelationshipQueueFiltersSchema,
  RelationshipResolutionDecisionRequestSchema,
  RelationshipResolutionDecisionResponseSchema
} from "@remi/domain";
import type { FastifyPluginAsync } from "fastify";

export const relationshipRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/relationships/reconciliation", async (request) => {
    const filters = RelationshipQueueFiltersSchema.parse({
      relationshipType: (request.query as Record<string, string | undefined>).relationshipType,
      lifecycle: (request.query as Record<string, string | undefined>).lifecycle,
      linkState: (request.query as Record<string, string | undefined>).linkState,
      proposalState: (request.query as Record<string, string | undefined>).proposalState
    });

    const payload = await listAssetOrganizationRelationshipQueue(filters);
    return AssetOrganizationRelationshipQueueResponseSchema.parse(payload);
  });

  app.get("/api/relationships/reconciliation/:proposalId", async (request, reply) => {
    const proposalId = (request.params as { proposalId: string }).proposalId;
    const detail = await getAssetOrganizationRelationshipDetail(proposalId);

    if (!detail) {
      reply.code(404);
      return {
        error: "Not found"
      };
    }

    return AssetOrganizationRelationshipDetailSchema.parse(detail);
  });

  app.post("/api/relationships/reconciliation/:proposalId/decision", async (request, reply) => {
    const proposalId = (request.params as { proposalId: string }).proposalId;
    const body = RelationshipResolutionDecisionRequestSchema.parse(request.body);

    try {
      const detail = await reviewAssetOrganizationRelationshipProposal({
        action: body.action,
        actorId: request.remiActor.id,
        actorName: request.remiActor.name,
        canonicalAssetEntityId: body.canonicalAssetEntityId,
        canonicalOrganizationEntityId: body.canonicalOrganizationEntityId,
        note: body.note ?? null,
        proposalId
      });

      return RelationshipResolutionDecisionResponseSchema.parse({
        action: body.action,
        ...detail
      });
    } catch (error) {
      if (error instanceof AssetOrganizationRelationshipNotFoundError) {
        reply.code(404);
        return {
          error: error.message
        };
      }

      if (error instanceof AssetOrganizationRelationshipConflictError) {
        reply.code(409);
        return {
          error: error.message
        };
      }

      throw error;
    }
  });
};
