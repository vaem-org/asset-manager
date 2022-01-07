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
import { api, getDocument } from '#~/lib/express-helpers';
import { File } from '#~/model/File/index';
import { ffprobe } from '#~/lib/ffmpeg';

const router = new Router({
  mergeParams: true
});

router.get('/', api(async ({ params: { id } }) => {
  const file = await getDocument(File, id);
  return ffprobe(file.path);
}));

export default router;
