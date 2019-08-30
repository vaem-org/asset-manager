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
import jwt from 'jsonwebtoken';
import { Router, json } from 'express';
import { api } from '@/util/express-helpers';
import { getTokens } from '@/util/authentication';

const router = new Router();

router.post('/', json(), api(async req => {
  if (config.auth.provider !== 'local') {
    throw {
      status: 404
    }
  }

  if (req.body.password !== config.auth.password) {
    throw {
      status: 401
    }
  }

  return getTokens({
    provider: 'local',
    display: 'Administrator',
    refreshParameters: {
      password: req.body.password
    }
  });
}));

router.post('/refresh', json(), api(async req => {
  const decoded = jwt.verify(req.body.token, config.jwtSecret);
  if (decoded.password !== config.auth.password) {
    throw {
      status: 401
    }
  }

  const { token } = getTokens({
    provider: 'local',
    display: 'Administrator'
  });

  return { token };
}));

export default router;