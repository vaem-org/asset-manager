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
import { Asset } from '#~/model/Asset/index';
import { config } from '#~/config';

const router = new Router({
  mergeParams: true
});

router.use(wrapper(async (req, res, next) => {
  req.doc = await getDocument(Asset, req.params.id);
  next();
}));

router.get('/file.key', wrapper(async ({ doc }, res) => {
  return res.send(Buffer.from(doc.hls_enc_key, 'hex'));
}));

router.get('/', wrapper(async ({ doc, originalUrl }, res) => {
  return res.send([
    'file.key',
    `${config.base}${originalUrl}/file.key`,
    doc.hls_enc_iv
  ].join('\n'));
}));

export default router;
