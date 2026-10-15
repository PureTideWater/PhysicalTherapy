# syntax=docker/dockerfile:1
# The worker image: one bundled ESM file (apps/worker/build.ts). Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t tp-worker .

FROM node:24-slim AS build
RUN npm install --global pnpm@10.28.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@tp/worker..."
RUN pnpm --filter @tp/worker build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/worker/dist ./dist
USER node
# ECS sends SIGTERM before stopping a task; the worker drains active jobs and exits.
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/main.js"]
