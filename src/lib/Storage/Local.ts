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

import { createReadStream } from 'node:fs'
import type { ReadStream } from 'node:fs'
import { access, readdir, stat, writeFile, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { Storage } from './index.js'

export class Local extends Storage {
  private readonly root: string

  constructor({ url }: { url: URL }) {
    super()
    this.root = url.pathname
  }

  resolve(path: string): string {
    if (path.includes('..')) {
      throw new Error(`Invalid path ${path}`)
    }

    return join(this.root, path)
  }

  async list(path: string): Promise<{
    name: string
    size: number
    isDirectory: boolean
  }[]> {
    const result = []
    const absolutePath = this.resolve(path)
    for (const file of await readdir(absolutePath)) {
      const fileStat = await stat(join(absolutePath, file))
      result.push({
        name: file,
        size: fileStat.size,
        isDirectory: fileStat.isDirectory(),
      })
    }
    return result
  }

  async upload(path: string, stream: ReadableStream): Promise<void> {
    const fullPath = this.resolve(path)
    await mkdir(dirname(fullPath), {
      recursive: true,
    })
    await writeFile(fullPath, stream)
  }

  async download(path: string): Promise<ReadStream> {
    const fullPath = this.resolve(path)
    await access(fullPath)
    return createReadStream(fullPath)
  }

  async remove(path: string): Promise<void> {
    const fullPath = this.resolve(path)
    await rm(fullPath, {
      recursive: true,
    })
  }
}
