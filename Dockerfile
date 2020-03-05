FROM jrottenberg/ffmpeg:4.2-alpine AS ffmpeg
FROM node:12.12.0-alpine AS build

COPY package.json /app/package.json
COPY yarn.lock /app/yarn.lock

WORKDIR /app

RUN NODE_ENV=development yarn install

COPY . /app

RUN yarn build

FROM node:12.12.0-alpine

# add mono for running Subtitle Edit for subtitle conversion
RUN apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/v3.9/main musl\>1.1.20 && \
    apk add --no-cache mono libgdiplus ttf-liberation --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing && \
    apk add --no-cache xvfb

COPY --from=ffmpeg / /

COPY ./lib/xvfb-run /usr/bin

COPY . /app
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

WORKDIR /app

ENV NODE_ENV=production FONTCONFIG_PATH=/etc/fonts

RUN rm -rv src/ && \
    yarn install --production && \
    yarn cache clean && \
    ln -s dist/bin bin

CMD ["yarn", "start"]
