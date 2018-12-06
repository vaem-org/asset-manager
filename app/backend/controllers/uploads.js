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
import express from 'express';
import _ from 'lodash';
import * as sourceUtil from '../util/source';
import path from 'path';
import glob from 'glob-promise';
import send from 'send';

import {api, catchExceptions} from '../util/express-helpers';
import {renderIndex} from '../util/render-index';
import {File} from '../model/file';
import {Asset} from '../model/asset';
import * as subtitles from '../util/subtitles';
import {guessChannelLayout} from '../util/source';

export default app => {
  const io = app.io.of('/uploads', null);

  const router = new express.Router({});
  const json = express.json();
  app.use('/uploads', router);

  fs.ensureDirSync(app.config.source);

  router.post('/items', json, api(async req => {
    let where = {};

    if (req.body.query) {
      where = {
        name: {
          $regex: req.body.query,
          $options: 'i'
        }
      };
    }

    return {
      items: await File
        .find(where)
        .sort({[req.body.sortBy]: req.body.descending ? -1 : 1})
        .limit(req.body.rowsPerPage)
        .skip((req.body.page - 1) * req.body.rowsPerPage)
      ,
      totalItems: await File.countDocuments(where)
    }
  }));

  router.get('/', catchExceptions(async (req, res) => {
    const files = await glob('**', {nodir: true, cwd: app.config.source});
    const entries = await File.find();

    const byName = _.keyBy(entries, 'name');

    for (let name of files) {
      const stat = await fs.stat(`${app.config.source}/${name}`);

      let file = byName[name] || new File({
        name: name,
        state: 'complete',
        size: stat.size,
        uploaded: stat.size
      });

      if (byName[name]) {
        file.set({
          size: stat.size,
          uploaded: stat.size
        });
      }
      await file.save();
      entries.push(file);
    }

    await File.remove({
      name: {$not: {$in: files}}
    });

    renderIndex('main')(req, res);
  }));

  router.post('/prepare', json, api(async req => {
    const files = [];
    const newFiles = [];
    for (let file of req.body) {
      let item = await File.findOne({name: file.name});
      if (!item) {
        item = new File(file);
        await item.save();
        newFiles.push(item);
      }
      files.push(item.toObject());
    }

    if (newFiles.length > 0) {
      io.emit('created', {files: newFiles});
    }

    return files;
  }));

  router.post('/remove', json, api(async req => {
    const items = await File.find({_id: {$in: req.body}});
    for (let item of items) {
      try {
        await fs.unlink(`${app.config.source}/${item.name}`);
      }
      catch (e) {
        console.info(`Unable to remove ${item.name}`);
      }
    }

    await File.remove({_id: {$in: req.body}});
  }));

  router.put('/', catchExceptions(async (req, res) => {
    let numBytes = 0;
    const offset = parseInt(req.query.offset) || 0;

    const throttledEmit = _.throttle(io.emit.bind(io), 250);

    const file = await File.findOneAndUpdate({name: req.query.name}, {
      name: req.query.name,
      size: req.query.size,
      state: 'uploading'
    }, {
      upsert: true,
      new: true
    });

    const handleClose = () => {
      file.state = file.uploaded === file.size ? 'complete' : 'idle';
      file.uploaded = offset + numBytes;
      file.save();
      io.emit('progress', file);

      return res.json({
        result: file._id
      });
    };

    req
      .on('data', data => {
        numBytes += data.length;
        file.uploaded = offset + numBytes;
        throttledEmit('progress', file);
      })
      .on('close', handleClose)
      .on('end', handleClose)
      .pipe(fs.createWriteStream(`${app.config.source}/${req.query.name}`, {
        start: offset,
        flags: offset === 0 ? 'w' : 'r+'
      }));
  }));

  const fetchItem = catchExceptions(async (req, res, next) => {
    req.item = await File.findById(req.params.id);
    next(req.item ? null : 'route');
  });

  router.get('/items/:id/download', fetchItem, (req, res) => {
    res.setHeader('content-disposition', `attachment; filename="${req.item.name}"`);
    send(req, `${app.config.source}/${req.item.name}`)
      .pipe(res);
  });

  router.get('/items/:id/streams', fetchItem, api(async req => {
    const source = sourceUtil.getSource(req, req.item.name);
    const videoParameters = await sourceUtil.getVideoParameters(
      source
    );

    return {
      streams: _.get(videoParameters, 'ffprobe.streams', []),
      audioStreams: !_.isEmpty(req.item.audioStreams) ? req.item.audioStreams : await guessChannelLayout(source)
    };
  }));

  router.post('/items/:id/audio-streams', fetchItem, json, api(async req => {
    req.item.audioStreams = req.body;
    await req.item.save();
  }));

  router.get('/assets', api(async () => Asset.find({state: 'processed'}).select('title').sort({createdAt: -1})));

  router.post('/items/:id/assign-to/:language/:assetId', fetchItem, api(async req => {
    return subtitles.convert(
      `${app.config.outputBase || req.base}/player/streams/${req.session.id}`,
      req.params.assetId,
      `${app.config.source}/${req.item.name}`,
      req.params.language);
  }));

  router.post('/archive', json, api(async req => {
    await fs.ensureDir(app.config.archive);
    const items = await File.find({_id: {$in: req.body}});

    for (let item of items) {
      await fs.ensureDir(path.dirname(`${app.config.archive}/${item.name}`));

      await fs.rename(
        `${app.config.source}/${item.name}`,
        `${app.config.archive}/${item.name}`
      );
    }

    await File.remove({_id: {$in: req.body}});

    io.emit('removed', {ids: req.body});
  }))
}
