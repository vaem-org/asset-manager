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
import type { Model, Schema } from 'mongoose'
import mongoose from 'mongoose'
import type { CustomRequest } from '#~/lib/express-helpers.js'
import { api, useRouter } from '#~/lib/express-helpers.js'
import { getFilter, save } from '#~/lib/crud.js'

import { Asset } from '#~/model/Asset/index.js'
import { Job } from '#~/model/Job/index.js'
import type { FileModelType } from '#~/model/File/index.js'
import { File } from '#~/model/File/index.js'
import { HttpError } from '#~/lib/HttpError.js'

import distinct from './distinct/index.js'
import count from './count.js'
import info from './info.js'
import _id from './[id].js'

const { Types: { ObjectId } } = mongoose

export default (router: Router) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const models = new Map<string, Model<any, any, any, any>>([
    ['assets', Asset],
    ['jobs', Job],
    ['files', File],
  ])

  router.use((req: CustomRequest, res, next) => {
    if (!models.has(req.params.model.toString())) {
      return res.status(404).end()
    }

    req.model = models.get(req.params.model.toString())

    next()
  })

  count(router)
  info(router)
  useRouter(router, '/distinct', distinct)
  _id(router)

  const writableFields: Record<string, string[]> = {
    assets: ['title', 'labels', 'public', 'deleted'],
    files: ['name', 'sourceSize'],
    jobs: ['state'],
  }

  router.get('/', api(async ({ model, query }: CustomRequest, res) => {
    if (!model) {
      throw new HttpError(400)
    }

    let filter = getFilter<unknown>({
      model,
      filter: query.filter,
    })

    if (typeof query.q === 'string' && ObjectId.isValid(query.q)) {
      filter._id = query.q
    }
    else if (query.q) {
      const searchPaths: string[] = (model!.schema.searchPaths ?? Object.values((model.schema as Schema).paths)
        .filter(({ instance, path }) => instance === 'String' && !['hls_enc_key', 'hls_enc_iv'].includes(path))
        .map(({ path }) => path))

      const q = typeof query.q === 'string' ? query.q.slice(0, 128) : undefined
      const escapedQ = (q ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = model!.schema.searchExact && q
        ? q.trim()
        : new RegExp(escapedQ, 'i')

      filter = {
        ...filter,
        $or: searchPaths
          .map((path: string) => ({ [path]: regex })),
      }
    }

    const page = Math.max(1, parseInt((query.page ?? '1').toString(), 10) || 1)
    const per_page = Math.min(100, Math.max(1, parseInt((query.per_page ?? '20').toString(), 10) || 20))
    const sort = query.sort || '-createdAt'
    const total = await model!.countDocuments(filter)
    const populate = (query.populate ?? '')
      .toString()
      .split(',')
      .filter(v => v && Boolean((model.schema as Schema).paths[v]))
      .slice(0, 5)
    res.setHeader('x-total', total)
    res.setHeader('Access-Control-Expose-Headers', 'x-total')

    if (typeof (model as unknown as FileModelType).synchronise !== 'undefined' && page === 1 && !query.q) {
      await (model as unknown as FileModelType).synchronise()
    }

    return (await model!
      .find(filter)
      .sort(sort.toString())
      .populate(populate)
      .skip((page - 1) * per_page)
      .limit(per_page)
    ).map(doc => doc.toJSON())
  }))

  router.post('/', api(async ({ body, model, params }) => {
    const allowed = writableFields[params.model.toString()] ?? []
    const sanitized = Object.fromEntries(
      Object.entries(body && typeof body === 'object' ? body : {})
        .filter(([k]) => allowed.includes(k)),
    )
    const doc = new model!(sanitized)
    await save(doc)

    return doc.toJSON()
  }))
}
