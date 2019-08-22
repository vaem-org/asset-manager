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
import fs from 'fs-extra';
import config from '../../../../config/config';
import * as fileType from '@/util/file-type';
import { convert as subtitleConvert } from '@/util/subtitles';
import { api, catchExceptions, verify } from '@/util/express-helpers';
import { Asset } from '@/model/asset';

const router = new Router({
  mergeParams: true
});

router.use(verify);

router.get('/', catchExceptions(async (req, res) => {
  const path = `${config.root}/var/subtitles/${req.params.id}.nl.vtt`;

  if (!await fs.exists(path)) {
    throw {
      status: 404
    }
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.nl.vtt"`);

  fs.createReadStream(path)
  .pipe(res);
}));

router.put('/:language', api(async (req) => {
  const ext = req.query.name.replace(/^.*\.([^.]+)$/, '$1');
  if (!fileType.isSubtitle(req.query.name)) {
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

  await subtitleConvert(`http://localhost:${config.port}/streams/-/-`,
    req.params.id,
    sourceFile,
    lang);
  await fs.unlink(sourceFile);
}));

router.get('/:language', catchExceptions(async (req, res, next) => {
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

export default router;