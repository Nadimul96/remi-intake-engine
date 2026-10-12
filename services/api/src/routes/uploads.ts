import { PresignUploadRequestSchema } from "@remi/domain";
import type { FastifyPluginAsync } from "fastify";

import { createPresignedUpload } from "../lib/storage";

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/uploads/presign", async (request) => {
    const body = PresignUploadRequestSchema.parse(request.body);
    return createPresignedUpload({
      contentType: body.contentType,
      fileName: body.fileName
    });
  });
};
