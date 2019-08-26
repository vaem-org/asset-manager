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

import { Types } from 'mongoose';
import { json, Router } from 'express';
import { api, validObjectId, verify } from '@/util/express-helpers';
import { Asset } from '@/model/asset';

const router = new Router({
  mergeParams: true
});

router.use(verify);

router.get('/', validObjectId, api(async (req) => Asset.findById(req.params.id)));

router.post('/', validObjectId, json(), api(async req => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw {
      status: 404
    }
  }
  asset.set(req.body);
  await asset.save();
}));

router.delete('/', validObjectId, api(async req => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw {
      status: 404
    }
  }

  asset.removeFiles();
  await asset.save();
}));

export default router;