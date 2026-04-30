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
import { encode } from '#~/lib/encode.js'
import { File } from '#~/model/File/index.js'
import { HttpError } from '#~/lib/HttpError.js'

export default (router: Router) => {
  router.post('/encode', api(async ({ params: { id }, body: {
    audio,
    copyHighestVariant,
    customAudioFilter = null,
    ss = null,
  } }) => {
    const doc = await getDocument(File, id)

    try {
      return await encode(
        doc.name,
        audio,
        !!copyHighestVariant,
        customAudioFilter,
        ss,
      )
    }
    catch (e) {
      console.warn(e)
      throw new HttpError(500, e?.toString?.())
    }
  }))
}
