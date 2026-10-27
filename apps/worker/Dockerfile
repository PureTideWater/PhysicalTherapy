# The worker image: one bundled ESM file (apps/worker/build.ts). Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t tp-worker .

# Node 24 on Debian 13 (trixie), by the index digest Dependabot's docker entry updates; both stages, both images.
FROM node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS build
WORKDIR /repo
# pnpm at the exact version package.json's packageManager names, so no version is written here (tools/check-toolchain
# refuses one). install-pnpm.sh packs that version from the registry and installs the tarball only when its sha512
# equals packageManager's +sha512 suffix, which check-toolchain holds to the registry's dist.integrity: the bytes are
# the ones committed, not only the ones the registry's answer vouches for. The base image's corepack would need its
# signing keys current, and Node 25 and later no longer bundle it.
COPY package.json ./
COPY tools/check-toolchain/install-pnpm.sh /tmp/install-pnpm.sh
RUN sh /tmp/install-pnpm.sh package.json && rm /tmp/install-pnpm.sh
COPY . .
RUN pnpm install --frozen-lockfile --filter "@tp/worker..."
RUN pnpm --filter @tp/worker build
# The playwright-core the lockfile resolves for the worker, whose tarball the install above checked against the lockfile's
# integrity, copied out whole for the runtime stage, its links followed: the image names no version of its own, so it
# cannot drift from the manifests (docs/adr/0058; test matrix CI-18).
RUN mkdir /out && cp -RL apps/worker/node_modules/playwright-core /out/playwright-core

FROM node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS runtime
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
# The audit report's PDF is printed with Chromium (docs/adr/0037): the build stage's playwright-core, the one the
# lockfile pins, beside the bundle, and the headless shell its browsers.json names, with the system libraries it needs.
# ci.yml's images job and the release's build hold that headless shell, every file of it, to apps/web/e2e/browser.json
# (tools/ci/browser-build.ts --image). Debian's security updates published since the base image come first, and npm,
# npx and corepack are removed once Chromium is in: the image scan (ci.yml's images job) fails on any HIGH or CRITICAL
# finding that has a fix, and the worker never runs a package manager.
COPY --from=build /out/playwright-core ./node_modules/playwright-core
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
 && node node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build --chown=node:node /repo/apps/worker/dist ./dist
# The one-off migration task runs dist/migrate.js from this image before a release receives traffic;
# it applies the migrations from ../migrations (docs/adr/0049).
COPY --from=build --chown=node:node /repo/packages/db/migrations ./migrations
# Amazon RDS's certificate bundle: every database connection verifies the server (sslmode=verify-full)
# and the task definitions point Node at this file (NODE_EXTRA_CA_CERTS; infra/lib/launch.ts).
# It is added without --chmod and its modes are set as root: BuildKit gives an ADD's --chmod to the directories it
# creates and to its existing parent (moby/buildkit#5943), so --chmod=644 left /etc/ssl untraversable, and Node, which
# reads /etc/ssl/openssl.cnf as it starts, could not start as node (screening-capacity run 39536429652).
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
RUN chmod 0755 /etc/ssl /etc/ssl/certs && chmod 0644 /etc/ssl/certs/rds-global-bundle.pem
USER node
# Node starts as the image's user and reads the bundle, or the build fails here rather than the deploy.
RUN ["node", "-e", "require('node:fs').readFileSync('/etc/ssl/certs/rds-global-bundle.pem')"]
# ECS sends SIGTERM before stopping a task; the worker drains active jobs and exits.
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/main.js"]
