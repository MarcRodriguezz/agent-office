FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ARG INSTALL_AGENT_CLIS=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*
RUN if [ "$INSTALL_AGENT_CLIS" = "true" ]; then npm install -g --no-audit --no-fund @anthropic-ai/claude-code @openai/codex; fi
WORKDIR /app
ENV NODE_ENV=production NODE_NO_WARNINGS=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /app/data /workspace && chown -R node:node /app/data /workspace
USER node
CMD ["node", "dist/server.js"]
