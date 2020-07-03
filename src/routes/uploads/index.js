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
import fs from 'fs-extra';
import { Router } from 'express';
import _ from 'lodash';
import { join } from 'path';
import moment from 'moment';

import { api, catchExceptions, verify } from '@/lib/express-helpers';
import { File } from '@/model/file';
import { socketio } from '@/lib/socketio';
import { listDocuments } from '@/lib/list-documents';

const io = socketio.of('/uploads', null);

const router = new Router({});

router.use(verify);

fs.ensureDirSync(config.source);

const fileSystem = config.sourceFileSystem;

async function getFiles(root) {
  const entries = await fileSystem.list(root);
  let files = [];
  for (let entry of entries) {
    if (entry.isDirectory()) {
      files = [...files, ...(await getFiles(join(root, entry.name)))];
    } else {
      files.push({
        ...entry,
        path: join(root, entry.name).substr(1)
      })
    }
  }

  return files;
}

router.get('/', api(async req => {
  if (!req.query.q) {
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
      name: { $not: { $in: files.map(file => file.path) } },
      updatedAt: { $lt: moment().subtract(60, 'seconds')},
      state: { $ne: 'prepared' }
    });
  }

  return listDocuments(req, File, req.query.q ? {
    name: {
      $regex: req.query.q,
      $options: 'i'
    }
  } : {});
}));

router.put('/:name', catchExceptions(async (req, res) => {
  let numBytes = 0;
  const offset = parseInt(req.query.offset) || 0;

  const throttledEmit = _.throttle(io.emit.bind(io), 250);

  const name = decodeURIComponent(req.params.name);

  const file = await File.findOne({ name });

  if (!file) {
    throw {
      status: 404
    }
  }

  let closed = false;
  const handleClose = () => {
    if (closed) {
      return;
    }

    closed = true;
    file.state = file.uploaded === file.size ? 'complete' : 'idle';
    file.uploaded = offset + numBytes;
    file.save();

    io.emit('progress', file);
    return res.json({
      id: file._id
    });
  };

  const output = await fileSystem.write(name, {
    start: offset,
    append: offset !== 0
  });

  file.state = 'uploading';
  await file.save();

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

export default router;
