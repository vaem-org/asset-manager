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

import { createReadStream } from 'fs';
import { nextTick } from 'process';
import { EventEmitter } from 'events';
import { relative } from 'path';
import chokidar from 'chokidar';
import { config } from '#~/config';
import { unlink } from 'fs/promises';
import { open } from 'node:fs/promises';

export class UploadQueue extends EventEmitter {
  /**
   * Create an upload queue with given storage
   * @param {Number} concurrency
   * @param {Storage} storage
   */
  constructor({ concurrency = 4, storage }) {
    super();
    this.root = `${config.root}/var/output`;
    this.queue = [];
    this.workers = 0;
    this.concurrency = concurrency;
    this.storage = storage;
  }

  /**
   * Start watching for files
   */
  start() {
    const addToQueue = path => {
      this.queue.push(path);
      if (this.workers < this.concurrency) {
        this.workers++;
        this.process();
      }
    };

    /**
     * Add playlist, but only if it ends with 'x-endlist'
     * @param {string} path
     * @param {Stats} stats
     * @return {Promise<void>}
     */
    const addPlaylist = async (path, stats) => {
      const input = await open(path, 'r');
      const shouldBe = '#EXT-X-ENDLIST\n';
      const toRead = shouldBe.length;
      const { buffer } = await input.read(Buffer.alloc(toRead), 0, toRead, stats.size - toRead);
      const result = (buffer.toString() === shouldBe);
      await input.close()

      if (result) {
        addToQueue(path);
      }
    };

    chokidar.watch(this.root, {
      awaitWriteFinish: true,
      ignoreInitial: false
    })
    .on('add', (path, stats) => {
      if (!path.endsWith('.m3u8')) {
        addToQueue(path)
      } else {
        addPlaylist(path, stats)
          .catch(e => console.error(e))
      }
    })
      .on('change', (path, stats) => {
        if (path.endsWith('.m3u8')) {
          addPlaylist(path, stats)
            .catch(e => console.error(e))
        }
      })
    ;
  }

  /**
   * Upload file to cloud storage
   * @param {string} file
   * @return {Promise<void>}
   */
  async upload(file) {
    const name = relative(this.root, file);
    let tries = 10;
    let done = false;
    while (tries > 0 && !done) {
      try {
        await this.storage.upload(
          name,
          createReadStream(file)
        );
        done = true;
      }
      catch (e) {
        await new Promise(accept => setTimeout(accept, 1000));
        console.warn(`Retrying upload of ${name}`);
        tries--;
      }
    }
    if (!done) {
      throw new Error(`Unable to upload ${name}`);
    }
    await unlink(file);
    this.emit('uploaded', file);
  }

  /**
   * Process next upload if there is any
   */
  process() {
    if (this.queue.length === 0) {
      this.workers--;
      return;
    }

    const file = this.queue.shift();
    this.upload(file)
    .catch(e => {
      this.emit('error', e);
    })
    .finally(() => nextTick(() => {
      this.process();
    }));
  }
}
