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
import moment from 'moment';
import {renderIndex} from '../util/render-index';
import {api} from '../util/express-helpers';

export default app => {
  const simpleEncryptor = require('simple-encryptor')(app.config.encryptor);
  const router = new express.Router({});
  app.use('/auth', router);

  router.get('/', renderIndex('player'));

  router.post('/', express.json(), api(async req => {
    const data = simpleEncryptor.decrypt(req.body.auth) || {};

    console.log(data);

    if (Object.keys(data).length === 0) {
      throw 'Invalid link';
    }

    if (moment() > moment(data[0])) {
      throw 'Sorry, this link has expired.';
    }

    if (req.body.password !== data[1]) {
      throw 'Incorrect login';
    }

    req.session.authenticated = data;
    req.session.sharedOnly = true;
    return `/shared/player/${data[2]}/`;
  }));
}