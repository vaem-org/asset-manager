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

import { createHmac } from 'crypto'
import { config } from '#~/config.js'
import { wrapper } from '#~/lib/express-helpers.js'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import type { Token } from '#~/types/Token.js'

/**
 * Get a signature
 * @param url
 * @param timestamp
 * @param n the number of path components to match (0 for all)
 */
function getSignature(url: string, timestamp: number, n: number): string {
  const data = url.split('/').slice(0, n === 0 ? undefined : (n + 1)).join('/') + timestamp
  return createHmac('sha256', config.secret)
    .update(data)
    .digest('hex')
}

/**
 * Get a signed url
 * @param url
 * @param exact when true the url must match exactly, otherwise urls starting with
 * @param expiresIn the number of seconds the signed url should be valid
 */
export function getSignedUrl(url: string, exact: boolean = true, expiresIn: number = 60): string {
  const timestamp = Date.now() + expiresIn * 1000
  const n = exact ? 0 : url.split('/').length - 1
  return `/signed/${timestamp}/${n}/${getSignature(url, timestamp, n)}${url}`
}

const client = config.auth?.provider === 'google' && new OAuth2Client({
  clientId: config.auth.clientId,
})

/**
 * Security middleware
 */
export function security() {
  return wrapper(async (req, res, next) => {
    if (config.skipAuth || req.url.startsWith('/auth') || req.url.startsWith('/public')) {
      return next()
    }

    const { params: { timestamp, signature, n }, url, headers, originalUrl } = req
    let verified

    if (originalUrl.startsWith('/signed')) {
      // verify signed urls
      const _timestamp = parseInt(timestamp.toString())
      verified = Date.now() < _timestamp && signature === getSignature(url, _timestamp, parseInt(n.toString()))
    }
    else {
      // verify jwt or api token
      const [, token] = /^bearer (.*)$/i.exec(headers['authorization'] ?? '') ?? []
      verified = config.apiTokens.includes(token)
      if (!verified && client) {
        try {
          req.token = jwt.verify(token, config.secret) as Token
          verified = !!req.token
        }
        catch (_e) {
          // ignore
        }
      }
    }

    if (verified) {
      next()
    }
    else {
      res.status(401).send('Access denied')
    }
  })
}
