import { getProvenanceView } from "@remi/db";
import { ProvenanceViewSchema } from "@remi/domain";
import type { FastifyPluginAsync } from "fastify";

export const provenanceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/provenance/:anchorId", async (request, reply) => {
    const view = await getProvenanceView((request.params as { anchorId: string }).anchorId);
    if (!view) {
      reply.code(404);
      return { error: "Not found" };
    }
    return ProvenanceViewSchema.parse(view);
  });
};
