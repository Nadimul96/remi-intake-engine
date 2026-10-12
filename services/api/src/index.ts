import cors from "@fastify/cors";
import Fastify from "fastify";
import { apiConfig } from "./lib/config";
import { authRoutes } from "./routes/auth";
import { conflictRoutes } from "./routes/conflicts";
import { entityRoutes } from "./routes/entities";
import { healthRoutes } from "./routes/health";
import { intakeRoutes } from "./routes/intake";
import { relationshipRoutes } from "./routes/relationships";
import { reviewRoutes } from "./routes/review";
import { screeningRoutes } from "./routes/screening";
import { truthRoutes } from "./routes/truth";
import { uploadRoutes } from "./routes/uploads";

declare module "fastify" {
  interface FastifyRequest {
    remiActor: {
      id: string;
      name: string;
    };
  }
}

async function main(): Promise<void> {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: apiConfig.corsOrigin
  });

  app.addHook("onRequest", async (request) => {
    request.remiActor = {
      id: apiConfig.actorId,
      name: apiConfig.actorName
    };
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(uploadRoutes);
  await app.register(intakeRoutes);
  await app.register(reviewRoutes);
  await app.register(screeningRoutes);
  await app.register(relationshipRoutes);
  await app.register(entityRoutes);
  await app.register(truthRoutes);
  await app.register(conflictRoutes);

  await app.listen({
    host: "0.0.0.0",
    port: apiConfig.port
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
