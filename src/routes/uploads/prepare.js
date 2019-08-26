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

import { json, Router } from 'express';
import { api, verify } from '@/util/express-helpers';
import { File } from '@/model/file';
import { socketio } from '@/util/socketio';

const router = new Router({
  mergeParams: true
});

router.use(verify);

const io = socketio.of('/uploads', null);

router.post('/', json(), api(async req => {
  const files = [];
  const newFiles = [];
  for (let file of req.body) {
    let item = await File.findOne({ name: file.name });
    if (!item) {
      item = new File({
        ...file,
        state: 'prepared'
      });
      await item.save();
      newFiles.push(item);
    }
    files.push(item.toObject());
  }

  if (newFiles.length > 0) {
    io.emit('created', { files: newFiles });
  }

  return files;
}));

export default router;