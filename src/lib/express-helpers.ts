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

import type { HydratedDocument, Model } from 'mongoose'
import { Types } from 'mongoose'
import type { Request, Response, NextFunction } from 'express'
import { Router } from 'express'
import { HttpError } from '#/lib/HttpError.js'

/**
 * Wrap an async function into middleware
 */
export function api(fn: (req: Request, res?: Response, next?: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next)
      .then((result) => {
        try {
          return res.json(result)
        }
        catch (e) {
          console.error(e)
          return res.status(500).end()
        }
      })
      .catch((exception) => {
        if (exception?.status) {
          return res.status(exception.status).json(exception)
        }

        console.error(exception)
        next(new Error(exception))
      })
  }
}

/**
 * Basic wrapper
 */
export function wrapper(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next)
      .catch((exception) => {
        if (exception.status) {
          return res.status(exception.status).json(exception)
        }
        console.error(exception)
        next(new Error(exception))
      })
  }
}

/**
 * Helper for getting a document and throw 404 if not found
 */
export async function getDocument<T, TQuery = object, TMethods = object, TVirtuals = object>(
  model: Model<T, TQuery, TMethods, TVirtuals>,
  id: string | string[],
): Promise<HydratedDocument<T, TMethods, TVirtuals>> {
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
    throw new HttpError(400)
  }

  const doc = await model.findById(id).exec()
  if (!doc) {
    throw new HttpError(404)
  }

  return doc as unknown as HydratedDocument<T, TMethods, TVirtuals>
}

/**
 * Helper for adding child routes
 */
export function useRouter(router: Router, path: string, callback: (router: Router) => void) {
  const subRouter = Router({
    mergeParams: true,
  })
  router.use(path, subRouter)
  callback(subRouter)
}
