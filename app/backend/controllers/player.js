/*
 * VAEM - Asset manager
 * Copyright (C) 2018  Wouter van de Molengraft
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

import express from 'express';
import _ from 'lodash';
import request from 'request';
import m3u8 from 'm3u8';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import cloudfrontSign from 'aws-cloudfront-sign';
import path from 'path';
import moment from 'moment';
import cors from 'cors';

import querystring from 'querystring';
import {Asset} from '../model/asset';
import {api, catchExceptions} from '../util/express-helpers';
import {renderIndex} from '../util/render-index';
import {checkIp} from '../util/auth';

export default app => {
  const router = new express.Router({});
  const config = app.config;

  const cloudfrontSignCookies = path => cloudfrontSign.getSignedCookies(
    `${app.config.cloudfront.base + path}/*`,
    _.extend({},
      app.config.cloudfront,
      {
        expireTime: moment().add(8, 'hours')
      })
  );


  router.use(express.static(`${app.config.root}/public`));
  router.get('/:id', cookieParser(), catchExceptions(async (req, res, next) => {
    const item = await Asset.findById(req.params.id);
    if (!item) {
      return next();
    }

    renderIndex('player')(req, res);
  }));

  router.use('/subtitles', cors(), express.static(`${app.config.root}/var/subtitles`));

  router.use('/streams', cors(), express.static(app.config.output));

  // check authentication of stream
  const checkAuth = (req, res, next) => {
    if (checkIp(app.config, req.ip) || req.session.passport || req.session.basicAuthenticated) {
      return next();
    }

    app.sessionStore.get(req.params.sid, (err, session) => {
      if (_.get(session, 'passport')) {
        return next();
      }

      const assetId = _.get(session, 'authenticated[2]');
      if (!assetId || assetId !== req.params.assetId) {
        res.statusCode = 403;
        return res.end();
      }

      next();
    });
  };

  router.get('/:assetId/item', api(async req => {
    const item = await Asset.findById(req.params.assetId);

    if (!item) {
      throw 'Not found';
    }

    return {
      streamUrl: `/player/streams/${req.session.id}/${req.params.assetId}.m3u8`,
      subtitles: item.subtitles
    }
  }));

  router.get(['/streams/:sid/:assetId.key'], cors(), checkAuth, catchExceptions(async (req, res, next) => {
    const item = await Asset.findById(req.params.assetId);
    if (!item) {
      return next();
    }

    res.send(new Buffer(item.hls_enc_key, 'hex'));
  }));

  router.get([
    '/streams/:sid/:assetId/subtitles/:language.m3u8',
    '/streams/:sid/:assetId.:bitrate.m3u8',
    '/streams/:sid/:assetId.m3u8'
  ], cors(), checkAuth, catchExceptions(async (req, res, next) => {
    const asset = await Asset.findById(req.params.assetId);

    const base =
      req.base + '/player/streams/'
    ;

    let uri;

    if (!req.params.language) {
      uri = [
        config.cloudfront ? '/' : base,
        req.params.assetId,
        '/',
        req.params.assetId,
        req.params.bitrate ? '.' + req.params.bitrate : '',
        '.m3u8'
      ].join('');
    }
    else {
      uri = `${config.cloudfront ? '/' : base}${req.params.assetId}/subtitles/${req.params.language}.m3u8`;
    }

    const signedCookies = config.cloudfront ? _.mapKeys(
      cloudfrontSignCookies(path.dirname(uri)),
      (value, key) => key.replace(/^CloudFront-/, '')
    ) : {};

    const cloudfrontSignUrl = uri => `${app.config.cloudfront.base}${uri}?${querystring.stringify(signedCookies)}`;

    const parser = m3u8.createStream();

    if (config.cloudfront) {
      request({
        url: cloudfrontSignUrl(uri)
      }).pipe(parser);
    }
    else {
      const m3u8File = `${app.config.output}/${req.params.assetId}/${req.params.assetId}${req.params.bitrate ? '.' + req.params.bitrate : ''}.m3u8`;

      fs.accessSync(m3u8File);
      fs
        .createReadStream(m3u8File)
        .pipe(parser)
      ;
    }

    let error = false;

    parser.on('error', err => {
      if (error) {
        return;
      }
      error = true;
      console.log(err);
      next(new Error('Unable to parse m3u8'));
      parser.end();
    });

    parser.on('m3u', m3u => {
      if (error) {
        return;
      }

      const addSubtitles =
        (req.query.subtitles ||
          (req.headers['user-agent'] || '').search(/AppleTV/) !== -1) &&
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

      let base = `${req.params.assetId}/`;

      if (req.params.language) {
        base += 'subtitles/';
        m3u.set('playlistType', 'VOD');
      }

      // Prevent "unknown cc" for Apple players
      m3u.items.StreamItem.forEach(stream => {
        stream.attributes.attributes['closed-captions'] = 'NONE';
      });

      m3u.items.PlaylistItem.forEach(stream => {
        if (/\.(ts|vtt)$/.exec(stream.get('uri'))) {
          stream.set('uri',
            config.cloudfront ?
              cloudfrontSignUrl(
                `/${base}${stream.get('uri')}`,
              ) :
              base + stream.get('uri')
          );
        }
      });

      res.header('Content-Type', 'application/vnd.apple.mpegurl');

      res.send(m3u.toString());
    });
  }));

  router.use('/streams/:sid', express.static(config.output));

  app.use('/player', router);
  app.use('/shared/player', (req, res, next) => {
    req.checkAuth = true;
    res.locals.prefix = '/shared';
    return next();
  }, router);
}