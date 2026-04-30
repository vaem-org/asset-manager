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

import type { Router } from 'express'
import { api } from '#~/lib/express-helpers.js'
import { HttpError } from '#~/lib/HttpError.js'
import type { Schema, SchemaType } from 'mongoose'

interface Virtual {
  options?: Record<string, unknown>
  [key: string]: unknown
}

export default (router: Router) => {
  router.get('/info', api(async ({ model }) => {
    if (!model) {
      throw new HttpError(500)
    }

    return {
      paths: Object.fromEntries(
        [
          ...Object.entries((model.schema as Schema).paths)
            .map(([key, schema]: [string, SchemaType & {
              enumValues?: unknown[]
            }]) => {
              return [
                key,
                {
                  path: schema.path,
                  enumValues: schema.enumValues ?? [],
                  ref: schema.options.ref,
                  instance: schema.options.ui?.type ?? schema.instance,
                  label: schema.options.ui?.label,
                },
              ]
            }),
          ...Object.entries((model.schema as Schema).virtuals as Record<string, Virtual>)
            .filter(([key]) => key !== 'id')
            .map(([key, { path, options }]) => [
              key,
              {
                path,
                instance: 'virtual',
                virtual: true,
                ...options,
              },
            ]),
        ],
      ),
    }
  }))
}
