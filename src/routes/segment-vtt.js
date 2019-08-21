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
import { Readable } from 'stream';
import { Router } from 'express';
import { catchExceptions, verify } from '@/util/express-helpers';

const router = new Router();

router.use(verify, catchExceptions(async (req, res) => {
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
    data = Buffer.concat(buffers);
  }

  if (data) {
    const { stream } = await config.destinationFileSystem.write(output);
    const source = new Readable();
    source.push(data);
    source.push(null);
    source.pipe(stream);
  }

  res.end();
}));