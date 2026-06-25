FROM python:3.12-slim

WORKDIR /app

# ============================================================================
# INSTALL SYSTEM DEPENDENCIES
# ============================================================================
RUN apt-get update && \
    apt-get install -y \
    build-essential \
    libpq-dev \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# INSTALL PYTHON DEPENDENCIES
# ============================================================================
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ============================================================================
# DOWNLOAD MAXMIND GEOLITE2-COUNTRY DATABASE (requires free license key)
# Set MAXMIND_LICENSE_KEY as a Docker build-arg or leave unset to skip.
# If skipped, the /geo/hint endpoint returns null values (soft degradation).
# ============================================================================
ARG MAXMIND_LICENSE_KEY=""
RUN if [ -n "$MAXMIND_LICENSE_KEY" ]; then \
    echo "Downloading GeoLite2-Country database..." && \
    curl -s -L \
      "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz" \
      -o /tmp/geolite2.tar.gz && \
    tar -xzf /tmp/geolite2.tar.gz -C /tmp && \
    mv /tmp/GeoLite2-Country_*/GeoLite2-Country.mmdb /app/GeoLite2-Country.mmdb && \
    rm -rf /tmp/geolite2.tar.gz /tmp/GeoLite2-Country_* && \
    echo "GeoLite2-Country.mmdb installed."; \
else \
    echo "MAXMIND_LICENSE_KEY not set — skipping GeoLite2 download. /geo/hint will return nulls."; \
fi

# ============================================================================
# COPY APPLICATION CODE
# ============================================================================
COPY . .

# ============================================================================
# HEALTHCHECK
# ============================================================================
# Docker uses this to determine if container is healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# ============================================================================
# STARTUP COMMAND
# ============================================================================
# NOTE: docker-compose.yml has depends_on with service_healthy conditions
# This ensures database is ready before this container starts
# So we don't need a wait script - just start uvicorn directly
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
