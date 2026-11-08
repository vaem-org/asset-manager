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
import { unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { extname } from 'path'
import { api, getDocument, wrapper } from '#~/lib/express-helpers.js'
import { config } from '#~/config.js'
import { Asset } from '#~/model/Asset/index.js'
import { HttpError } from '#~/lib/HttpError.js'

const isValidLanguage = (language: unknown): language is string =>
  typeof language === 'string' && /^[a-zA-Z0-9_-]+$/.test(language)

export default (router: Router) => {
  router.get('/:language', wrapper(async ({ params: { language, id } }, res) => {
    if (!isValidLanguage(language)) {
      throw new HttpError(400)
    }
    const asset = await getDocument(Asset, id)

    res.setHeader('content-type', 'text/vtt')
    res.setHeader('content-disposition', `attachment; filename="${asset.title}.${language}.vtt"`)
    try {
      (await config.storage.download(`${id}/subtitles/${language}.vtt`)).pipe(res)
    }
    catch (_e) {
      throw new HttpError(404)
    }
  }))

  router.put('/:language/:name', api(async (req) => {
    const { params: { language, id, name } } = req
    if (!isValidLanguage(language)) {
      throw new HttpError(400)
    }
    const asset = await getDocument(Asset, id)
    const ext = extname(name.toString()).replace(/[^a-zA-Z0-9.]/g, '')
    const tempFile = `${tmpdir()}/${asset._id.toString()}${ext}`
    await writeFile(tempFile, req)
    try {
      await asset.setSubtitle(language, tempFile)
    }
    finally {
      await unlink(tempFile).catch(() => {})
    }
  }))

  router.delete('/:language', api(async ({ params: { language, id } }) => {
    if (!isValidLanguage(language)) {
      throw new HttpError(400)
    }
    const asset = await getDocument(Asset, id)

    const { [language]: _toRemove, ...subtitles } = asset.subtitles
    asset.subtitles = subtitles
    await asset.save();

    (async () => {
      const files = (await config.storage.list(`${id}/subtitles`))
        .map(({ name }) => name)
        .filter(name => name.startsWith(`${language}.`))

      for (const file of files) {
        await config.storage.remove(`${id}/subtitles/${file}`)
      }
    })().catch((e) => {
      console.warn(`Unable to subtitle files for ${id} ${language}: ${e.toString()}`)
    })
  }))
}
