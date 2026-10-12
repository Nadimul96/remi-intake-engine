import { loadRootEnv, requiredEnv } from "@remi/db";

loadRootEnv(import.meta.url);

export const workflowConfig = {
  bucket: requiredEnv("S3_BUCKET"),
  derivedPrefix: process.env.S3_DERIVED_PREFIX ?? "derived",
  extractorUrl: requiredEnv("EXTRACTOR_URL"),
  immutablePrefix: process.env.S3_IMMUTABLE_PREFIX ?? "artifacts",
  s3: {
    accessKeyId: requiredEnv("S3_ACCESS_KEY"),
    endpoint: requiredEnv("S3_ENDPOINT"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    region: process.env.S3_REGION ?? "us-east-1",
    secretAccessKey: requiredEnv("S3_SECRET_KEY"),
    stagingPrefix: process.env.S3_STAGING_PREFIX ?? "staging"
  },
  taskQueue: process.env.INTAKE_TASK_QUEUE ?? "remi-intake",
  temporal: {
    address: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233",
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default"
  }
};
