/*
 * VAEM - Asset manager
 * Copyright (C) 2026  Wouter van de Molengraft
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

import { mkdir } from 'fs/promises'
import mongoose from 'mongoose'
import { config } from '#~/config.js'
import { Local } from '#~/lib/Storage/Local.js'
import { UploadQueue } from '#~/lib/UploadQueue.js'

/**
 * Common app initialisation for server and console
 * @param {boolean} createUploadQueue Create an upload queue (when not using local storage)
 * @returns {Promise<void>}
 */
export async function initialisation({ createUploadQueue = false } = {}) {
  await mongoose.connect(config.mongoUrl, {
    autoIndex: true,
  })

  // make sure output directory exists before creating upload queue
  const output = `${config.root}/var/output`
  await mkdir(output, {
    recursive: true,
  })

  if (createUploadQueue && !(config.storage instanceof Local)) {
    config.uploadQueue = new UploadQueue(config.storage)
    config.uploadQueue?.start?.()
  }
}
