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

import { text } from 'node:stream/consumers'
import type { ReadStream } from 'node:fs'
import type { Manifest } from 'm3u8-parser'
import { Parser } from 'm3u8-parser'

/**
 * Parse an m3u8 stream
 */
export async function parseM3U8(stream: ReadStream): Promise<Manifest> {
  const parser = new Parser()
  parser.push(await text(stream))
  parser.end()
  return parser.manifest
}
