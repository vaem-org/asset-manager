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

import fs from 'fs-extra';
import querystring from 'querystring';
import _ from 'lodash';
import {renderIndex} from '../util/render-index';
import moment from 'moment';
import express from 'express';
import sharp from 'sharp';

import * as fileType from '../util/file-type';
import {api, catchExceptions} from '../util/express-helpers';
import {createThumbnail} from '../util/ffmpeg-thumbnail';

import {Asset} from '../model/asset';
import {convert as subtitleConvert} from '../util/subtitles';

export default app => {
  const simpleEncryptor = require('simple-encryptor')(app.config.encryptor);

  app.get('/', (req, res) => res.redirect('/assets/'));

  const router = new express.Router({});
  const json = express.json();

  app.use('/assets', router);

  router.get('/', renderIndex('main'));

  // for backwards compatibility
  app.get('/assets.json', catchExceptions(async (req, res) => {
    res.json({
      rows: await Asset.find().select(['title', 'labels', 'videoParameters.duration', 'deleted']),
      total: await Asset.countDocuments()
    })
  }));

  router.post('/items', json, api(async req => {
    const where = {
      deleted: {$ne: true}
    };

    if (req.body.query && req.body.query.match(/^[0-9a-fA-F]{24}$/)) {
      where._id = req.body.query;
    }
    else if (req.body.query) {
      where.title = {
        $regex: req.body.query,
        $options: 'i'
      };
    }

    _.assign(where, _.pickBy(req.body.filters || {}));

    return {
      items: await Asset
        .find(where)
        .sort({[req.body.sortBy]: req.body.descending ? -1 : 1})
        .limit(req.body.rowsPerPage)
        .skip((req.body.page - 1) * req.body.rowsPerPage)
        .populate('distributor')
      ,
      totalItems: await Asset.countDocuments(where)
    }
  }));

  router.get('/items/:id', api(async req => Asset.findById(req.params.id)));

  router.get('/items/:id/stream-url', api(async req => {
    return `/player/streams/${req.session.id}/${req.params.id}.m3u8`;
  }));

  app.get('/items/:id/subtitles', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.nl.vtt"`);
    fs.createReadStream(`${app.config.root}/var/subtitles/${req.params.id}.nl.vtt`)
      .pipe(res);
  });

  router.put('/items/:id/subtitles/:language', (req, res) => {
    const ext = req.query.name.replace(/^.*\.([^.]+)$/, '$1');
    if (!fileType.isSubtitle(req.query.name)) {
      return res.json(false);
    }

    fs.ensureDirSync(`${app.config.root}/var/tmp`);
    const lang = req.params.language;
    const sourceFile = `${app.config.root}/var/tmp/${req.params.id}.${lang}.${ext}`;

    const output = fs.createWriteStream(sourceFile);
    req.on('end', async () => {
      try {
        await subtitleConvert(`${app.config.outputBase || req.base}/player/streams/${req.session.id}`, req.params.id, sourceFile, lang);
        await fs.unlink(sourceFile);
        res.json({result: true});
      }
      catch (e) {
        res.json({error: e});
      }
    }).pipe(output);
  });

  router.get('/items/:id/subtitles/:language', catchExceptions(async (req, res, next) => {
    const asset = await Asset.findById(req.params.id);

    if (!asset || !asset.subtitles) {
      return next();
    }

    res.setHeader('content-disposition', `attachment; filename="${req.params.id}.${req.params.language}.vtt"`);
    fs.createReadStream(`${app.config.root}/var/subtitles/${req.params.id}.${req.params.language}.vtt`)
      .pipe(res);
  }));

  router.get('/labels', api(async () => Asset.getLabels()));

  router.post('/set-labels', api(async req => {
    const assets = await Asset.find({_id: {$in: req.body.assets}});

    for (let item of assets) {
      item.labels = req.body.operation === 'add' ?
        _.union(item.labels, req.body.labels) :
        _.difference(item.labels, req.body.labels);

      await item.save();
    }
  }));

  router.post('/remove', json, api(async req => {
    const items = await Asset.find({_id: {$in: req.body}});
    for (let item of items) {
      item.removeFiles();
      await item.save();
    }

    return true;
  }));

  router.post('/items/:id/share-url', json, api(async req => {
    return `${req.base}/auth/?${querystring.stringify({
      auth: simpleEncryptor.encrypt([
        moment().add(parseInt(req.body.weeksValid), 'weeks').valueOf(),
        req.body.password,
        req.params.id
      ])
    })}`;
  }));

  router.post('/set-distributor', json, api(async req => {
    return Asset.update({_id: {$in: req.body.ids}}, {
      $set: {
        distributor: req.body.distributor
      }
    }, {multi: true});
  }));

  router.post('/items/:id', json, api(async req => {
    const asset = await Asset.findById(req.params.id);
    asset.set(_.extend({}, req.body, {
      distributor: req.body.distributor || null
    }));
    await asset.save();
  }));

  app.get('/api/assets/:id', api(async req => {
    const item = await Asset.findById(req.params.id);

    if (!item) {
      throw 'Not found';
    }

    return item;
  }));

  const thumbnails = `${app.config.root}/var/thumbnails`;
  fs.ensureDir(thumbnails).catch(e => console.error(e));

  app.use('/thumbnails', express.static(thumbnails, {
    maxAge: 7 * 24 * 3600 * 1000
  }));

  app.get([
      '/thumbnails/:assetId.(jpg|png)',
      '/thumbnails/:time/:assetId.(jpg|png)'
    ], catchExceptions(async (req, res) => {
    const item = await Asset.findById(req.params.assetId);
    if (!item) {
      console.log('Item not found');
      return next('route');
    }

    if (!await fs.exists(`${thumbnails}/${req.params.assetId}.png`)) {
      // create png thumbnail with ffmpeg
      const url = `${app.config.outputBase || req.base}/player/streams/${req.session.id}/${req.params.assetId}.m3u8`;
      await createThumbnail(url, `${thumbnails}/${req.params.assetId}.png`, req.params.time || '0:00:00');
    }

    if (req.params[0] === 'jpg' && !await fs.exists(`${thumbnails}/${req.params.assetId}.jpg`)) {
      await sharp(`${thumbnails}/${req.params.assetId}.png`)
        .jpeg({
          quality: 60
        })
        .toFile(`${thumbnails}/${req.params.assetId}.jpg`);
    }

    fs
      .createReadStream(`${thumbnails}/${req.params.assetId}.${req.params[0]}`)
      .pipe(res);
  }));
}
