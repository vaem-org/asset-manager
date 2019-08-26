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

import { json, Router } from 'express';
import { api, verify } from '@/util/express-helpers';
import { File } from '@/model/file';

const router = new Router({
  mergeParams: true
});

router.use(verify);

router.post('/audio-streams', json(), api(async req => {
  const item = await File.findById(req.params.id);
  item.audioStreams = req.body;
  await item.save();
}));


export default router;