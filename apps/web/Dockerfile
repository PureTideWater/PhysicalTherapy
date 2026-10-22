# syntax=docker/dockerfile:1
# The web image: Next.js standalone server. Build from the repository root, once per environment, with that
# environment's StaticAssetsOrigin stack output (Next writes it into the build as assetPrefix; docs/adr/0055):
#   docker build -f apps/web/Dockerfile --build-arg STATIC_ASSET_ORIGIN=https://<StaticDomainName> -t tp-web .
# Without it, pages load their assets from the application's own host.

FROM node:25-slim AS build
ARG STATIC_ASSET_ORIGIN=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    STATIC_ASSET_ORIGIN=${STATIC_ASSET_ORIGIN}
RUN npm install --global pnpm@10.28.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@tp/web..."
RUN pnpm --filter @tp/web build

FROM node:25-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Debian's security updates published since the base image, and no package manager left in the running
# image: the image scan (supply-chain.yml) fails on any HIGH or CRITICAL finding that has a fix, and the
# npm, npx and corepack the base image bundles are never run by the server.
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# The public files (the brand art under /brand, the manifest's icons), which the standalone output leaves out. CloudFront
# serves /_next/static/ and /brand/ from this image's answers (infra/lib/constructs/edge.ts), so a deploy publishes them.
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
# Amazon RDS's certificate bundle: every database connection verifies the server (sslmode=verify-full)
# and the task definition points Node at this file (NODE_EXTRA_CA_CERTS; infra/lib/launch.ts).
# It is added without --chmod and its modes are set as root: BuildKit gives an ADD's --chmod to the directories it
# creates and to its existing parent (moby/buildkit#5943), so --chmod=644 left /etc/ssl untraversable, and Node, which
# reads /etc/ssl/openssl.cnf as it starts, could not start as node (screening-capacity run 39536429652).
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
RUN chmod 0755 /etc/ssl /etc/ssl/certs && chmod 0644 /etc/ssl/certs/rds-global-bundle.pem
USER node
# Node starts as the image's user and reads the bundle, or the build fails here rather than the deploy.
RUN ["node", "-e", "require('node:fs').readFileSync('/etc/ssl/certs/rds-global-bundle.pem')"]
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
