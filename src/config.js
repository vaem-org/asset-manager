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
import 'dotenv/config';
import { dirname } from 'path';
import { fileURLToPath, URL } from 'url';

const port = parseInt(process.env.PORT) || 5000;

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (!process.env.SECRET) {
  throw new Error('Environment variable SECRET not found.');
}

let auth = null;
const authUrl = process.env.AUTH_URL && new URL(process.env.AUTH_URL);
if (authUrl?.protocol === 'google:') {
  auth = {
    provider: 'google',
    clientId: authUrl.username,
    clientSecret: authUrl.password,
    hd: authUrl.hostname
  }
}

export const config = {
  port,
  root,
  auth,

  base: process.env.BASE ?? 'http://localhost:5000',
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:33206/app',
  storageUrl: process.env.STORAGE_URL ?? `file://${root}/var/output`,
  cdnUrl: process.env.CDN_URL,
  secret: process.env.SECRET,
  skipAuth: process.env.SKIP_AUTH === '1',
  apiTokens: (process.env.API_TOKENS ?? '')
    .split(',')
    .filter(Boolean),

  webhooks: {
    finished: process.env.WEBHOOK_FINISHED,
    saved: process.env.WEBHOOK_SAVED
  },

  /**
   * @type {Storage}
   */
  storage: null,

  /**
   * @type {CDN}
   */
  cdn: null,

  /**
   * @type {UploadQueue}
   */
  uploadQueue: null
};
