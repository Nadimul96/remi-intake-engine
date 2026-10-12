import {
  AcceptedRecordTypeSchema,
  AcceptedTruthBrowserResponseSchema,
  AcceptedTruthDetailSchema,
  AcceptedTruthFilterSchema
} from "@remi/domain";
import { getAcceptedTruthDetail, listAcceptedTruthRecords } from "@remi/db";
import type { FastifyPluginAsync } from "fastify";

export const truthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/truth", async (request, reply) => {
    const filterResult = AcceptedTruthFilterSchema.safeParse(((request.query as { type?: string }).type ?? "all").trim());
    if (!filterResult.success) {
      reply.code(400);
      return {
        error: "Invalid accepted truth filter."
      };
    }

    const payload = await listAcceptedTruthRecords(filterResult.data);
    return AcceptedTruthBrowserResponseSchema.parse(payload);
  });

  app.get("/api/truth/:acceptedRecordType/:acceptedRecordId", async (request, reply) => {
    const params = request.params as {
      acceptedRecordId: string;
      acceptedRecordType: string;
    };

    const typeResult = AcceptedRecordTypeSchema.safeParse(params.acceptedRecordType);
    if (!typeResult.success) {
      reply.code(400);
      return {
        error: "Invalid accepted record type."
      };
    }

    const detail = await getAcceptedTruthDetail({
      acceptedRecordId: params.acceptedRecordId,
      acceptedRecordType: typeResult.data
    });

    if (!detail) {
      reply.code(404);
      return {
        error: "Not found"
      };
    }

    return AcceptedTruthDetailSchema.parse(detail);
  });
};
