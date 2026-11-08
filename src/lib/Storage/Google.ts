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

import type { ReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { posix } from 'node:path'
import type { Bucket, GetFilesOptions, GetFilesResponse } from '@google-cloud/storage'
import { Storage as GoogleCloudStorage } from '@google-cloud/storage'
import { Storage } from './index.js'

export class Google extends Storage {
  private bucket: Bucket
  private readonly prefix: string

  constructor({ url }: { url: URL }) {
    super()
    const keyFilename = url.searchParams.get('keyFilename') ?? undefined
    const projectId = url.searchParams.get('project') ?? url.searchParams.get('projectId') ?? undefined
    const storage = new GoogleCloudStorage({
      ...(keyFilename ? { keyFilename } : {}),
      ...(projectId ? { projectId } : {}),
    })

    this.bucket = storage.bucket(url.hostname)
    this.prefix = url.pathname.replace(/^\/+|\/+$/g, '')
  }

  private resolve(path: string): string {
    if (path.includes('..')) {
      throw new Error(`Invalid path ${path}`)
    }

    const cleanPath = path.replace(/^\/+/, '')
    const joined = this.prefix
      ? posix.join(this.prefix, cleanPath)
      : posix.normalize(cleanPath)

    return joined === '.' ? '' : joined.replace(/^\/+/, '')
  }

  async upload(path: string, stream: ReadableStream | ReadStream | string): Promise<void> {
    const file = this.bucket.file(this.resolve(path))

    if (typeof stream === 'string') {
      await file.save(stream, {
        resumable: false,
      })
      return
    }

    const readable = stream instanceof Readable
      ? stream
      : Readable.fromWeb(stream as unknown as WebReadableStream)

    await pipeline(
      readable,
      file.createWriteStream({
        resumable: false,
      }),
    )
  }

  async download(path: string): Promise<ReadStream> {
    const resolved = this.resolve(path)
    const file = this.bucket.file(resolved)
    const [exists] = await file.exists()
    if (!exists) {
      throw new Error(`File not found: ${resolved}`)
    }

    return file.createReadStream() as unknown as ReadStream
  }

  async list(path: string): Promise<{ name: string, size: number, isDirectory: boolean }[]> {
    const resolved = this.resolve(path).replace(/\/+$/, '')
    const prefix = resolved ? `${resolved}/` : ''

    const result: { name: string, size: number, isDirectory: boolean }[] = []
    let query: GetFilesOptions | null = {
      prefix,
      delimiter: '/',
      autoPaginate: false,
    }

    while (query) {
      const [files, nextQuery, apiResponse]: GetFilesResponse = await this.bucket.getFiles(query)

      for (const dirPrefix of (apiResponse as { prefixes?: string[] })?.prefixes ?? []) {
        result.push({
          name: dirPrefix.slice(prefix.length).replace(/\/$/, ''),
          size: 0,
          isDirectory: true,
        })
      }

      for (const file of files) {
        const name = file.name.slice(prefix.length)
        if (!name) {
          continue
        }

        result.push({
          name,
          size: Number(file.metadata.size ?? 0),
          isDirectory: false,
        })
      }

      query = nextQuery
    }

    return result
  }

  async remove(path: string): Promise<void> {
    const resolved = this.resolve(path)

    if (path.endsWith('/')) {
      const prefix = resolved.endsWith('/') ? resolved : `${resolved}/`
      await this.bucket.deleteFiles({
        prefix,
        force: true,
      })
      return
    }

    await this.bucket.file(resolved).delete({
      ignoreNotFound: true,
    })
  }
}
