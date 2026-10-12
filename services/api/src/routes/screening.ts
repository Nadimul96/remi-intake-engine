import { DealScreeningWorkbenchSchema } from "@remi/domain";
import { getDealScreeningWorkbench } from "@remi/db";
import type { FastifyPluginAsync } from "fastify";

export const screeningRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/screening/:sourceItemId", async (request, reply) => {
    const sourceItemId = (request.params as { sourceItemId: string }).sourceItemId;
    const workbench = await getDealScreeningWorkbench(sourceItemId);

    if (!workbench) {
      reply.code(404);
      return {
        error: "Not found"
      };
    }

    return DealScreeningWorkbenchSchema.parse(workbench);
  });
};
