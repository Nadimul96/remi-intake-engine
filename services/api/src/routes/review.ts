import {
  CandidateReviewDetailSchema,
  CandidateReviewQueueResponseSchema,
  ReviewCandidateActionRequestSchema,
  ReviewCandidateActionResponseSchema
} from "@remi/domain";
import {
  CandidateReviewConflictError,
  CandidateReviewNotFoundError,
  getCandidateReviewDetail,
  listCandidateReviewQueue,
  reviewCandidate
} from "@remi/db";
import type { FastifyPluginAsync } from "fastify";

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/review/candidates", async () => {
    const payload = await listCandidateReviewQueue();
    return CandidateReviewQueueResponseSchema.parse(payload);
  });

  app.get("/api/review/candidates/:candidateId", async (request, reply) => {
    const candidateId = (request.params as { candidateId: string }).candidateId;
    const detail = await getCandidateReviewDetail(candidateId);

    if (!detail) {
      reply.code(404);
      return {
        error: "Not found"
      };
    }

    return CandidateReviewDetailSchema.parse(detail);
  });

  app.post("/api/review/candidates/:candidateId/decision", async (request, reply) => {
    const candidateId = (request.params as { candidateId: string }).candidateId;
    const body = ReviewCandidateActionRequestSchema.parse(request.body);

    try {
      const detail = await reviewCandidate({
        action: body.action,
        actorId: request.remiActor.id,
        actorName: request.remiActor.name,
        candidateId,
        note: body.note ?? null,
        reviewedValue: body.reviewedValue
      });

      return ReviewCandidateActionResponseSchema.parse({
        action: body.action,
        ...detail
      });
    } catch (error) {
      if (error instanceof CandidateReviewNotFoundError) {
        reply.code(404);
        return {
          error: error.message
        };
      }

      if (error instanceof CandidateReviewConflictError) {
        reply.code(409);
        return {
          error: error.message
        };
      }

      throw error;
    }
  });
};
