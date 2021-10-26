FROM vaem/node-ffmpeg:16.2.0-alpine as build

ADD package.json /app/package.json
ADD yarn.lock /app/yarn.lock
ADD .babelrc /app/.babelrc

WORKDIR /app

RUN NODE_ENV=development yarn install

COPY src /app/src

RUN yarn build

FROM vaem/node-ffmpeg:16.2.0-alpine

# add mono for running Subtitle Edit for subtitle conversion
RUN apk add --no-cache musl xvfb python3 ttf-liberation
RUN apk add --no-cache libgdiplus mono --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing

COPY ./lib/xvfb-run /usr/bin

WORKDIR /app

ENV NODE_ENV=production FONTCONFIG_PATH=/etc/fonts

ADD package.json /app/package.json
ADD yarn.lock /app/yarn.lock

RUN yarn install -e production

RUN yarn cache clean && \
    ln -s dist/bin bin

# copy all non-build files
COPY config /app/config
COPY CHECKS /app/CHECKS
COPY lib /app/lib

# copy build files
COPY --from=build /app/dist /app/dist

CMD ["yarn", "start"]
