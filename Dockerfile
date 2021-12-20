FROM vaem/node-ffmpeg:16.13.0-alpine

RUN apk add --no-cache xvfb-run libgdiplus mono ttf-liberation --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing

WORKDIR /app

RUN yarn global add pm2

ADD ./yarn.lock ./package.json /app/

ENV NODE_ENV=production

RUN yarn install --prod

ADD . /app

RUN mkdir /app/var && chown 1000 /app/var

RUN ln -s src/bin bin

USER 1000

CMD ["pm2-runtime", "src/index.js"]
