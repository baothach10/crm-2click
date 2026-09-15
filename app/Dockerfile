# syntax=docker/dockerfile:1
FROM node:22.23.2-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build \
 && mkdir -p dist/migrations dist/import/transform dist/web \
 && cp src/migrations/*.sql dist/migrations/ \
 && cp src/import/staging.sql dist/import/ \
 && cp src/import/transform/*.sql dist/import/transform/ \
 && cp src/web/style.css dist/web/

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
RUN useradd --system --uid 10001 --create-home appuser
USER appuser
EXPOSE 3000
CMD ["node", "dist/server.js"]
