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

/* eslint-disable no-unused-vars */

export class Storage {
  /**
   *
   * @param {module:url.URL} url
   */
  constructor({ url }) {
  }

  /**
   * Upload a file
   * @param {string} path
   * @param {ReadableStream} stream
   * @returns {Promise<void>}
   */
  async upload(path, stream) {
    throw new Error('Unimplemented');
  }

  /**
   * Download a file
   * @param path
   * @returns {Promise<ReadableStream>}
   */
  async download(path) {
    throw new Error('Unimplemented')
  }

  /**
   * List entries for given path
   * @param {string} path
   * @returns {Promise<[{ name: String, size: Number, isDirectory: Boolean }]>}
   */
  async list(path) {
    throw new Error('Unimplemented');
  }

  /**
   * Remove recursively files for given path
   * @param {string} path
   * @return {Promise<void>}
   */
  async remove(path) {
    throw new Error('Unimplemented');
  }
}
