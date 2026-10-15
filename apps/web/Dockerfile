# syntax=docker/dockerfile:1
# The web image: Next.js standalone server. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t tp-web .

FROM node:24-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@10.28.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@tp/web..."
RUN pnpm --filter @tp/web build

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
