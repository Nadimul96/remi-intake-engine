import { randomUUID } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { apiConfig } from "./config";

const s3Client = new S3Client({
  credentials: {
    accessKeyId: apiConfig.s3.accessKeyId,
    secretAccessKey: apiConfig.s3.secretAccessKey
  },
  endpoint: apiConfig.s3.endpoint,
  forcePathStyle: apiConfig.s3.forcePathStyle,
  region: apiConfig.s3.region
});

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function createPresignedUpload(input: {
  contentType: string;
  fileName: string;
}): Promise<{ headers: Record<string, string>; uploadKey: string; uploadUrl: string }> {
  const uploadKey = `${apiConfig.s3.stagingPrefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
  const command = new PutObjectCommand({
    Bucket: apiConfig.bucket,
    ContentType: input.contentType,
    Key: uploadKey,
    Metadata: {
      "original-file-name": input.fileName
    }
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 60 * 10
  });

  return {
    uploadKey,
    uploadUrl,
    headers: {
      "Content-Type": input.contentType
    }
  };
}
