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

import config from '@/config';
import { Router } from 'express';
import { catchExceptions, validObjectId, verify } from '@/util/express-helpers';
import { File } from '@/model/file';

const router = new Router({
  mergeParams: true
});

router.use(verify);

router.get('/', validObjectId, catchExceptions(async (req, res) => {
  const item = await File.findById(req.params.id);
  res.setHeader('content-disposition', `attachment; filename="${item.name}"`);
  const redirect = await config.sourceFileSystem.getSignedUrl(item.name);
  if (redirect) {
    res.redirect(redirect);
  } else {
    const input = await config.sourceFileSystem.read(item.name);
    input.stream.pipe(res);
  }
}));

export default router;