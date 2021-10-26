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

import { api, catchExceptions, verify } from '@/lib/express-helpers';
import { spawn } from 'child_process';
import { Router } from 'express';
import { computeSignature, verifySignature } from '@/lib/url-signer';
import moment from 'moment';
import { Asset } from '@/model/asset';
import _ from 'lodash';
import slug from 'slug';
import config from '@/config';

const router = new Router({
  mergeParams: true
});

router.get('/', verify, api(async req => {
  const timestamp = Date.now() + 120*1000;
  const signature = computeSignature(req.params.id, timestamp);
  return `/assets/${req.params.id}/download/${timestamp}/${signature}/stream.mp4`;
}));

router.get('/:timestamp/:signature/stream.:format', catchExceptions(async (req, res) => {
  const { id, format } = req.params;
  if (!verifySignature(req, id)) {
    throw {
      status: 401
    }
  }
  if (!['ts', 'mp4'].includes(format)) {
    throw {
      status: 404
    }
  }

  const asset = await Asset.findById(id);
  const videoStream = _.maxBy(asset.streams, 'bandwidth');
  const audioStream = asset.audioStreams.find(item => item.bitrate === 'aac-128k');

  const timestamp = moment().add(8, 'hours').valueOf();
  const signature = computeSignature(id, timestamp);

  const host = req.headers['x-forwarded-host'] ? req.hostname : req.get('host');
  const base = config.base || `${req.protocol}://${host}`;
  const videoUrl = `${base}/streams/${timestamp}/${signature}/${videoStream.filename}`;
  const audioUrl = audioStream && `${base}/streams/${timestamp}/${signature}/${audioStream.filename}`;

  const child = spawn('ffmpeg', [
    '-v', 'error',
    '-i', videoUrl,
    ...(audioUrl ? [
      '-i', audioUrl,
      '-map', '0:0',
      '-map', '1:0',
    ] : []),
    '-c', 'copy',
    '-f', format === 'ts' ? 'mpegts' : 'mp4',
    ...format==='mp4' ? [
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', 'faststart+frag_keyframe+empty_moov',
      ] : [],
    '-'
  ], {
    stdio: ['ignore', 'pipe', 'inherit']
  });

  res.setHeader('content-disposition', `attachment; filename="${slug(asset.title)}.${format}"`);

  child.stdout.pipe(res);

  child.on('close', () => {
    res.end();
  });

  req.on('close', () => {
    child.kill();
  });
}));

export default router;
