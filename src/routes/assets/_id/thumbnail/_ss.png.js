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

import { Router } from 'express';
import { createReadStream } from 'fs';
import { access, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { spawn } from 'child_process';
import { getDocument, wrapper } from '#~/lib/express-helpers';
import { config } from '#~/config';
import { Asset } from '#~/model/Asset/index';

const router = new Router({
  mergeParams: true
});

router.get('/', wrapper(async ({ params: { ss, id } }, res) => {
  const asset = await getDocument(Asset, id);
  if (!['verified', 'processed'].includes(asset.state)) {
    throw {
      status: 404
    }
  }

  const filename = `${config.root}/var/thumbnails/${id}.${ss}.png`;

  try {
    await access(filename)
  }
  catch (e) {
    await mkdir(dirname(filename), {
      recursive: true
    });

    // create thumbnail
    await new Promise((resolve, reject) => {
      spawn('ffmpeg', [
        '-v', 'error',
        '-ss', ss,
        '-i', asset.getUrl(asset.highestVariant),
        '-frames:v', 1,
        '-c:v', 'png',
        filename
      ], {
        stdio: 'inherit'
      }).on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject('ffmpeg failed')
        }
      });
    });
  }

  res.setHeader('content-type', 'image/png');
  createReadStream(filename).pipe(res);
}))

export default router;
