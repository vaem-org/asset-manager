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
import { createReadStream } from 'fs'
import { access, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { spawn } from 'child_process'
import { getDocument, wrapper } from '#~/lib/express-helpers.js'
import { config } from '#~/config.js'
import { Asset } from '#~/model/Asset/index.js'
import { HttpError } from '#~/lib/HttpError.js'
import ffmpeg from '@ffmpeg-installer/ffmpeg'

export default (router: Router): void => {
  router.get('/frame0.webp', wrapper(async ({ params: { id } }, res) => {
    const asset = await getDocument(Asset, id)
    if (!['verified', 'processed'].includes(asset.state) || asset.variants.length === 0 || asset.deleted) {
      throw new HttpError(404)
    }

    const filename = `${config.root}/var/thumbnails/${id}.webp`

    try {
      await access(filename)
    }
    catch (_e) {
      await mkdir(dirname(filename), {
        recursive: true,
      })

      // create thumbnail
      await new Promise<void>((resolve, reject) => {
        spawn(ffmpeg.path, [
          '-v', 'error',
          '-y',
          '-i', asset.getUrl(asset.highestVariant),
          '-frames:v', '1',
          '-c:v', 'webp',
          filename,
        ], {
          stdio: 'inherit',
        }).on('close', (code) => {
          if (code === 0) {
            resolve()
          }
          else {
            reject('ffmpeg failed')
          }
        })
      })
    }

    res.setHeader('content-type', 'image/webp')
    createReadStream(filename).pipe(res)
  }))
}
