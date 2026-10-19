FROM node:26.12.0-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @restaurant-os/api... build && pnpm --filter @restaurant-os/api deploy --prod --legacy /prod/api

FROM node:26.12.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build --chown=node:node /prod/api /workspace
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
