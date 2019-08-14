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
import {join as pathJoin} from 'path';

import {api, catchExceptions} from '../util/express-helpers';
import {renderIndex} from '../util/render-index';
import {File} from '../model/file';
import {Asset} from '../model/asset';
import * as subtitles from '../util/subtitles';
import {guessChannelLayout} from '../util/source';
import {getNormalizeParameters} from '../util/source';

export default app => {
  const io = app.io.of('/uploads', null);

  const router = new express.Router({});
  const json = express.json();
  app.use('/uploads', router);

  fs.ensureDirSync(app.config.source);

  const fileSystem = app.config.sourceFileSystem;

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

  async function getFiles(root) {
    const entries = await fileSystem.list(root);
    let files = [];
    for(let entry of entries) {
      if (entry.isDirectory()) {
        files = [...files, ...(await getFiles(pathJoin(root, entry.name)))];
      } else {
        files.push({
          ...entry,
          path: pathJoin(root, entry.name).substr(1)
        })
      }
    }

    return files;
  }

  router.get('/', catchExceptions(async (req, res) => {
    const files = await getFiles('/');

    const entries = await File.find();

    const byName = _.keyBy(entries, 'name');

    for (let stat of files) {
      let file = byName[stat.path] || new File({
        name: stat.path,
        state: 'complete',
        size: stat.size,
        uploaded: stat.size
      });

      if (byName[stat.path]) {
        file.set({
          size: stat.size,
          uploaded: stat.size
        });
      }
      await file.save();
      entries.push(file);
    }

    await File.deleteMany({
      name: {$not: {$in: files.map(file => file.name)}}
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
        await fileSystem.delete(`/${item.name}`);
      }
      catch (e) {
        console.info(`Unable to remove ${item.name}`);
      }
    }

    await File.deleteMany({_id: {$in: req.body}});
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

    const output = await fileSystem.write(req.query.name, {
      start: offset,
      append: offset !== 0
    });
    req
      .on('data', data => {
        numBytes += data.length;
        file.uploaded = offset + numBytes;
        throttledEmit('progress', file);
      })
      .on('close', handleClose)
      .on('end', handleClose)
      .pipe(output.stream);
  }));

  const fetchItem = catchExceptions(async (req, res, next) => {
    req.item = await File.findById(req.params.id);
    next(req.item ? null : 'route');
  });

  router.get('/items/:id/download', fetchItem, catchExceptions(async (req, res) => {
    res.setHeader('content-disposition', `attachment; filename="${req.item.name}"`);
    const redirect = await fileSystem.getSignedUrl(req.item.name);
    if (redirect) {
      res.redirect(redirect);
    } else {
      const input = await fileSystem.read(req.item.name);
      input.stream.pipe(res);
    }
  }));

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

  router.get('/items/:id/loudnorm', fetchItem, api(async req => {
    const source = sourceUtil.getSource(req, req.item.name);

    const {stereo} = req.item.audioStreams || await sourceUtil.guessChannelLayout(source);

    return await getNormalizeParameters(
      source,
      stereo.length > 1 ?
        ['-filter_complex', `[0:${stereo[0]}][0:${stereo[1]}]amerge=inputs=2[aout]`, '-map [aout]'] :
        ['-map', `0:${stereo[0]}`]
    );
  }));

  router.get('/assets', api(async () => Asset.find({state: 'processed'}).select('title').sort({createdAt: -1})));

  router.post('/items/:id/assign-to/:language/:assetId', fetchItem, api(async req => {
    return subtitles.convert(
      `http://localhost:${app.config.port}/player/streams/-/-`,
      req.params.assetId,
      `${app.config.source}/${req.item.name}`,
      req.params.language);
  }));
}
