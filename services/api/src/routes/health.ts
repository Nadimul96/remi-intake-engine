import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    service: "remi-api",
    status: "ok"
  }));

  app.get("/api/health", async () => ({
    service: "remi-api",
    status: "ok"
  }));
};
