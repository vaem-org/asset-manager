FROM jrottenberg/ffmpeg:4.1-alpine
FROM node:10.15.2-alpine

COPY --from=0 / /

# add mono for running Subtitle Edit for subtitle conversion
RUN apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/v3.9/main musl\>1.1.20 && \
    apk add --no-cache mono libgdiplus ttf-liberation --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing && \
    apk add --no-cache xvfb git

COPY ./lib/xvfb-run /usr/bin

COPY . /app

WORKDIR /app

ENV NODE_ENV=production FONTCONFIG_PATH=/etc/fonts

RUN NODE_ENV=development yarn install  && yarn build && rm -rv src/ && \
    yarn install --production && \
    cd node_modules/@vaem/filesystem && NODE_ENV=development yarn

CMD ["yarn", "start"]
