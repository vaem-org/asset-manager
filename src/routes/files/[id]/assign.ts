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
import { api, getDocument } from '#~/lib/express-helpers.js'
import { File } from '#~/model/File/index.js'
import { Asset } from '#~/model/Asset/index.js'

export default (router: Router) => {
  router.post('/assign/:assetId/:language', api(async ({ params: { id, assetId, language } }) => {
    const file = await getDocument(File, id)
    const asset = await getDocument(Asset, assetId)
    await asset.setSubtitle(language.toString(), file.path)
  }))
}
