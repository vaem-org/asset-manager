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
import { Router } from 'express';
import fs from 'fs-extra';
import * as fileType from '@/lib/file-type';
import { convert as subtitleConvert } from '@/lib/subtitles';
import { api, catchExceptions, verify } from '@/lib/express-helpers';
import { Asset } from '@/model/asset';
import { getSignedUrl, verifySignature } from '@/lib/url-signer';

const router = new Router({
  mergeParams: true
});

router.get('/:timestamp/:signature/:language', catchExceptions(async (req, res, next) => {
  if (!verifySignature(req, `${req.params.id}/${req.params.language}`)) {
    throw {
      status: 401
    }
  }

  const asset = await Asset.findById(req.params.id);

  if (!asset || !asset.subtitles) {
    return next();
  }

  const path = `${config.root}/var/subtitles/${req.params.id}.${req.params.language}.vtt`;
  if (!await fs.exists(path)) {
    return next();
  }

  res.setHeader('content-disposition',
    `attachment; filename="${req.params.id}.${req.params.language}.vtt"`);
  fs.createReadStream(path)
  .pipe(res);
}));

router.use(verify);

router.get('/:language', api(async req => {
  return getSignedUrl(`${req.params.id}/${req.params.language}`, 60, false) + '/' + req.params.language;
}));

router.delete('/:language', api(async (req) => {
  const item = await Asset.findById(req.params.id);
  if (!item || !item.subtitles[req.params.language]) {
    throw {
      status: 404
    }
  }

  delete item.subtitles[req.params.language];
  item.markModified('subtitles');
  await item.save();

  // delete files
  const files = await config.destinationFileSystem.list(`${item._id}/subtitles`);
  for(let file of files) {
    if (file.name.startsWith(req.params.language)) {
      await config.destinationFileSystem.delete(`${item._id}/subtitles/${file.name}`);
    }
  }
}));

router.put('/:language/:name', api(async (req) => {
  const ext = req.params.name && req.params.name.replace(/^.*\.([^.]+)$/, '$1');
  if (!req.params.name || !fileType.isSubtitle(req.params.name)) {
    throw {
      status: 500,
      message: 'Invalid filename'
    }
  }

  fs.ensureDirSync(`${config.root}/var/tmp`);
  const lang = req.params.language;
  const sourceFile = `${config.root}/var/tmp/${req.params.id}.${lang}.${ext}`;

  const output = fs.createWriteStream(sourceFile);
  await (new Promise((accept, reject) => {
    req.on('end', accept);
    req.on('error', reject);
    req.pipe(output);
  }));

  await subtitleConvert(
    req.params.id,
    sourceFile,
    lang);
  await fs.unlink(sourceFile);
}));

export default router;
