# SPOT v6 — production image (Next.js standalone output). Used by Cloud Run and docker compose.
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/presets ./presets
# Settings come from environment variables (DATABASE_URL, ACCESS_CODE, TBA_API_KEY, ...)
# or from a config.json mounted at /app/config/config.json.
EXPOSE 8080
CMD ["node", "server.js"]
