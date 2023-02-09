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

import { config } from '#~/config';
import axios from 'axios';
import { createReadStream, createWriteStream } from 'fs';
import { basename } from 'path';

const { username, origin } = config.subtitleEditApiUrl ? new URL(config.subtitleEditApiUrl) : {};

const api = axios.create({
  baseURL: origin,
  headers: {
    authorization: `Bearer ${username}`
  }
})

/**
 * Convert a subtitle file
 * @param {String} source
 * @param {String} destination
 */
export async function convert(source, destination) {
  const { data } = await api.post(basename(source), createReadStream(source), {
    responseType: 'stream'
  });

  data.pipe(createWriteStream(destination));

  await new Promise((resolve, reject) => {
    data.on('end', resolve);
    data.on('error', reject);
  });
}
