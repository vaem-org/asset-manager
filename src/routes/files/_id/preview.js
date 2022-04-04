/*
 * VAEM - Asset manager
 * Copyright (C) 2022  Wouter van de Molengraft
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import mongoose from 'mongoose';
import { Router } from 'express';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { api } from '#~/lib/express-helpers';
import { config } from '#~/config';
import { ffprobe, getAudio, getFramerate } from '#~/lib/ffmpeg';
import { spawn } from 'child_process';
import { getSignedUrl } from '#~/lib/security';
import { File } from '#~/model/File/index';

const { ObjectId } = mongoose.Types;

const router = new Router({
  mergeParams: true
});

const processes = {};

const events = new EventEmitter();

router.post('/', api(async ({ params: { id }, body: { audio } }) => {
  const item = ObjectId.isValid(id) && await File.findById(id);
  if (!item) {
    throw {
      status: 404
    }
  }

  const source = `${config.root}/var/files/${item.name}`;

  const { streams } = await ffprobe(
    source
  );

  const video = streams.find(({ codec_type }) => codec_type === 'video');

  const framerate = getFramerate(video);

  audio = audio ?? getAudio(streams);
  let audioMapping = [];
  if (audio.length > 0) {
    audioMapping = audio.length > 1
      ? ['-filter_complex', `${audio.map(index => `[0:${index}]`).join('')}amerge=inputs=2[aout]`, '-map', '[aout]']
      : ['-map', `0:${audio[0]}`];
  }

  // start a new ffmpeg process
  const uuid = uuidv4();
  const base = config.base + getSignedUrl(`/files/${id}/preview/${uuid}`, false, 3600*4);
  const child = spawn('ffmpeg', [
    '-re',
    '-i', source,
    '-loglevel', 'error',
    '-threads', 0,
    '-vf', 'scale=1280:trunc(ow/dar/2)*2',
    '-b:v', '3000k',
    '-maxrate', '3000k',
    '-bufsize', '3000k',
    '-map', `0:${video.index}`,
    ...audioMapping,
    '-vcodec', 'libx264',
    '-vprofile', 'high',
    '-level', '4.1',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-g', 2*framerate,
    '-x264opts', 'no-scenecut',
    '-f', 'hls',
    '-method', 'PUT',
    '-hls_list_size', 5,
    '-hls_time', 2,
    `${base}/stream.m3u8`
  ], {
    stdio: ['ignore', 'inherit', 'inherit']
  });

  child.on('close', code => {
    console.log(`ffmpeg proces closed with ${code}`);

    events.emit(uuid, 'process exited');
    // clean up after 30 seconds
    setTimeout(() => delete processes[uuid], 30000);
  });

  processes[uuid] = {
    child,
    buffers: {},
    files: [],
    setTimer() {
      if (this.timer) {
        clearTimeout(this.timer);
      }

      // automatically kill ffmpeg when no file has been accessed for 30 seconds
      this.timer = setTimeout(() => {
        this.child.kill();
      }, 30000);
    }
  };

  await new Promise((resolve, reject) => {
    events.once(uuid, err => {
      if (err) {
        reject({
          status: 500,
          message: 'ffmpeg failed'
        });
      } else {
        resolve();
      }
    });
  });

  processes[uuid].setTimer();

  return `${base}/stream.m3u8`;
}));

router.put('/:uuid/:filename', (req, res, next) => {
  const { uuid, filename } = req.params;
  const process = processes[uuid];
  if (!process) {
    return next();
  }

  const buffers = [];
  req.on('data', buf => buffers.push(buf));
  req.on('end', () => {
    process.buffers[filename] = Buffer.concat(buffers);
    res.end();

    process.files.push(filename);

    // remove old files from memory
    if (process.files.length > 5) {
      const drop = process.files.shift();
      delete process.buffers[drop];
    }

    if (filename.endsWith('.m3u8')) {
      events.emit(req.params.uuid);
    }
  });
});

router.get('/:uuid/:filename', (req, res, next) => {
  const process = processes[req.params.uuid];
  const buffer = process && process.buffers[req.params.filename];
  if (!buffer) {
    return next();
  }

  if (process.timer) {
    clearTimeout(process.timer);
  }

  process.setTimer();

  res.end(buffer);
});

router.delete('/:uuid', (req, res, next) => {
  if (!processes[req.params.uuid]) {
    return next();
  }

  processes[req.params.uuid].child.kill();
});

export default router;
