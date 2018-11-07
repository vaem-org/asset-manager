/*
 * VAEM - Asset manager
 * Copyright (C) 2018  Wouter van de Molengraft
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

import express from 'express';
import _ from 'lodash';
import {Distributor} from '../model/distributor';
import {api} from '../util/express-helpers';

export default app => {
  const router = new express.Router();
  const json = express.json();

  app.use('/distributors', router);

  router.get('/', api(async () => {
    return _.sortBy(await Distributor.find(), a => a.name.toLowerCase());
  }));

  router.post('/', json, api(async req => {
    const distributor = new Distributor(req.body);
    return await distributor.save();
  }));

  router.delete('/:id', api(async req => {
    const item = await Distributor.findById(req.params.id);
    await item.remove();
  }));

  router.post('/:id', json, api(async req => {
    await Distributor.findByIdAndUpdate(
      req.params.id,
      {
        $set: req.body
      });
  }));
}