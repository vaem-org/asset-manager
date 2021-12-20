/*
 * VAEM - Asset manager
 * Copyright (C) 2021  Wouter van de Molengraft
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
import { getDocument, wrapper } from '#~/lib/express-helpers';
import { spawn } from 'child_process';
import { Asset } from '#~/model/Asset/index';

const router = new Router({
  mergeParams: true
});

router.get('/', wrapper(async (req, res) => {
  const { params: { id }} = req;
  const asset = await getDocument(Asset, id);

  const child = spawn('ffmpeg', [
    '-v', 'error',
    '-i', asset.getUrl(asset.highestVariant),
    '-c', 'copy',
    '-f', 'mp4',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', 'faststart+frag_keyframe+empty_moov',
    '-'
  ], {
    stdio: ['ignore', 'pipe', 'inherit']
  });

  res.setHeader('content-disposition', `attachment; filename="${asset.title}.mp4"`);

  child.stdout.pipe(res);

  child.on('close', () => {
    res.end();
  });

  req.on('close', () => {
    child.kill();
  });
}));

export default router;
