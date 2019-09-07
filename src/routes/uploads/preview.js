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
import { api } from '@/util/express-helpers';
import genuuid from 'uuid/v4';
import { getSource } from '@/util/source';

const router = new Router();

const processes = {};

router.post('/:id/start', api(async req => {
  const item = await File.findById(req.params.id);
  if (!item) {
    throw {
      status: 404
    }
  }

  const source = getSource(item.name);

  // start a new ffmpeg process
  const uuid = genuuid();
  const child = spawn('echo', [
    '-seekable', 0,
    '-i', source,
    '-loglevel', 'error',
    '-threads', 0,
    '-vf', 'scale=1280:trunc(ow/a/2)*2',
    '-b:v', '3000k',
    '-maxrate', '3000k',
    '-bufsize', '3000k',
    '-f', 'hls',
    '-map', '0:0',
    '-vcodec', 'libx264',
    '-vprofile', 'high',
    '-level', '4.1',
    '-preset', 'fastest',
    '-pix_fmt', 'yuv420p',
    '-g', 50, // TODO: use framerate * 2
    '-x264opts', 'no-scenecut',
    '-hls_list_size', 0,
    '-hls_playlist_type', 'event',
    '-hls_time', 2,
    '/app/tmp/segments/5d735c65f81688001c043fce.5800k.m3u8/5d735c65f81688001c043fce.5800k.m3u8'
  ]);

  child.on('close', code => {
    console.log(`ffmpeg proces closed with ${code}`);
  });

  processes[uuid] = {
    child
  };
  return uuid;
}));

router.put('/:uuid/ouput/:filename', (req, res) => {
  console.log(req.originalUrl);
  res.end();
});

export default router;
