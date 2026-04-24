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

import { extname } from 'path'
import type { FileSchema } from '#~/model/File/index.js'

export default (schema: FileSchema) => {
  schema.pre('save', function () {
    const extension = extname(this.name).toLowerCase()

    let type: typeof this.type = 'unknown'
    if (['.mxf', '.mov', '.mkv', '.mpg', '.mp4', '.264', '.avi', '.ts', '.vob'].includes(extension)) {
      type = 'video'
    }
    else if (['.890', '.stl', '.pac', '.srt', '.vtt', '.itt', '.ttml'].includes(extension)) {
      type = 'subtitle'
    }

    this.type = type
  })
}
