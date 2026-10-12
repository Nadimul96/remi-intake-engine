import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

let loaded = false;

export function loadRootEnv(anchorUrl: string): void {
  if (loaded) {
    return;
  }

  let currentDir = path.dirname(fileURLToPath(anchorUrl));
  let envPath: string | null = null;

  while (!envPath) {
    const candidate = path.join(currentDir, ".env");

    if (fs.existsSync(candidate)) {
      envPath = candidate;
      break;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  dotenv.config(envPath ? { path: envPath } : undefined);
  loaded = true;
}

export function requiredEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
