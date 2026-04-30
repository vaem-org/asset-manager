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
import { stringify } from 'querystring'
import { api, getDocument, wrapper } from '#~/lib/express-helpers.js'
import { config } from '#~/config.js'
import { Asset } from '#~/model/Asset/index.js'
import { HttpError } from '#~/lib/HttpError.js'

export default (router: Router) => {
  router.get('/:language', wrapper(async ({ params: { language, id }, query: { direct } }, res) => {
    const asset = await getDocument(Asset, id)
    if (config.cdn && direct !== '1') {
      return res.redirect(config.cdn.getSignedUrl(`/${id}/subtitles/${language}.vtt?${stringify({
        updatedAt: typeof asset.updatedAt === 'string' ? new Date(asset.updatedAt).getTime() : 0,
        v: asset.__v,
      })}`, 60))
    }

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
    const tempFile = `${tmpdir()}/${id}${extname(name.toString())}`
    await writeFile(tempFile, req)
    const asset = await getDocument(Asset, id)
    await asset.setSubtitle(language.toString(), tempFile)
    await unlink(tempFile)
  }))

  router.delete('/:language', api(async ({ params: { language, id } }) => {
    const asset = await getDocument(Asset, id)

    const { [language.toString()]: _toRemove, ...subtitles } = asset.subtitles
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
