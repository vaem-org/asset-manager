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

import {stringify as querystringStringify} from 'querystring'

const call = method => async (uri, data = null) => {
  const response = await fetch(uri, {
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json'
    },
    credentials: 'same-origin',
    method: method,
    body: data ? JSON.stringify(data) : null
  });

  const result = (await response.json());

  if (result.error) {
    throw result.error;
  }

  return result.result;
};

/**
 * Upload a single file to /_uploads
 * @param {String} url
 * @param {File} file
 * @param {Number} offset the offset in the file
 * @param {Function} onProgress
 * @return {Promise.<*>}
 */
const uploadFile = (url, file, offset = 0, onProgress = (() => {
})) => new Promise((accept, reject) => {
  const xhr = new XMLHttpRequest();

  xhr.open('PUT', url + '?' + querystringStringify({
    name: file.name,
    type: file.type,
    size: file.size,
    offset
  }));
  xhr.setRequestHeader('Content-Type', 'application/octet-stream');

  xhr.addEventListener('error', reject);
  xhr.upload.addEventListener('progress', onProgress);

  xhr.addEventListener('load', () => {
    let parsed = false;
    try {
      parsed = JSON.parse(xhr.responseText);
    }
    catch (e) {
      reject(e);
    }

    if (parsed && parsed.error) {
      reject(parsed.error)
    }
    else {
      accept(parsed.result);
    }
  });

  xhr.send(offset !== 0 ? file.slice(offset) : file);
});

export default {

  /**
   * Get a json response from given uri
   * @param {String} uri
   * @param {{}} [data]
   */
  get: call('GET'),
  post: call('POST'),
  put: call('PUT'),
  delete: call('DELETE'),

  uploadFile
};