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

import { glob } from 'glob'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import type { FileSchema } from '#~/model/File/index.js'
import { File } from '#~/model/File/index.js'

export default (schema: FileSchema, root: string) => {
  /**
   * Synchronise files with storage
   */
  schema.static('synchronise', async function () {
    const files = await glob('**', {
      nodir: true,
      cwd: root,
    })

    for (const name of files) {
      const { size } = await stat(join(root, name))
      const file = await this.findOne({ name }) ?? new File({
        name,
      })
      file.size = size
      await file.save()
    }

    await this.deleteMany({
      name: {
        $nin: files,
      },
      $or: [
        {
          sourceSize: 0,
        },
        {
          size: {
            $ne: 0,
          },
        },
      ],
    })
  })
}
