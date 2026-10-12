import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  // Standalone output gives the Docker image a self-contained server (apps/console/server.js).
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ["@remi/domain"],
  turbopack: { root: workspaceRoot },
  devIndicators: false,
  agentRules: false
};

export default nextConfig;
