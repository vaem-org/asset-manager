/*
 * VAEM - Asset manager
 * Copyright (C) 2022  Wouter van de Molengraft
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

import { Router, text } from 'express';
import { dirname } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { wrapper } from '#~/lib/express-helpers';
import { config } from '#~/config';

const router = new Router({
  mergeParams: true
});

router.use(text({
  type: () => true
}), wrapper(async ({ body, method, path, params: { id } }, res) => {
  if (!['PUT', 'POST'].includes(method)) {
    return res.status(400).end();
  }

  let output = '/' + path.split('/').slice(2).join('/');
  let data = null;

  if (path.endsWith('.vtt')) {
    const pkt_pts = path.split('/')[1];

    data = body.replace(
      /WEBVTT/g, 'WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:' + pkt_pts + ',LOCAL:00:00:00.000');
  } else if (path.endsWith('_vtt.m3u8')) {
    output = output.replace(/\._vtt\.m3u8$/, '.m3u8');
    data = body
  }

  if (data) {
    const filename = `${config.root}/var/output/${id}${output}`;
    await mkdir(dirname(filename), {
      recursive: true
    });
    await writeFile(filename, data)
  }

  res.end();
}))

export default router;
