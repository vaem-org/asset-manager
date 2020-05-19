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

import * as fse from 'fs-extra';
import { dirname } from 'path';
import { Router } from 'express';
import { catchExceptions } from '@/lib/express-helpers';
import { verifySignature } from '@/lib/url-signer';
import config from '@/config';
import { addToQueue } from '@/lib/upload-queue';

const router = new Router();

router.use('/:timestamp/:signature', catchExceptions(async (req, res, next) => {
  if (!['PUT', 'POST'].includes(req.method)) {
    return next();
  }

  if (!verifySignature(req, 'segment-vtt')) {
    throw {
      status: 403
    }
  }
  const path = req.path.split('/');

  let output = '/' + path.slice(2).join('/');

  const buffers = [];

  await (new Promise((accept, reject) => {
    req
    .on('data', data => buffers.push(data))
    .on('error', reject)
    .on('end', accept)
    ;
  }));

  let data = null;

  if (req.path.search(/\.vtt$/) !== -1) {
    const pkt_pts = path[1];

    data = Buffer.concat(buffers).toString().replace(
      /WEBVTT/g, 'WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:' + pkt_pts + ',LOCAL:00:00:00.000');
  } else if (req.path.search(/\._vtt\.m3u8$/) !== -1) {
    output = output.replace(/\._vtt\.m3u8$/, '.m3u8');
    data = Buffer.concat(buffers);
  }

  if (data) {
    // write to temporary storage
    const filename = `${config.root}/var/tmp${output}`;
    try {
      await fse.writeFile(filename, data);
    }
    catch(e) {
      await fse.ensureDir(dirname(filename));
      await fse.writeFile(filename, data);
    }

    addToQueue(output);
  }

  res.end();
}));

export default router;
