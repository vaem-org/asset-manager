/*
 * VAEM - Asset manager
 * Copyright (C) 2022  Wouter van de Molengraft
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

import { Router } from 'express';
import dayjs from 'dayjs';
import send from 'send';
import axios from 'axios';
import { api, getDocument, wrapper } from '#~/lib/express-helpers';
import { Asset } from '#~/model/Asset/index';
import { config } from '#~/config';
import { parseM3U8 } from '#~/lib/m3u8';

const router = new Router({
  mergeParams: true
});

router.use(wrapper(async (req, res, next) => {
  req.doc = await getDocument(Asset, req.params.id);
  next();
}));

router.get('/', api(async ({ doc }) => {
  return doc.playbackInfo;
}));

router.get('/file.key', wrapper(async ({ doc }, res) => {
  res.setHeader('expires', dayjs().add(7, 'days').toISOString());
  res.setHeader('cache-control', 'private,max-age=604800');

  res.send(Buffer.from(doc.hls_enc_key, 'hex'));
}));

router.get(['/:assetId.:bitrate.m3u8', '/subtitles/:language.m3u8'], wrapper(async ({ doc, params: { id, bitrate, language } }, res) => {
  const source =  !language ? `/${id}/${id}.${bitrate}.m3u8` : `/${id}/subtitles/${language}.m3u8`;
  const signedUrl = config.cdn?.getSignedUrl?.(source, 60);

  let m3u;
  try {
    m3u = await parseM3U8(
      signedUrl ? (await axios.get(signedUrl, {
        responseType: 'stream'
      })).data : await config.storage.download(source)
    );
  }
  catch (e) {
    return res.status(e.response?.status ?? 500).end();
  }

  if (m3u.properties['EXT-X-KEY']) {
    // update key url
    m3u.properties['EXT-X-KEY'] = [
      'METHOD=AES-128',
      `URI="file.key"`,
      `IV=0x${doc.hls_enc_iv}`
    ].join(',');
  }

  if (config.cdn) {
    m3u.items.PlaylistItem.forEach(stream => {
      if (/\.(ts|vtt)$/.exec(stream.get('uri'))) {
        stream.set('uri',
          config.cdn.getSignedUrl(
            `/${id}/${stream.get('uri')}`,
            8 * 3600
          )
        );
      }
    });
  }

  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.end(m3u.toString());
}));

router.get('/:assetId.m3u8', wrapper(async (req, res) => {
  res.setHeader('cache-control', 'private,max-age=604800');
  res.setHeader('Content-Type', 'application/x-mpegURL');

  if (config.cdn) {
    const path = `/${req.params.id}/${req.params.assetId}.m3u8`;
    try {
      (await axios.get(config.cdn.getSignedUrl(
        path,
        60
      ), {
        responseType: 'stream'
      })).data.pipe(res);
    }
    catch (e) {
      res.status(e.response?.status || 500).end();
    }
    return;
  }

  send(req,`${config.root}/var/output/${req.params.id}/${req.params.assetId}.m3u8`)
  .pipe(res)
}))

router.get(['/:file', '/subtitles/:file'], (req, res) => {
  const { params: { id }, url } = req;
  send(req, `${config.root}/var/output/${id}/${url}`).pipe(res);
});

export default router;
