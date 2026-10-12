import { loadRootEnv, requiredEnv } from "@remi/db";

loadRootEnv(import.meta.url);

export const apiConfig = {
  actorId: process.env.DEFAULT_ACTOR_ID ?? "operator-demo",
  actorName: "REMI Operator (Stub)",
  bucket: requiredEnv("MINIO_BUCKET"),
  corsOrigin: process.env.CONSOLE_ORIGIN ?? "http://localhost:3000",
  immutablePrefix: process.env.S3_IMMUTABLE_PREFIX ?? "artifacts",
  intakeSourceConnectionKey: process.env.INTAKE_SOURCE_CONNECTION_KEY ?? "local-upload",
  port: Number(process.env.API_PORT ?? 4001),
  s3: {
    accessKeyId: requiredEnv("S3_ACCESS_KEY"),
    endpoint: requiredEnv("S3_ENDPOINT"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    region: process.env.S3_REGION ?? "us-east-1",
    secretAccessKey: requiredEnv("S3_SECRET_KEY"),
    stagingPrefix: process.env.S3_STAGING_PREFIX ?? "staging"
  },
  taskQueue: process.env.INTAKE_TASK_QUEUE ?? "remi-intake",
  tenantId: process.env.DEFAULT_TENANT_ID ?? "fund-zero",
  temporal: {
    address: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233",
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default"
  }
};
