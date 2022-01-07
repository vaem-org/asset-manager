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

import axios from 'axios';
import { Storage } from './index.js';

export class Bunny extends Storage {
  /**
   * @param {module:url.URL} url
   */
  constructor({ url }) {
    super({ url });
    const { host, hostname, username, password } = url;
    const protocol = hostname === 'localhost' ? 'http' : 'https';
    this.axios = axios.create({
      baseURL: `${protocol}://${host}/${username}/`,
      headers: {
        'AccessKey': password
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  async upload(path, stream) {
    try {
      await this.axios.put(path, stream);
    }
    catch (e) {
      throw new Error(`Error uploading ${e.config?.url} (${e.response?.status || 'unknown'}): ${e.response?.data ?? e.toString()}`)
    }
  }

  async list(path) {
    return (await this.axios.get(path)).data
      .map(({ ObjectName, Length, IsDirectory }) => ({
        name: ObjectName,
        size: Length,
        isDirectory: IsDirectory
      }))
  }

  async download(path) {
    return (await this.axios.get(path, {
      responseType: 'stream'
    })).data
  }

  async remove(path) {
    await this.axios.delete(path)
  }
}
