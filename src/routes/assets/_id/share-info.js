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

import { Router, json } from 'express';
import { api } from '@/lib/express-helpers';
import { verifySignature } from '@/lib/url-signer';
import { getStreamInfo } from '@/lib/stream';

const router = new Router({
  mergeParams: true
});

router.post('/:timestamp/:signature', json(), api(async req => {
  if (!verifySignature(req, req.params.id + req.body.password)) {
    throw {
      status: 403,
      message: req.params.timestamp < Date.now() ? 'Link has expired' : 'Incorrect password'
    }
  }

  return await getStreamInfo(req.params.id, req.ip);
}));

export default router;
