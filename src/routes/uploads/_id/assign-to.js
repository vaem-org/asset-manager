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
import { Router } from 'express';
import { basename } from 'path';
import { createWriteStream, unlink } from 'fs';
import { api, verify } from '@/util/express-helpers';
import { convert } from '@/util/subtitles';
import { File } from '@/model/file';

const router = new Router({
  mergeParams: true
});

router.use(verify);

router.post('/:language/:assetId', api(async req => {
  const item = await File.findById(req.params.id);

  // copy file to temporary location
  const { stream } = await config.sourceFileSystem.read(item.name);

  const tmpFile = `${config.root}/var/tmp/${basename(item.name)}`;
  stream.pipe(
    createWriteStream(tmpFile)
  );

  await (new Promise((accept, reject) => {
    stream.on('end', accept);
    stream.on('error', reject);
  }));

  await convert(
    req.params.assetId,
    tmpFile,
    req.params.language);

  // unlink temporary file
  unlink(tmpFile, () => {
    // ignore
  });
}));

export default router;