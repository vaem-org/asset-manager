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
import { getDocument, wrapper } from '#~/lib/express-helpers';
import { File } from '#~/model/File/index';
import send from 'send';

const router = new Router({
  mergeParams: true
});

router.get('/', wrapper(async (req, res) => {
  const { params: { id } } = req;
  const file = await getDocument(File, id);
  res.setHeader('content-disposition', `attachment; filename="${file.name}"`)
  send(req, file.path).pipe(res);
}));

export default router;
