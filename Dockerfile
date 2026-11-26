# The runner image for a Rivet Cloud cluster. Build with:
#   docker build --platform linux/amd64 -t palmon:local .
# The cluster sets RIVET_ENDPOINT, RIVET_TOKEN, RIVET_POOL and the node version.
# Set PUBLIC_RIVET_ENDPOINT, PUBLIC_RIVET_NAMESPACE and RIVET_ADMIN_TOKEN for the browser's /token.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml rivetkit-effect-pr1800.tgz ./

# Builds the frontend to web/dist. `@effect/ui` installs from pkg.pr.new, so this step needs network.
FROM base AS web
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY shared shared
COPY web web
RUN pnpm build

FROM base
# A runner never starts an engine or Rivet Services, so drop their binaries.
RUN pnpm install --prod --frozen-lockfile \
	&& rm -rf node_modules/.pnpm/@rivetkit+engine-cli-* node_modules/.pnpm/@rivet-dev+services-* \
		node_modules/.pnpm/@rivet-dev+agentos-* node_modules/.pnpm/@rivet-dev+agent-os-* node_modules/.pnpm/@agentos-software* \
	&& rm -rf /root/.local/share/pnpm /root/.cache
COPY shared shared
COPY server server
COPY --from=web /app/web/dist web/dist
ENV NODE_ENV=production
# A small runner (e2-micro, 1 GiB) also holds the actors, so cap the JS heap.
ENV NODE_OPTIONS=--max-old-space-size=256
# Node runs the TypeScript sources directly (type stripping).
CMD ["node", "server/main.ts"]
