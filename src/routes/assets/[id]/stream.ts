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
import dayjs from 'dayjs'
import send from 'send'
import axios, { AxiosError } from 'axios'
import type { AttrList, MediaPlaylist } from 'm3u8parse'
import parseM3U8, { PlaylistType } from 'm3u8parse'
import { api, getDocument, wrapper } from '#~/lib/express-helpers.js'
import { Asset } from '#~/model/Asset/index.js'
import { config } from '#~/config.js'
import { HttpError } from '#~/lib/HttpError.js'
import { text } from 'node:stream/consumers'
import type { Key } from 'm3u8parse/types/attrs'

export default (router: Router) => {
  router.get('/stream', api(async (req) => {
    return (await getDocument(Asset, req.params.id)).playbackInfo
  }))

  router.get('/stream/file.key', wrapper(async (req, res) => {
    res.setHeader('expires', dayjs().add(7, 'days').toISOString())
    res.setHeader('cache-control', 'private,max-age=604800')

    res.send(Buffer.from((await getDocument(Asset, req.params.id)).hls_enc_key, 'hex'))
  }))

  router.get(['/stream/:assetId.:bitrate.m3u8', '/stream/subtitles/:language.m3u8'], wrapper(async ({ params: { id, bitrate, language } }, res) => {
    const source = !language ? `/${id}/${id}.${bitrate}.m3u8` : `/${id}/subtitles/${language}.m3u8`
    const signedUrl = config.cdn?.getSignedUrl?.(source, 60)
    const doc = await getDocument(Asset, id)

    let m3u: MediaPlaylist
    try {
      m3u = parseM3U8(
        await text(signedUrl
          ? (await axios.get(signedUrl, {
              responseType: 'stream',
            })).data
          : await config.storage?.download?.(source),
        ), {
          type: PlaylistType.Media,
        },
      )
    }
    catch (e) {
      return new HttpError(
        e instanceof AxiosError ? e.response?.status ?? 500 : 500,
      )
    }

    m3u.keysForMsn(0)
      ?.forEach?.((key: AttrList<Key>) => {
        key.set('iv', `0x${doc.hls_enc_iv}`)
      })

    if (config.cdn) {
      m3u.segments.forEach((stream) => {
        if (stream.uri && /\.(ts|vtt)$/.exec(stream.uri)) {
          stream.uri
            = config.cdn!.getSignedUrl(
              `/${id}/${stream.uri}`,
              8 * 3600,
            )
        }
      })
    }

    res.setHeader('Content-Type', 'application/x-mpegURL')
    res.end(m3u.toString())
  }))

  router.get('/stream/:assetId.m3u8', wrapper(async (req, res) => {
    res.setHeader('cache-control', 'private,max-age=604800')
    res.setHeader('Content-Type', 'application/x-mpegURL')

    if (config.cdn) {
      const path = `/${req.params.id}/${req.params.assetId}.m3u8`
      try {
        (await axios.get(config.cdn.getSignedUrl(
          path,
          60,
        ), {
          responseType: 'stream',
        })).data.pipe(res)
      }
      catch (e) {
        throw new HttpError(
          e instanceof AxiosError ? e.response?.status ?? 500 : 500,
        )
      }
      return
    }

    send(req, `${config.root}/var/output/${req.params.id}/${req.params.assetId}.m3u8`)
      .pipe(res)
  }))

  router.get(['/stream/:file', '/stream/subtitles/:file'], (req, res) => {
    const { params: { id, file } } = req
    send(req, `${config.root}/var/output/${id}/${file}`).pipe(res)
  })
}
