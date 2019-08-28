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
import { catchExceptions } from '~/util/express-helpers';
import { verifySignature } from '@/util/url-signer';

const ensured = new Set();

const router = new Router();

const fileSystem = config.destinationFileSystem;

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

  if (output.endsWith('.m3u8')) {
    const buffers = [];
    req.on('data',  buffer => buffers.push(buffer));
    req.on('error', error => {
      console.error(error);
      res.end();
    });
    req.on('end', async () => {
      res.end();
      const content = Buffer.concat(buffers).toString();
      if (content.indexOf('#EXT-X-ENDLIST') !== -1) {
        await fileSystem.writeFile(output, content);
      }
    });
  } else {
    req
    .on('end', () => res.end())
    .pipe((await fileSystem.write(output)).stream);
  }
}));

export default router;