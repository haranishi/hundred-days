FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY server ./server
COPY src/shared ./src/shared
RUN npm run build:server
RUN npm prune --omit=dev
FROM gotenberg/gotenberg:8@sha256:aa552cc115db488e0f0bcb07446aac13071ad51505b642c84bb894500907b42b
USER root
RUN apt-get update && apt-get install --no-install-recommends -y qpdf fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=gotenberg:gotenberg /app/node_modules ./node_modules
COPY --from=build --chown=gotenberg:gotenberg /app/dist-server ./dist-server
COPY --from=build --chown=gotenberg:gotenberg /app/package.json ./package.json
USER gotenberg
ENV ENGINE_WORK_ROOT=/tmp/henkan-engine ENGINE_PORT=3001
ENTRYPOINT ["/usr/bin/tini", "-s", "--"]
CMD ["node", "dist-server/server/engine/supervisor.js"]
