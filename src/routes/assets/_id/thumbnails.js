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

import config from '@/config';
import fs from 'fs-extra';
import _ from 'lodash';
import { api, catchExceptions, verify } from '@/util/express-helpers';
import { Asset } from '@/model/asset';
import { getStreamInfo } from '@/util/stream';
import { createThumbnail } from '@/util/ffmpeg-thumbnail';
import sharp from 'sharp';
import { Router } from 'express';
import { createHmac } from 'crypto'

const router = new Router({
  mergeParams: true
});

const thumbnails = `${config.root}/var/thumbnails`;
fs.ensureDir(thumbnails).catch(e => console.error(e));

const getSignature = (assetId, time) => {
  return createHmac('sha256', process.env.SIGNATURE_SECRET)
    .update(`${assetId}/${time}`)
    .digest('hex');
};

router.get('/', verify, api(async req => {
  const asset = await Asset.findById(req.params.id);

  if (!asset) {
    throw {
      status: 404
    }
  }

  const duration = asset.videoParameters.duration;

  const getUrl = time =>
    `/assets/${req.params.id}/thumbnails/${getSignature(req.params.id, time)}/${time}.jpg`;

  return {
    default: getUrl(duration > 60 ? 10 : 0)
  }
}));

router.get('/:signature/:time.(jpg|png)', catchExceptions(async (req, res) => {
  if (getSignature(req.params.id, req.params.time) !== req.params.signature) {
    throw {
      status: 401
    }
  }

  const item = await Asset.findById(req.params.id);
  if (!item || item.state !== 'processed') {
    throw {
      status: 404
    }
  }

  res.setHeader('Expires', Date.now() + 24*3600*1000);

  const maxStream = _.maxBy(item.streams, stream => stream.bandwidth);

  if (!maxStream) {
    throw {
      status: 404
    }
  }

  const filename = `${thumbnails}/${req.params.id}-${req.params.time || 0}`;

  if (!await fs.exists(`${filename}.png`)) {
    // create png thumbnail with ffmpeg
    const info = await getStreamInfo(req.params.id);
    const url = `${config.base}${info.streamUrl.replace(`${item._id}.m3u8`, maxStream.filename)}`;
    await createThumbnail(url,
      `${filename}.png`,
      req.params.time || '0:00:00');
  }

  if (req.params[0] === 'jpg' && !await fs.exists(`${filename}.jpg`)) {
    await sharp(`${filename}.png`)
    .jpeg({
      quality: 60
    })
    .toFile(`${filename}.jpg`);
  }

  fs
  .createReadStream(`${filename}.${req.params[0]}`)
  .pipe(res);
}));

export default router;