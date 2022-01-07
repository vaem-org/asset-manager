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

/**
 * Save a document and report errors if there are any
 * @param doc
 * @return {Promise<void>}
 */
export async function save (doc) {
  try {
    await doc.save();
  }
  catch (e) {
    if (!e.errors) {
      console.error(e)
    }

    throw {
      status: 400,
      errors: Object.fromEntries(
        Object.entries(e.errors ?? {})
        .map(([path, {
          kind,
          message,
          name
        }]) => [path, {
          kind,
          message,
          name
        }])
      ),
      message: e._message || e.toString()
    }
  }
}

function setDates (filter) {
  if (typeof filter === 'string') {
    return new Date(filter)
  }
  return Object.fromEntries(Object.entries(filter)
    .map(([key, value]) => [key, new Date(value)])
  )
}

/**
 * Parse a filter string from the url query
 * @param {String} filter a json stringified string
 * @param {model} model
 * @return {{}}
 */
export function getFilter ({ filter, model }) {
  try {
    return filter ? Object.fromEntries(Object.entries(JSON.parse(filter))
      .map(([path, filter]) => {
        if (model.schema.paths[path]?.instance === 'Date') {
          return [path, setDates(filter)]
        }
        return [path, filter];
      })
    ) : {}
  }
  catch (e) {
    throw {
      status: 400,
      message: `Unable to parse filter "${filter}": ${e.toString()}`
    }
  }
}
