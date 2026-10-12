import type { FastifyPluginAsync } from "fastify";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/auth/me", async (request) => ({
    actor: request.remiActor,
    authMode: "stub"
  }));
};
