FROM node:24.15-slim AS base

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production

ADD ./pnpm-lock.yaml ./pnpm-workspace.yaml ./package.json /app/

FROM base AS build

RUN pnpm install --frozen-lockfile

ADD . /app

RUN pnpm build

FROM base AS prod

RUN npm i -g pm2 && apt-get update && apt-get install -y --no-install-recommends ffmpeg

RUN pnpm install --prod --frozen-lockfile

ADD . /app

COPY --from=build /app/dist /app/dist

RUN mkdir /app/var && chown 1000 /app/var \
    && chmod +x dist/bin/console.js && ln -s /app/dist/bin/console.js /usr/local/bin/console

USER 1000

CMD ["pm2-runtime", "dist/index.js"]
