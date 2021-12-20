/*
 * VAEM - Asset manager
 * Copyright (C) 2021  Wouter van de Molengraft
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
import { access, readdir, stat, writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { Storage } from './index.js';

export class Local extends Storage {
  /**
   *
   * @param {module:url.URL} url
   */
  constructor({ url }) {
    super({ url });
    this.root = url.pathname;
  }

  resolve(path) {
    if (path.includes('..')) {
      throw new Error(`Invalid path ${path}`);
    }

    return join(this.root, path);
  }

  async list(path) {
    const result = [];
    const absolutePath = this.resolve(path);
    for (let file of await readdir(absolutePath)) {
      const fileStat = await stat(join(absolutePath, file));
      result.push({
        name: file,
        size: fileStat.size,
        isDirectory: fileStat.isDirectory()
      })
    }
    return result;
  }

  async upload(path, stream) {
    const fullPath = this.resolve(path);
    await mkdir(dirname(fullPath), {
      recursive: true
    })
    await writeFile(fullPath, stream);
  }

  /**
   *
   * @param path
   * @returns {Promise<ReadStream>}
   */
  async download(path) {
    const fullPath = this.resolve(path);
    await access(fullPath);
    return createReadStream(fullPath);
  }

  async remove(path) {
    const fullPath = this.resolve(path);
    await rm(fullPath, {
      recursive: true
    })
  }
}
