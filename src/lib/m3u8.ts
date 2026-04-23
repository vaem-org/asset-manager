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

import m3u8 from 'm3u8'
import type { ReadStream } from 'node:fs'

/**
 * Parse an m3u8 stream
 */
export function parseM3U8(stream: ReadStream): Promise<unknown> {
  return new Promise((accept, reject) => {
    const parser = m3u8.createStream()

    let error: boolean | null = null

    stream.pipe(parser)

    stream.on('error', (err) => {
      error = true
      reject(err)
    })

    parser.on('error', (err: Error) => {
      if (error) {
        return
      }
      error = true
      reject(err)
      parser.end()
    })

    parser.on('m3u', (m3u: unknown) => {
      if (error) {
        return
      }

      accept(m3u)
    })
  })
}
