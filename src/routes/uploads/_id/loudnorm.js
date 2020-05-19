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
import { api, verify } from '@/lib/express-helpers';
import * as sourceUtil from '@/lib/source';
import { getNormalizeParameters } from '@/lib/source';
import { File } from '@/model/file';

const router = new Router({
  mergeParams: true
});

router.use(verify);

router.get('/', api(async req => {
  const item = await File.findById(req.params.id);
  const source = sourceUtil.getSource(item.name);

  const { stereo } = item.audioStreams || await sourceUtil.guessChannelLayout(source);

  const filter = await getNormalizeParameters({
    source,
    map: stereo.length === 1 ? `0:${stereo[0]}` : null,
    filter_complex: stereo.length > 1 ? `[0:${stereo[0]}][0:${stereo[1]}]amerge=inputs=2[aout]` : null
  });

  item.loadNorm = filter;
  await item.save();
  return filter;
}));

export default router
