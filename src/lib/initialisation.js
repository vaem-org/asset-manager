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

import { mkdir } from 'fs/promises';
import { URL } from 'url';
import mongoose from 'mongoose';
import { config } from '#~/config';
import { createStorage } from '#~/lib/Storage/factory';
import { createCDN } from '#~/lib/CDN/factory';
import { Local } from '#~/lib/Storage/Local';
import { UploadQueue } from '#~/lib/UploadQueue';

/**
 * Common app initialisation for server and console
 * @param {boolean} createUploadQueue Create an upload queue (when not using local storage)
 * @returns {Promise<void>}
 */
export async function initialisation({ createUploadQueue=false }={}) {
  await mongoose.connect(config.mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    autoIndex: true
  });

  // make sure output directory exists before creating upload queue
  const output = `${config.root}/var/output`;
  await mkdir(output, {
    recursive: true
  });

  config.storage = createStorage(new URL(config.storageUrl));
  config.cdn = config.cdnUrl && createCDN(new URL(config.cdnUrl));

  if (createUploadQueue && !(config.storage instanceof Local)) {
    config.uploadQueue = new UploadQueue({
      storage: config.storage
    });
    config.uploadQueue.start();
  }
}
