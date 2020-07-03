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

import {createHash} from 'crypto';
import config from '@/config';
import axios from 'axios';

export function getSignedUrl(path, expires) {
  const digest = createHash('md5')
    .update(config.bunnyCDN.authenticationKey + path + expires)
    .digest('base64')
  ;

  const token = digest
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/\=/g, '')
  ;

  return `https://${config.bunnyCDN.hostname}.b-cdn.net${path}?token=${token}&expires=${expires}`;
}

export async function purgeCache(path) {
  if (config.bunnyCDN) {
    return;
  }

  await axios.post('https://bunnycdn.com/api/purge', null, {
    params: {
      url: `https://${config.bunnyCDN.hostname}.b-cdn.net${path}`
    },
    headers: {
      AccessKey: config.bunnyCDN.apiKey
    }
  });
}
