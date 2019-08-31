FROM jrottenberg/ffmpeg:4.1-alpine
FROM node:10.15.2-alpine

# add mono for running Subtitle Edit for subtitle conversion
RUN apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/v3.9/main musl\>1.1.20 && \
    apk add --no-cache mono --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing && \
    apk add --no-cache xvfb git

COPY --from=0 /usr/local /usr/local

COPY ./lib/xvfb-run /usr/bin

COPY . /app

WORKDIR /app

ENV NODE_ENV=production

RUN NODE_ENV=development yarn install  && yarn build && rm -rv src/ && \
    yarn install --production && \
    cd node_modules/@vaem/filesystem && NODE_ENV=development yarn

CMD ["yarn", "start"]
