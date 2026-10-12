# syntax=docker/dockerfile:1.7
# One image for the TypeScript services (api, worker, migrate, seed) and a lean console image.

FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/console/package.json apps/console/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/extraction/package.json packages/extraction/
COPY services/api/package.json services/api/
COPY services/workflows/package.json services/workflows/
RUN pnpm install --frozen-lockfile

FROM deps AS services
COPY . .
CMD ["pnpm", "--filter", "@remi/api", "start"]

FROM services AS console-build
RUN pnpm --filter @remi/console build

FROM node:24-bookworm-slim AS console
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=console-build /app/apps/console/.next/standalone ./
COPY --from=console-build /app/apps/console/.next/static ./apps/console/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/console/server.js"]
