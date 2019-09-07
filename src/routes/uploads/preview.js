/*
 * VAEM - Asset manager
 * Copyright (C) 2019  Wouter van de Molengraft
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

import { Router } from 'express';
import { spawn } from 'child_process';
import genuuid from 'uuid/v4';
import _ from 'lodash';
import { EventEmitter } from 'events'
import { api } from '@/util/express-helpers';
import { getSeekable, getSource, getVideoParameters } from '@/util/source';
import config from '@/config';
import { File } from '@/model/file';

const router = new Router();

const processes = {};

const events = new EventEmitter();

router.post('/:id/start', api(async req => {
  const item = await File.findById(req.params.id);
  if (!item) {
    throw {
      status: 404
    }
  }

  const source = getSource(item.name);

  const videoParameters = await getVideoParameters(
    source
  );

  let framerate = 25;

  const rFrameRate = _.get(_.find(_.get(videoParameters, 'ffprobe.streams'),
    { codec_type: 'video' }), 'r_frame_rate', '').split('/').map(i => parseInt(i));

  if (rFrameRate.length === 2) {
    framerate = rFrameRate[0] / rFrameRate[1];
  }

  // start a new ffmpeg process
  const uuid = genuuid();
  const child = spawn('ffmpeg', [
    '-seekable', getSeekable(source),
    '-re',
    '-i', source,
    '-loglevel', 'error',
    '-threads', 0,
    '-vf', 'scale=1280:trunc(ow/a/2)*2',
    '-b:v', '3000k',
    '-maxrate', '3000k',
    '-bufsize', '3000k',
    '-map', '0:0',
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
    `http://localhost:${config.port}/uploads/preview/${uuid}/stream.m3u8`
  ], {
    stdio: ['ignore', 'inherit', 'inherit']
  });

  child.on('close', code => {
    console.log(`ffmpeg proces closed with ${code}`);
    delete processes[uuid];
  });

  processes[uuid] = {
    child,
    buffers: {}
  };

  await new Promise(accept => {
    events.once(uuid, accept);
  });

  return `${config.base}/uploads/preview/${uuid}/stream.m3u8`;
}));

router.put('/:uuid/:filename', (req, res, next) => {
  const process = processes[req.params.uuid];
  if (!process) {
    return next();
  }

  const buffers = [];
  req.on('data', buf => buffers.push(buf));
  req.on('end', () => {
    process.buffers[req.params.filename] = Buffer.concat(buffers);
    res.end();
    if (req.params.filename.endsWith('.m3u8')) {
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

  res.end(buffer);
});

router.delete('/:uuid', (req, res, next) => {
  if (!processes[req.params.uuid]) {
    return next();
  }

  processes[req.params.uuid].child.kill();
});

export default router;
