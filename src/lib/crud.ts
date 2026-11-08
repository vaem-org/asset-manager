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

import type { Document, Model } from 'mongoose'
import { Error as MongooseError } from 'mongoose'
import type { ParsedQs } from 'qs'
import { HttpError } from '#~/lib/HttpError.js'

/**
 * Save a document and report errors if there are any
 */
export async function save(doc: Document<unknown>) {
  try {
    await doc.save()
  }
  catch (e) {
    const validationError = e instanceof MongooseError.ValidationError ? e : undefined
    if (!validationError) {
      console.error(e)
    }

    throw new HttpError(404, validationError?.message ?? e?.toString?.(), {
      errors: Object.fromEntries(
        Object.entries(validationError?.errors ?? {})
          .map(([path, {
            kind,
            message,
            name,
          }]) => [path, {
            kind,
            message,
            name,
          }]),
      ),
    })
  }
}

const allowedDateOperators = new Set(['$gt', '$gte', '$lt', '$lte'])

function setDates(filter: string | object) {
  if (typeof filter === 'string') {
    return new Date(filter)
  }
  if (Array.isArray(filter)) {
    throw new Error('Date filter cannot be an array')
  }
  return Object.fromEntries(Object.entries(filter)
    .map(([key, value]) => {
      if (!allowedDateOperators.has(key) || (typeof value !== 'string' && typeof value !== 'number')) {
        throw new Error(`Invalid date filter operator: ${key}`)
      }
      return [key, new Date(value)]
    }),
  )
}

/**
 * Parse a filter string from the url query
 */
export function getFilter<T>({ filter, model }: { filter: undefined | string | ParsedQs | (string | ParsedQs)[], model: Model<T> }) {
  try {
    if (!filter) return {}
    const parsed = JSON.parse(filter.toString())
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Filter must be a JSON object')
    }
    const forbiddenPaths = new Set(['hls_enc_key', 'hls_enc_iv'])
    return Object.fromEntries(Object.entries(parsed)
      .filter(([path]) => !path.startsWith('$') && !forbiddenPaths.has(path) && Boolean(model.schema.paths[path]))
      .map(([path, value]) => {
        if (model.schema.paths[path]?.instance === 'Date'
          && (typeof value === 'string' || typeof value === 'object')
          && value
        ) {
          return [path, setDates(value)]
        }
        if (value && typeof value === 'object') {
          throw new Error(`Nested query operators are not allowed for path ${path}`)
        }
        return [path, value]
      }),
    )
  }
  catch (e) {
    throw new HttpError(400, `Unable to parse filter "${filter}": ${e?.toString?.()}`)
  }
}
