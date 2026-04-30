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
import { save } from '#~/lib/crud.js'
import { api, getDocument } from '#~/lib/express-helpers.js'

export default (router: Router) => {
  router.get('/:id', api(async ({ params: { id }, model }) => {
    const doc = id === 'new' ? new model!() : await getDocument(model!, id)

    return doc.toJSON()
  }))

  router.put('/:id', api(async ({ body, model, params: { id } }) => {
    const doc = id === 'new' ? new model!() : await getDocument(model!, id)
    doc.set(body)
    await save(doc)
    return doc.toJSON()
  }))

  router.delete('/:id', api(async ({ model, params: { id } }) => {
    const doc = await getDocument(model!, id)
    return doc.deleteOne()
  }))
}
