FROM node:26.13.0-slim AS base

WORKDIR /app

RUN npm i -g corepack && corepack enable && apt-get update && apt-get install -y --no-install-recommends ffmpeg

ADD ./pnpm-lock.yaml ./pnpm-workspace.yaml ./package.json ./tsconfig.json /app/

FROM base AS build

RUN pnpm install --frozen-lockfile

USER 1000

CMD ["node", "--import", "tsx", "--watch", "src/index.ts"]
