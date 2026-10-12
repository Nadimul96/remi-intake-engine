import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@remi/domain", "@remi/ui"],
  turbopack: {
    root: workspaceRoot
  }
};

export default nextConfig;
