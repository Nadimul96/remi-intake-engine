import { randomUUID } from "node:crypto";

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { apiConfig } from "./config";

function createClient(endpoint: string): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId: apiConfig.s3.accessKeyId,
      secretAccessKey: apiConfig.s3.secretAccessKey
    },
    endpoint,
    forcePathStyle: apiConfig.s3.forcePathStyle,
    region: apiConfig.s3.region
  });
}

const s3Client = createClient(apiConfig.s3.endpoint);
// Presigned URLs embed their host, so they are signed against the address the browser can reach.
const presignClient = createClient(apiConfig.s3.publicEndpoint);

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Create the bucket and allow the console to PUT presigned uploads from the browser,
 * so a fresh stack needs no manual storage setup.
 */
export async function ensureBucket(): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: apiConfig.bucket }));
  } catch {
    await s3Client.send(new CreateBucketCommand({ Bucket: apiConfig.bucket }));
  }
  await s3Client.send(
    new PutBucketCorsCommand({
      Bucket: apiConfig.bucket,
      CORSConfiguration: {
        CORSRules: [
          { AllowedOrigins: apiConfig.corsOrigins, AllowedMethods: ["PUT"], AllowedHeaders: ["*"], MaxAgeSeconds: 3600 }
        ]
      }
    })
  );
}

function stagingKey(fileName: string): string {
  return `${apiConfig.s3.stagingPrefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

/** Server-side upload for scripts and curl: the bytes pass through the API into the staging prefix. */
export async function stageUpload(input: { body: Buffer; contentType: string; fileName: string }): Promise<string> {
  const uploadKey = stagingKey(input.fileName);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: apiConfig.bucket,
      Body: input.body,
      ContentType: input.contentType,
      Key: uploadKey,
      Metadata: { "original-file-name": encodeURIComponent(input.fileName) }
    })
  );
  return uploadKey;
}

export async function createPresignedUpload(input: {
  contentType: string;
  fileName: string;
}): Promise<{ headers: Record<string, string>; uploadKey: string; uploadUrl: string }> {
  const uploadKey = stagingKey(input.fileName);
  const command = new PutObjectCommand({
    Bucket: apiConfig.bucket,
    ContentType: input.contentType,
    Key: uploadKey,
    Metadata: {
      "original-file-name": encodeURIComponent(input.fileName)
    }
  });

  const uploadUrl = await getSignedUrl(presignClient, command, {
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
