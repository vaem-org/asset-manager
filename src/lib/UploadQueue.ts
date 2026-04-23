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

import type { Stats } from 'node:fs'
import { createReadStream } from 'node:fs'
import { nextTick } from 'node:process'
import { EventEmitter } from 'node:events'
import { relative } from 'node:path'
import { open, unlink } from 'node:fs/promises'
import chokidar from 'chokidar'
import { config } from '#/config.js'
import type { Storage } from '#/lib/Storage/index.js'

export class UploadQueue extends EventEmitter {
  private readonly root: string
  private queue: string[]
  private workers: number
  private concurrency: number
  private storage: Storage

  /**
   * Create an upload queue with given storage
   */
  constructor(storage: Storage, concurrency: number = 4) {
    super()
    this.root = `${config.root}/var/output`
    this.queue = []
    this.workers = 0
    this.concurrency = concurrency
    this.storage = storage
  }

  /**
   * Start watching for files
   */
  start() {
    const addToQueue = (path: string) => {
      this.queue.push(path)
      if (this.workers < this.concurrency) {
        this.workers++
        this.process()
      }
    }

    /**
     * Add playlist, but only if it ends with 'x-endlist'
     * @return {Promise<void>}
     */
    const addPlaylist = async (path: string, stats: Stats) => {
      const input = await open(path, 'r')
      const shouldBe = '#EXT-X-ENDLIST\n'
      const toRead = shouldBe.length
      const { buffer } = await input.read(Buffer.alloc(toRead), 0, toRead, stats.size - toRead)
      const result = (buffer.toString() === shouldBe)
      await input.close()

      if (result) {
        addToQueue(path)
      }
    }

    chokidar.watch(this.root, {
      awaitWriteFinish: true,
      ignoreInitial: false,
    })
      .on('add', (path, stats) => {
        if (!path.endsWith('.m3u8')) {
          addToQueue(path)
        }
        else if (stats) {
          addPlaylist(path, stats)
            .catch(e => console.error(e))
        }
      })
      .on('change', (path, stats) => {
        if (path.endsWith('.m3u8') && stats) {
          addPlaylist(path, stats)
            .catch(e => console.error(e))
        }
      })
  }

  /**
   * Upload file to cloud storage
   * @param {string} file
   * @return {Promise<void>}
   */
  async upload(file: string) {
    const name = relative(this.root, file)
    let tries = 10
    let done = false
    while (tries > 0 && !done) {
      try {
        await this.storage.upload(
          name,
          createReadStream(file),
        )
        done = true
      }
      catch (_e) {
        await new Promise(accept => setTimeout(accept, 1000))
        console.warn(`Retrying upload of ${name}`)
        tries--
      }
    }
    if (!done) {
      throw new Error(`Unable to upload ${name}`)
    }
    await unlink(file)
    this.emit('uploaded', file)
  }

  /**
   * Process next upload if there is any
   */
  process() {
    const file = this.queue.shift()
    if (!file) {
      this.workers--
      return
    }

    this.upload(file)
      .catch((e) => {
        this.emit('error', e)
      })
      .finally(() => nextTick(() => {
        this.process()
      }))
  }
}
