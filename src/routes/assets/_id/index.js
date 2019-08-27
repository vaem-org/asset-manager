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

import config from '~config';
import { json, Router } from 'express';
import { api, catchExceptions, validObjectId, verify } from '@/util/express-helpers';
import { Asset } from '@/model/asset';
import fs from 'fs-extra';
import { getStreamInfo } from '@/util/stream';
import { createThumbnail } from '@/util/ffmpeg-thumbnail';
import sharp from 'sharp';

const router = new Router({
  mergeParams: true
});

router.use(verify);

router.get('/', validObjectId, api(async (req) => Asset.findById(req.params.id)));

router.post('/', validObjectId, json(), api(async req => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw {
      status: 404
    }
  }
  asset.set(req.body);
  await asset.save();
}));

router.delete('/', validObjectId, api(async req => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw {
      status: 404
    }
  }

  asset.removeFiles();
  await asset.save();
}));


const thumbnails = `${config.root}/var/thumbnails`;
fs.ensureDir(thumbnails).catch(e => console.error(e));

router.get([
  '/thumbnail.(jpg|png)',
  '/thumbnail/:time.(jpg|png)'
], catchExceptions(async (req, res, next) => {
  const item = await Asset.findById(req.params.id);
  if (!item) {
    console.log('Item not found');
    return next('route');
  }

  const filename = `${thumbnails}/${req.params.id}-${req.params.time || 0}`;

  if (!await fs.exists(`${filename}.png`)) {
    // create png thumbnail with ffmpeg
    const info = await getStreamInfo(req.params.id);
    const url = `${config.base}${info.streamUrl}`;
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