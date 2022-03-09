/*
 * VAEM - Asset manager
 * Copyright (C) 2022  Wouter van de Molengraft
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

import { readdir, rmdir } from 'fs/promises';
import { join } from 'path';

/**
 * Remove any empty directories that exist in given path
 * @param {string} path
 * @returns {Promise<boolean>} true if and only if this directory has been removed
 */
export async function removeEmptyDirectories(path) {
  const entries = await readdir(path, {
    withFileTypes: true
  });

  let removed = 0;
  for(let subEntry of entries.filter(entry => entry.isDirectory())) {
    if (await removeEmptyDirectories(join(path, subEntry.name))) {
      removed = removed + 1;
    }
  }

  const isEmpty = (entries.length - removed) === 0;
  if (isEmpty) {
    await rmdir(path);
  }

  return isEmpty;
}
