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
import { OAuth2Client } from 'google-auth-library';
import { api, catchExceptions } from '@/lib/express-helpers';
import { getTokens } from '@/lib/authentication';

const router = new Router();

const cfg = config.auth || {};

router.use((req, res, next) => {
  req.client = new OAuth2Client({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: config.base ? `${config.base}/login/google/callback` : `${req.protocol}://${req.get('host')}/login/google/callback`
  });
  next();
});

router.get('/', catchExceptions(async (req, res) => {
  res.redirect(req.client.generateAuthUrl({
    scope: ['email', 'profile'],
    hd: cfg.hd,
    access_type: 'offline',
    prompt: 'consent'
  }));
}));

/**
 * Convert tokens
 * @param {OAuth2Client} client
 * @param tokens
 * @returns {Promise<{token: *, refreshToken: *}>}
 */
async function getClientTokens(client, tokens) {
  client.setCredentials(tokens);
  // verify domain
  const user = (await client.request({url: 'https://www.googleapis.com/plus/v1/people/me'})).data;
  if (!user || user.domain !== cfg.hd) {
    throw {
      status: 401,
      message: 'Unauthorized'
    }
  }

  // construct jwt token
  return getTokens({
    provider: 'google',
    display: user.displayName,
    refreshParameters: {
      token: tokens.refresh_token
    }
  });
}

router.get('/callback', catchExceptions(async (req, res) => {
  const response = await req.client.getToken(req.query.code);

  // construct jwt token
  const tokens = await getClientTokens(req.client, response.tokens);

  return res.end(`<script>window.opener.postMessage(${JSON.stringify(tokens)}, '*')</script>`);
}));

router.post('/refresh', json(), api(async req => {
  const decoded = jwt.verify(req.body.token, config.jwtSecret);
  const response = await req.client.refreshTokenNoCache(decoded.token);
  const { token } = await getClientTokens(req.client, response.tokens);
  return {
    token
  };
}));

export default router;
