FROM vaem/node-ffmpeg:20.11.1-alpine

WORKDIR /app

RUN corepack enable && npm i -g pm2

ADD ./pnpm-lock.yaml ./pnpm-workspace.yaml ./package.json /app/

ENV NODE_ENV=production

RUN pnpm install

ADD . /app

RUN mkdir /app/var && chown 1000 /app/var

RUN ln -s src/bin bin

USER 1000

CMD ["pm2-runtime", "src/index.js"]
