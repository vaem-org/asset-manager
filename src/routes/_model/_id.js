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
import { save } from '#~/lib/crud';
import { wrapper, api, getDocument } from '#~/lib/express-helpers';

const router = new Router({
  mergeParams: true
});

router.use(wrapper(async (req, res, next) => {
  if (req.params.id === 'new' && req.method === 'GET') {
    return next();
  }

  req.doc = await getDocument(req.model, req.params.id);
  next()
}));

router.get('/', api(async ({ doc, params: { id }, model }) => {
  if (id === 'new') {
    doc = new model()
  }

  return doc.toJSON();
}));

router.put('/', api(async ({ body, doc }) => {
  doc.set(body);
  await save(doc);
  return doc.toJSON();
}))

router.delete('/', api(async ({ doc }) => {
  return doc.delete();
}));

export default router;
