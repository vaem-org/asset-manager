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

import { createHmac } from 'node:crypto'
import { posix } from 'node:path'
import { GoogleAuth } from 'google-auth-library'

import { CDN } from './index.js'

export class Google extends CDN {
  private readonly keyName: string
  private readonly key: Buffer
  private readonly host: string
  private readonly basePath: string
  private readonly urlMap: string | null
  private readonly project: string | null
  private readonly auth: GoogleAuth

  constructor({ url }: { url: URL }) {
    super()
    this.keyName = decodeURIComponent(url.username)
    this.key = Buffer.from(decodeURIComponent(url.password), 'base64url')
    this.host = url.host
    this.basePath = url.pathname.replace(/\/+$/, '')
    this.urlMap = url.searchParams.get('urlMap')
    this.project = url.searchParams.get('project') ?? url.searchParams.get('projectId')

    const keyFilename = url.searchParams.get('keyFilename') ?? undefined
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      ...(keyFilename ? { keyFilename } : {}),
      ...(this.project ? { projectId: this.project } : {}),
    })
  }

  private resolvePath(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`
    return this.basePath
      ? posix.join(this.basePath, normalized)
      : normalized
  }

  getSignedUrl(url: string, validity: number): string {
    const [path, query] = url.split('?')
    const expires = Math.floor(Date.now() / 1000) + validity
    const fullPath = this.resolvePath(path)
    const urlToSign = `https://${this.host}${fullPath}?${query ? `${query}&` : ''}Expires=${expires}&KeyName=${this.keyName}`

    const signature = createHmac('sha1', this.key)
      .update(urlToSign)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    return `${urlToSign}&Signature=${signature}`
  }

  async purge(path: string): Promise<void> {
    if (!this.urlMap) {
      throw new Error('Missing urlMap parameter for Google Cloud CDN purge')
    }

    const projectId = this.project ?? await this.auth.getProjectId()
    const client = await this.auth.getClient()

    await client.request({
      url: `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId)}/global/urlMaps/${encodeURIComponent(this.urlMap)}/invalidateCache`,
      method: 'POST',
      data: {
        host: this.host,
        path: this.resolvePath(path),
      },
    })
  }
}
