/*
 * VAEM - Asset manager
 * Copyright (C) 2021  Wouter van de Molengraft
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
import { api } from '#~/lib/express-helpers';
import { getFilter, save } from '#~/lib/crud';

import { Asset } from '#~/model/Asset/index';
import { Job } from '#~/model/Job/index';
import { File } from '#~/model/File/index';

const router = new Router({
  mergeParams: true
});

const models = {
  'assets': Asset,
  'jobs': Job,
  'files': File
}

router.use((req, res, next) => {
  if (!models[req.params.model]) {
    return res.status(404).end();
  }

  req.model = models[req.params.model];

  next();
});

router.get('/', api(async ({ model, query }, res) => {
  let filter = getFilter({
    model,
    filter: query.filter
  });

  if (query.q) {
    const searchPaths = model.schema.searchPaths || Object.values(model.schema.paths)
      .filter(({ instance }) => instance === 'String')
      .map(({ path }) => path)
    ;

    const regex = model.schema.searchExact ? query.q.trim() : new RegExp(query.q.trim(), 'i');

    filter = {
      ...filter,
      $or: searchPaths
        .map((path) => ({ [path]: regex }))
    }
  }

  const page = Math.max(1, parseInt(query.page || '1', 10));
  const per_page = Math.max(1, parseInt(query.per_page || '20', 10));
  const sort = query.sort || '-createdAt';
  const total = await model.countDocuments(filter);
  const populate = (query.populate || '').split(',').filter(v => v)
  res.setHeader('x-total', total);
  res.setHeader('Access-Control-Expose-Headers', 'x-total')

  return (await model
    .find(filter)
    .sort(sort)
    .populate(populate)
    .skip((page-1)*per_page)
    .limit(per_page)
  ).map(doc => doc.toJSON())
}));

router.post('/', api(async ({ body, model }) => {
  const doc = new model(body);
  await save(doc);

  return doc.toJSON();
}));

export default router;
