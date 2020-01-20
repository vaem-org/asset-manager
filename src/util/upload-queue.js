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

let processing = 0;

const ensured = new Set();

const current = new Set();

async function ensureDir(dirname) {
  if (ensured.has(dirname)) {
    return;
  }

  await config.destinationFileSystem.ensureDir(dirname);
  ensured.add(dirname);
}

async function upload(source, destination) {
  const { stream } = await config.destinationFileSystem.write(destination);
  await new Promise((accept, reject) => {
    const input = createReadStream(source)
    .on('error', reject);

    stream
    .on('error', reject)
    .on('done', accept)
    ;

    input.pipe(stream);
  });
}

async function next() {
  if (queue.length === 0) {
    processing--;
    return;
  }

  const filename = queue.shift();
  await ensureDir(dirname(filename));

  const tempFilename = `${config.root}/var/tmp${filename}`;

  current.add(filename);
  let tries = 10;
  let done = false;
  while(tries > 0 && !done) {
    try {
      await upload(tempFilename, filename);
      done = true;
    } catch (e) {
      tries--;

      console.info(`Retrying ${filename} (${e.toString()}`);
      // wait for 2 seconds and try again
      await (new Promise(accept => setTimeout(accept, 2000)));
    }
  }
  if (!done) {
    console.error(`Unable to upload ${filename}`);
    process.exit(1);
  }

  unlink(tempFilename, err => {
    if (err) {
      console.warn(`Unable to remove ${tempFilename}`);
    }
  });

  current.delete(filename);
  process.nextTick(() => {
    if (filename.endsWith('.m3u8')) {
      console.log(`Emitting event for ${filename}`);
    }
    events.emit(filename);
  });

  return next();
}

/**
 * Add a local file for uploading to destination filesystem
 * @param {String} filename
 */
export function addToQueue(filename) {
  queue.push(filename);

  if (processing < 2) {
    processing++;
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
  if (current.has(filename)) {
    try {
      const item = await config.destinationFileSystem.get(filename);
      if (item) {
        return;
      }
    }
    catch (e) {
    }
  }

  return new Promise(accept => {
    events.once(filename, accept);
  });
}
