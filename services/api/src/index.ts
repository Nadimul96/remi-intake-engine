import cors from "@fastify/cors";
import Fastify from "fastify";
import { apiConfig } from "./lib/config";
import { ensureBucket } from "./lib/storage";
import { authRoutes } from "./routes/auth";
import { conflictRoutes } from "./routes/conflicts";
import { entityRoutes } from "./routes/entities";
import { healthRoutes } from "./routes/health";
import { intakeRoutes } from "./routes/intake";
import { provenanceRoutes } from "./routes/provenance";
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

async function retry(what: string, attempt: () => Promise<void>, tries = 30): Promise<void> {
  for (let remaining = tries; ; remaining -= 1) {
    try {
      return await attempt();
    } catch (error) {
      if (remaining <= 1) {
        throw error;
      }
      console.warn(`Waiting for ${what}: ${error instanceof Error ? error.message : error}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main(): Promise<void> {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: apiConfig.corsOrigins
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
  await app.register(provenanceRoutes);

  // Storage may still be starting when the stack comes up together.
  await retry("object storage", ensureBucket);

  await app.listen({
    host: "0.0.0.0",
    port: apiConfig.port
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
