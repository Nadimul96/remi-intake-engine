import { PresignUploadRequestSchema } from "@remi/domain";
import type { FastifyPluginAsync } from "fastify";

import { createPresignedUpload, stageUpload } from "../lib/storage";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: MAX_UPLOAD_BYTES },
    (_request, body, done) => done(null, body)
  );

  /** Browser path: sign a PUT straight to object storage. */
  app.post("/api/uploads/presign", async (request) => {
    const body = PresignUploadRequestSchema.parse(request.body);
    return createPresignedUpload({
      contentType: body.contentType,
      fileName: body.fileName
    });
  });

  /** Script path: POST raw bytes with an `x-file-name` header; returns the staging key to register. */
  app.post("/api/uploads", async (request, reply) => {
    const fileName = decodeURIComponent(String(request.headers["x-file-name"] ?? "")).trim();
    if (!fileName || !Buffer.isBuffer(request.body) || request.body.length === 0) {
      reply.code(400);
      return { error: "Send the file as application/octet-stream with an x-file-name header." };
    }
    const contentType = String(request.headers["x-content-type"] ?? "application/octet-stream");
    return { uploadKey: await stageUpload({ body: request.body, contentType, fileName }) };
  });
};
