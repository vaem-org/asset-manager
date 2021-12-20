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

import { Router, urlencoded } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { api } from '#~/lib/express-helpers';
import { config } from '#~/config';

const router = new Router();

router.post('/', urlencoded(), api(async ({ body: { code, redirect_uri } }) => {
  const client = new OAuth2Client({
    clientId: config.auth?.clientId,
    clientSecret: config.auth?.clientSecret,
    redirectUri: redirect_uri
  });

  let payload;

  try {
    const { tokens: { id_token } } = await client.getToken(code);
    payload = (await client.verifyIdToken({
      idToken: id_token
    })).getPayload();
  }
  catch (e) {
    throw {
      status: 401
    }
  }

  if (payload.hd !== config.auth.hd) {
    throw {
      status: 401
    }
  }

  return {
    access_token: jwt.sign({
      email: payload.email,
      sub: payload.sub
    }, config.secret, {
      expiresIn: '24h'
    })
  };
}));

export default router;
