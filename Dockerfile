# Local development image for the Sites edition (Worker + D1 + R2, simulated locally by Miniflare/workerd).
# Each computer builds its own image with `docker compose build`; the image is not shared between machines.
# Settings, the local database and uploaded files live in the `vaps-data` volume, never in the image. See DOCKER.md.
FROM node:22-bookworm-slim

ENV NODE_ENV=development \
    WRANGLER_SEND_METRICS=false \
    WRANGLER_WRITE_LOGS=false

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/session').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "docker/entrypoint.sh"]
