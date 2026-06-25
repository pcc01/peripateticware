# ─────────────────────────────────────────────────────────────────────────────
# Peripateticware — Frontend Development Container
#
# Uses node:20-slim (Debian/glibc) NOT alpine.
# Rollup's native binary (@rollup/rollup-linux-x64-gnu) requires glibc;
# Alpine uses musl and causes EBADPLATFORM during npm install.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Install Python 3 + pip for the localization pipeline (translate_sync.py).
# Localization runs automatically on `npm run build` and in CI/CD before
# the Docker image is published. It can also be run manually inside this
# container with: npm run i18n:run-all
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
