/*
 * VAEM - Asset manager
 * Copyright (C) 2024  Wouter van de Molengraft
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
import dayjs from 'dayjs';

import { getDocument, wrapper } from '#~/lib/express-helpers';
import { File } from '#~/model/File/index';
import { convert } from '#~/lib/subtitles';

const router = new Router({
  mergeParams: true
});

router.get('', wrapper(async ({ params: { id } }, res) => {
  res.setHeader('expires', dayjs().add(7, 'days').toISOString());
  res.setHeader('cache-control', 'private,max-age=604800');

  const file = await getDocument(File, id);
  res.send(await convert(file.path));
}))

export default router;
