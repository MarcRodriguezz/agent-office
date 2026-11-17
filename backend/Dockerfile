FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ARG INSTALL_AGENT_CLIS=true
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git jq openssh-client python3 ripgrep unzip \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*
RUN if [ "$INSTALL_AGENT_CLIS" = "true" ]; then npm install -g --no-audit --no-fund @anthropic-ai/claude-code @openai/codex; fi
WORKDIR /app
ENV NODE_ENV=production NODE_NO_WARNINGS=1 NPM_CONFIG_PREFIX=/home/node/.local PATH=/home/node/.local/bin:$PATH
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /app/data /workspace /home/node/.local/bin && chown -R node:node /app/data /workspace /home/node
USER node
CMD ["node", "dist/gateway.js"]
