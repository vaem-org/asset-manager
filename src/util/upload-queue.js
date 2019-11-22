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

import { EventEmitter } from 'events';
import { createReadStream, unlink } from 'fs';
import { dirname } from 'path';
import config from '@/config';

const queue = [];

export const events = new EventEmitter();

let processing = false;

const ensured = new Set();

const ensureDir = async dirname => {
  if (ensured.has(dirname)) {
    return;
  }

  await config.destinationFileSystem.ensureDir(dirname);
  ensured.add(dirname);
};

async function next() {
  if (queue.length === 0) {
    processing = false;
    return;
  }
  processing = true;

  const filename = queue.shift();
  await ensureDir(dirname(filename));
  const { stream } = await config.destinationFileSystem.write(filename);

  console.log(`Uploading ${filename}`);
  const tempFilename = `${config.root}/var/tmp${filename}`;

  await (new Promise((accept, reject) => {
    stream
      .on('done', accept)
      .on('error', reject)
    ;

    createReadStream(tempFilename)
      .on('error', reject)
      .pipe(stream);
  }));

  unlink(tempFilename, err => {
    if (err) {
      console.warn(`Unable to remove ${tempFilename}`);
    }
  });

  events.emit(filename);
  return next();
}

/**
 * Add a local file for uploading to destination filesystem
 * @param {String} filename
 */
export function addToQueue(filename) {
  queue.push(filename);

  if (!processing) {
    next()
      .catch(e => {
        console.error(`Error uploading file: ${e.toString()}`);
      })
    ;
  }
}

/**
 * Wait for an upload to have completed. Returns immediately when the file already
 * exists on the destination filesystem.
 * @param {String} filename
 * @returns {Promise}
 */
export async function waitFor(filename) {
  try {
    await config.destinationFileSystem.get(filename);
    return;
  }
  catch (e) {
  }

  return new Promise(accept => {
    events.once(filename, accept);
  });
}