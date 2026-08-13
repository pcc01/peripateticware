# ─────────────────────────────────────────────────────────────────────────────
# Peripateticware — Frontend Container (multi-stage)
#
#   dev        → Vite dev server with HMR (default for local development;
#                docker-compose.yml selects this via build.target: dev)
#   build      → compiles the static production bundle
#   production → nginx serving the built SPA on port 3000
#                (docker-compose.prod.yml selects this via build.target: production)
#
# Uses node:20-slim (Debian/glibc) NOT alpine.
# Rollup's native binary (@rollup/rollup-linux-x64-gnu) requires glibc;
# Alpine uses musl and causes EBADPLATFORM during npm install.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim AS dev

WORKDIR /app

# Install Python 3 + pip for the localization pipeline (translate_sync.py).
# Localization runs via `npm run build` in CI/dev. It can also be run manually
# inside this container with: npm run i18n:run-all
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip \
    && pip3 install --no-cache-dir --break-system-packages requests \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install package manifests first for Docker layer caching
COPY package.json package-lock.json ./

# Clean install — lock file is regenerated for the Linux/glibc platform.
# --legacy-peer-deps: tolerates the mixed React 18/19 peer dep tree.
RUN rm -rf node_modules && \
    npm install --legacy-peer-deps --no-audit --no-fund

# Copy all source files (node_modules excluded by .dockerignore)
COPY --chown=node:node . .

EXPOSE 3000

# Vite dev server bound to all interfaces so Docker port-forwarding works
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# ─────────────────────────────────────────────────────────────────────────────
# build — static production bundle.
#
# Deliberately runs `vite build` directly, NOT `npm run build`:
#   - the i18n pipeline (i18n:run-all) needs the MS Translator API + network
#     and must not run inside an image build; translated locale files are
#     committed under public/locales and copied into dist/ automatically.
#   - `tsc -b` type-checking belongs in CI/dev, not the image build.
#
# VITE_API_URL is intentionally NOT set: all client code falls back to the
# relative '/api/v1', which the Cloudflare tunnel path-routes to the backend
# on the same hostname (no CORS).
# ─────────────────────────────────────────────────────────────────────────────
FROM dev AS build
ENV NODE_ENV=production
RUN npx vite build

# Prerender public marketing/legal routes to static HTML for crawlers/bots
# (see scripts/prerender.mjs — no SSR framework, so a plain fetch of any
# route otherwise returns an almost-empty <div id="root">). Needs a real
# Chromium, installed here as its own layer so it's cached independently of
# the app source above.
RUN npx playwright install --with-deps chromium

# This image builds in isolation with no live backend reachable, so skip
# /privacy-engine here — it fetches on mount with no fallback UI and would
# otherwise bake in a permanent loading-state snapshot. Every other public
# route is static or degrades gracefully without a backend. See
# scripts/prerender.mjs's top comment for detail.
ENV PRERENDER_SKIP_ROUTES=/privacy-engine
RUN npm run prerender

# ─────────────────────────────────────────────────────────────────────────────
# production — nginx serving the SPA on :3000 (loopback-published in prod;
# cloudflared is the only consumer).
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.prod.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
