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
import { getDocument, wrapper } from '#~/lib/express-helpers.js'
import { Asset } from '#~/model/Asset/index.js'
import { config } from '#~/config.js'

export default (router: Router) => {
  router.get('/file.key', wrapper(async (req, res) => {
    const asset = await getDocument(Asset, req.params.id)
    return res.send(Buffer.from(asset.hls_enc_key, 'hex'))
  }))

  router.get('/', wrapper(async (req, res) => {
    const doc = await getDocument(Asset, req.params.id)
    return res.send([
      'file.key',
      `${config.base}${req.originalUrl}/file.key`,
      doc.hls_enc_iv,
    ].join('\n'))
  }))
}
