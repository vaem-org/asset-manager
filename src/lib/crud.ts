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

function setDates(filter: string | object) {
  if (typeof filter === 'string') {
    return new Date(filter)
  }
  return Object.fromEntries(Object.entries(filter)
    .map(([key, value]) => [key, new Date(value)]),
  )
}

/**
 * Parse a filter string from the url query
 */
export function getFilter<T>({ filter, model }: { filter: undefined | string | ParsedQs | (string | ParsedQs)[], model: Model<T> }) {
  try {
    return filter
      ? Object.fromEntries(Object.entries(JSON.parse(filter.toString()))
          .map(([path, filter]) => {
            if (model.schema.paths[path]?.instance === 'Date'
              && (typeof filter === 'string' || typeof filter === 'object')
              && filter
            ) {
              return [path, setDates(filter)]
            }
            return [path, filter]
          }),
        )
      : {}
  }
  catch (e) {
    throw new HttpError(400, `Unable to parse filter "${filter}": ${e?.toString?.()}`)
  }
}
