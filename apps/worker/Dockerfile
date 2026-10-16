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
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
# The audit report's PDF is printed with Chromium (docs/adr/0037): playwright-core at the version the
# lockfile pins, beside the bundle, and its headless Chromium with the system libraries it needs.
RUN npm install --no-save --omit=dev playwright-core@1.56.1 \
 && npx playwright-core install --with-deps chromium-headless-shell \
 && npm cache clean --force
COPY --from=build --chown=node:node /repo/apps/worker/dist ./dist
# The one-off migration task runs dist/migrate.js from this image before a release receives traffic;
# it applies the migrations from ../migrations (docs/adr/0049).
COPY --from=build --chown=node:node /repo/packages/db/migrations ./migrations
# Amazon RDS's certificate bundle: every database connection verifies the server (sslmode=verify-full)
# and the task definitions point Node at this file (NODE_EXTRA_CA_CERTS; infra/lib/launch.ts).
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
USER node
# ECS sends SIGTERM before stopping a task; the worker drains active jobs and exits.
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/main.js"]
