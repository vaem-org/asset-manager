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

import { Bunny } from './Bunny.js'
import { Local } from './Local.js'
import type { Storage } from './index.js'

/**
 * Get a storage instance
 */
export function createStorage(url: URL): Storage {
  switch (url.protocol) {
    case 'file:':
      return new Local({ url })
    case 'bunny:':
      return new Bunny({ url })

    default:
      throw new Error(`Unknown protocol for ${url}`)
  }
}
