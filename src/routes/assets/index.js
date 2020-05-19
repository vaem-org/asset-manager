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

import _ from 'lodash';
import { Router, json } from 'express';

import { api, verify } from '~/lib/express-helpers';

import { Asset } from '~/model/asset';
import { listDocuments } from '~/lib/list-documents';

const router = new Router({});

router.use(verify);

router.get('/', api(async req => {
  const where = {
    deleted: { $ne: true }
  };

  if (req.query.q && req.query.q.match(/^[0-9a-fA-F]{24}$/)) {
    where._id = req.query.q;
  } else if (req.query.q) {
    where.title = {
      $regex: req.query.q,
      $options: 'i'
    };
  }

  _.assign(where, _.pickBy(req.query.filters || {}));

  return listDocuments(req, Asset, where);
}));

router.get('/labels', api(async () => Asset.getLabels()));

router.post('/set-labels', api(async req => {
  const assets = await Asset.find({ _id: { $in: req.body.assets } });

  for (let item of assets) {
    item.labels = req.body.operation === 'add' ?
      _.union(item.labels, req.body.labels) :
      _.difference(item.labels, req.body.labels);

    await item.save();
  }
}));

router.post('/remove', json(), api(async req => {
  const items = await Asset.find({ _id: { $in: req.body } });
  for (let item of items) {
    item.removeFiles();
    await item.save();
  }

  return true;
}));

export default router;
