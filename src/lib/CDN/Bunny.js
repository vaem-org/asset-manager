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

import { createHash } from 'crypto';
import { CDN } from './index.js';

export class Bunny extends CDN {
  constructor({ url }) {
    super({ url });
    this.authenticationKey = url.password;
    this.host = url.host;
  }

  getSignedUrl(url, validity) {
    const [path, query] = url.split('?');
    const expires = Math.floor(Date.now()/1000) + validity;
    const digest = createHash('md5')
      .update(this.authenticationKey + path + expires)
      .digest('base64')
    ;

    const token = digest
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    ;

    return `https://${this.host}${path}?${query ? `${query}&` : ''}token=${token}&expires=${expires}`;
  }
}
