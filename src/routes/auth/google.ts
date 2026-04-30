/*
 * VAEM - Asset manager
 * Copyright (C) 2026  Wouter van de Molengraft
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

import type { Router } from 'express'
import { urlencoded } from 'express'
import type { TokenPayload } from 'google-auth-library'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import { api } from '#~/lib/express-helpers.js'
import { config } from '#~/config.js'
import { HttpError } from '#~/lib/HttpError.js'

export default (router: Router) => {
  if (config.auth?.provider !== 'google') {
    return
  }

  const authConfig = config.auth

  router.get('/google', api(async (req) => {
    if (!req.query.redirect_uri) {
      throw new HttpError(400, 'No redirect uri')
    }

    return new OAuth2Client({
      clientId: config.auth?.clientId,
      clientSecret: config.auth?.clientSecret,
    }).generateAuthUrl({
      redirect_uri: req.query.redirect_uri.toString(),
      scope: ['openid', 'https://www.googleapis.com/auth/userinfo.email'],
      hd: authConfig.hd,
    })
  }))

  router.post('/google', urlencoded({
    extended: false,
  }), api(async ({ body: { code, redirect_uri } }) => {
    const client = new OAuth2Client({
      clientId: config.auth?.clientId,
      clientSecret: config.auth?.clientSecret,
      redirectUri: redirect_uri,
    })

    let payload: TokenPayload | undefined

    const { tokens: { id_token } } = await client.getToken(code)

    if (!id_token) {
      throw new HttpError(401)
    }

    try {
      payload = (await client.verifyIdToken({
        idToken: id_token,
      })).getPayload()
    }
    catch (_e) {
      throw new HttpError(401)
    }

    if (payload?.hd !== authConfig.hd) {
      throw new HttpError(401)
    }

    return {
      access_token: jwt.sign({
        email: payload.email,
        sub: payload.sub,
      }, config.secret, {
        expiresIn: '24h',
      }),
    }
  }))
}
