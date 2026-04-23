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

/**
 * Save a document and report errors if there are any
 */
export async function save(doc: Document) {
  try {
    await doc.save()
  }
  catch (e) {
    const validationError = e instanceof MongooseError.ValidationError ? e : undefined
    if (!validationError) {
      console.error(e)
    }

    throw {
      status: 400,
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
      message: validationError?.message ?? e?.toString?.(),
    }
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
export function getFilter<T>({ filter, model }: { filter: string, model: Model<T> }) {
  try {
    return filter
      ? Object.fromEntries(Object.entries(JSON.parse(filter))
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
    throw {
      status: 400,
      message: `Unable to parse filter "${filter}": ${e?.toString?.()}`,
    }
  }
}
