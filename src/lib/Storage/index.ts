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

export abstract class Storage {
  /**
   * Upload a file
   */
  abstract upload(path: string, stream: ReadableStream | ReadStream | string): Promise<void>

  /**
   * Download a file
   * @param path
   */
  abstract download(path: string): Promise<ReadStream>

  /**
   * List entries for given path
   */
  abstract list(path: string): Promise<{ name: string, size: number, isDirectory: boolean }[]>

  /**
   * Remove recursively files for given path
   */
  abstract remove(path: string): Promise<void>
}
