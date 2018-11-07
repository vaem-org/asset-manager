FROM vaem/node-ffmpeg:10.11.0

# add mono for running Subtitle Edit for subtitle conversion
RUN apt-get update && \
	apt-get -y install mono-devel xvfb tzdata libgtk2.0-0 && \
	rm -rf /var/lib/apt/lists/*

COPY . /app

WORKDIR /app

RUN yarn install && yarn build

CMD ["yarn", "start"]
