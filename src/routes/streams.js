/*
 * VAEM - Asset manager
 * Copyright (C) 2019  Wouter van de Molengraft
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

import config from '@/config';
import woothee from 'woothee';
import { Stream } from 'stream';
import { Router, static as expressStatic } from 'express';
import _ from 'lodash';
import axios from 'axios';
import m3u8 from 'm3u8';
import cloudfrontSign from 'aws-cloudfront-sign';
import path from 'path';
import moment from 'moment';
import { createReadStream, access, constants } from 'fs';
import semver from 'semver';

import querystring from 'querystring';
import { Asset } from '~/model/asset';
import { api, catchExceptions, validObjectId, verify } from '~/lib/express-helpers';
import { verifySignature} from '@/lib/url-signer';
import { getSignedUrl } from '~/lib/bunnycdn';
import { getStreamInfo } from '@/lib/stream';

const exists = filename => new Promise((accept) => {
  access(filename, constants.R_OK, err => accept(!err));
});

/**
 * Parse an m3u8 stream
 * @param {Stream} stream
 * @return {Promise<any>}
 */
const parseM3U = stream => new Promise((accept, reject) => {
  const parser = m3u8.createStream();

  let error = null;

  stream.pipe(parser);

  stream.on('error', err => {
    error = true;
    reject(err);
  });

  parser.on('error', err => {
    if (error) {
      return;
    }
    error = true;
    reject(err);
    parser.end();
  });

  parser.on('m3u', m3u => {
    if (error) {
      return;
    }

    accept(m3u);
  });
});

const router = new Router({});

const cloudfrontSignCookies = path => cloudfrontSign.getSignedCookies(
  `${config.cloudfront.base + path}/*`,
  _.extend({},
    config.cloudfront,
    {
      expireTime: moment().add(8, 'hours')
    })
);

// check authentication of stream
const checkAuth = catchExceptions(async (req, res, next) => {
  const assetId = req.params.assetId || req.path.split('/')[1];
  req.item = await Asset.findById(assetId);

  if (!req.item) {
    return res.status(404).end();
  }

  if (!req.item.public && !verifySignature(req, req.params.assetId || req.url.split('/')[1])) {
    return res.status(403).end();
  }

  next();
});

const streaminfo = api(async req => {
  return await getStreamInfo(req.params.assetId, req.ip);
});

router.get('/:assetId/item', verify, streaminfo);

router.get('/:timestamp/:signature/:assetId', validObjectId('assetId'), checkAuth, streaminfo);

router.use('/:timestamp/:signature/:assetId.:language.vtt', checkAuth, catchExceptions(async (req, res) => {
  const filename = `${config.root}/var/subtitles/${req.params.assetId}.${req.params.language}.vtt`;
  if (!await exists(filename)) {
    throw {
      status: 404
    }
  }

  createReadStream(filename)
    .pipe(res);
}));

router.get(['/:timestamp/:signature/:assetId.key'],
  checkAuth,
  (req, res, next) => {
    const item = req.item;
    if (!item) {
      return next();
    }

    res.setHeader('expires', moment().add(7, 'days').toISOString());
    res.setHeader('cache-control', 'private,max-age=604800');

    res.send(Buffer.from(item.hls_enc_key, 'hex'));
  });

router.get([
  '/:timestamp/:signature/:assetId/subtitles/:language.m3u8',
  '/:timestamp/:signature/:assetId.:bitrate.m3u8',
  '/:timestamp/:signature/:assetId.m3u8'
], checkAuth, catchExceptions(async (req, res) => {
  const asset = req.item;

  let base =
    `${req.base}/streams/`
  ;

  let uri;

  let signedCookies;

  /**
   * @type {function}
   */
  let signUrl = null;

  if (config.cloudfront) {
    signUrl = uri => `${config.cloudfront.base}${uri}?${querystring.stringify(signedCookies)}`;
  } else if (config.bunnyCDN) {
    const expires = Math.floor(Date.now() / 1000) + 8 * 3600;
    signUrl = uri => getSignedUrl(uri, expires)
  }

  if (!req.params.language) {
    uri = [
      signUrl ? '/' : base,
      req.params.assetId,
      '/',
      req.params.assetId,
      req.params.bitrate ? '.' + req.params.bitrate : '',
      '.m3u8'
    ].join('');
  } else {
    uri = `${signUrl ? '/' : base}${req.params.assetId}/subtitles/${req.params.language}.m3u8`;
  }

  signedCookies = config.cloudfront ? _.mapKeys(
    cloudfrontSignCookies(path.dirname(uri)),
    (value, key) => key.replace(/^CloudFront-/, '')
  ) : {};

  let m3u;

  if (signUrl) {
    try {
      m3u = await parseM3U(
        (await axios.get(signUrl(uri), {
          responseType: 'stream'
        })).data
      );
    }
    catch (e) {
      throw `Unable to get ${signUrl(uri)}: ${e.toString()}`;
    }
  } else {
    const m3u8File = `/${req.params.assetId}/${req.params.assetId}${req.params.bitrate ? '.' + req.params.bitrate : ''}.m3u8`;

    try {
      await config.destinationFileSystem.get(m3u8File);
    }
    catch (e) {
      return res.status(404).end();
    }

    m3u = await parseM3U(
      (await config.destinationFileSystem.read(m3u8File)).stream
    );
  }

  const addSubtitles =
    (req.query.subtitles ||
      (req.headers['user-agent'] || '').search(/Apple\s*TV/) !== -1) &&
    Object.keys(asset.subtitles || {}).length > 0
  ;

  if (addSubtitles) {
    m3u.addMediaItem({
      type: 'SUBTITLES',
      'group-id': 'subs',
      name: 'Nederlands',
      default: 'YES',
      forced: 'NO',
      autoselect: 'YES',
      language: 'nl',
      uri: `${req.params.assetId}/subtitles/nl.m3u8`
    });
  }

  if (addSubtitles) {
    m3u.items.StreamItem.forEach(stream => {
      stream.set('subtitles', 'subs');
    });
  }

  if (m3u.properties['EXT-X-KEY']) {
    // update key url
    m3u.properties['EXT-X-KEY'] = [
      'METHOD=AES-128',
      `URI="${req.params.assetId}.key"`,
      `IV=0x${asset.hls_enc_iv}`
    ].join(',');
  }

  base = `${req.params.assetId}/`;

  if (req.params.language) {
    base += 'subtitles/';
    m3u.set('playlistType', 'VOD');
  }

  // Prevent "unknown cc" for Apple players
  const browser = woothee.parse(req.headers['user-agent']);
  try {
    if (browser.name !== 'Safari' || semver.satisfies(browser.os_version, '>=10.13.0')) {
      m3u.items.StreamItem.forEach(stream => {
        stream.attributes.attributes['closed-captions'] = 'NONE';
      });
    }
  } catch (e) {
    // skip
  }

  // reverse StreamItems so playlist is started with highest bitrate
  m3u.items.StreamItem.reverse();

  m3u.items.PlaylistItem.forEach(stream => {
    if (/\.(ts|vtt)$/.exec(stream.get('uri'))) {
      stream.set('uri',
        signUrl ?
          signUrl(
            `/${base}${stream.get('uri')}`,
          ) :
          base + stream.get('uri')
      );
    }
  });

  res.header('Content-Type', 'application/vnd.apple.mpegurl');

  res.end(m3u.toString());
}));

router.use('/:timestamp/:signature', checkAuth, expressStatic(config.output, {
  maxAge: 7 * 24 * 3600 * 1000
}));

export default router;
