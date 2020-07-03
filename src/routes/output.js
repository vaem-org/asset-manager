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

import path from 'path';
import { Router } from 'express';
import { fileSystemFromURL } from '@vaem-util/filesystem';
import { catchExceptions } from '~/lib/express-helpers';
import { verifySignature } from '@/lib/url-signer';
import { addToQueue, events as uploadEvents } from '@/lib/upload-queue';
import { purgeCache } from '@/lib/bunnycdn';

const ensured = new Set();

const router = new Router();

const fileSystem = config.destinationIsLocal ? config.destinationFileSystem : fileSystemFromURL(
  `file://${config.root}/var/tmp`
);

const ensureDir = async dirname => {
  if (ensured.has(dirname)) {
    return;
  }

  await fileSystem.ensureDir(dirname);
  ensured.add(dirname);
};

router.use( '/:timestamp/:signature/:assetId', catchExceptions(async (req, res, next) => {
  if (req.method !== 'PUT') {
    return next();
  }

  if (!verifySignature(req, `/${req.params.assetId}`)) {
    return res.status(403).end();
  }

  const output = `/${req.params.assetId}${decodeURIComponent(req.path)}`;

  await ensureDir(path.dirname(output));

  const handleFile = () => {
    if (!config.destinationIsLocal) {
      addToQueue(output);
    } else {
      uploadEvents.emit(output);
    }

    if (output.endsWith('.m3u8') && config.bunnyCDN) {
      purgeCache(output)
      .catch(() => {
        console.warn(`Unable to purge cache for ${output}`);
      })
    }
  };

  const stream = (await fileSystem.write(output)).stream;
  stream.on('done', () => {
    res.end();
    handleFile();
  });
  req
    .pipe(stream);
}));

export default router;
