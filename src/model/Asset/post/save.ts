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

import { config } from '#~/config.js'
import axios from 'axios'
import type { AssetSchema } from '#~/model/Asset/index.js'

export default (schema: AssetSchema) => {
  schema.post('save', function () {
    if (config.webhooks.saved) {
      const parsed = new URL(config.webhooks.saved)
      axios.post(parsed.origin + parsed.pathname + parsed.search, {
        id: this._id,
      }, {
        headers: parsed.password
          ? {
              authorization: `Bearer ${parsed.password}`,
            }
          : {},
      }).catch((e) => {
        console.warn(`Unable to post webhook message: ${e.toString()}`)
      })
    }
  })
}
