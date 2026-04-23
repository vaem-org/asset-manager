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

import type { AxiosInstance } from 'axios'
import axios, { AxiosError } from 'axios'
import type { ReadStream } from 'node:fs'
import { Storage } from './index.js'

export class Bunny extends Storage {
  private axios: AxiosInstance

  constructor({ url }: { url: URL }) {
    super()
    const { host, hostname, username, password } = url
    const protocol = hostname === 'localhost' ? 'http' : 'https'
    this.axios = axios.create({
      baseURL: `${protocol}://${host}/${username}/`,
      headers: {
        AccessKey: password,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })
  }

  async upload(path: string, stream: ReadableStream): Promise<void> {
    try {
      await this.axios.put(path, stream)
    }
    catch (e) {
      if (e instanceof AxiosError) {
        throw new Error(`Error uploading ${e.config?.url} (${e.response?.status || 'unknown'}): ${e.response?.data ?? e.toString()}`)
      }
      else {
        throw e
      }
    }
  }

  async list(path: string): Promise<{ name: string, size: number, isDirectory: boolean }[]> {
    return (await this.axios.get<{
      ObjectName: string
      Length: number
      IsDirectory: boolean
    }[]>(path)).data
      .map(({ ObjectName, Length, IsDirectory }) => ({
        name: ObjectName,
        size: Length,
        isDirectory: IsDirectory,
      }))
  }

  async download(path: string): Promise<ReadStream> {
    return (await this.axios.get(path, {
      responseType: 'stream',
    })).data
  }

  async remove(path: string): Promise<void> {
    await this.axios.delete(path)
  }
}
