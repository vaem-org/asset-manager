/*
 * VAEM - Asset manager
 * Copyright (C) 2021  Wouter van de Molengraft
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

import mongoose from 'mongoose';

/**
 * Wrap an async function into middleware
 * @param fn
 * @return {Function}
 */
export function api(fn) {
  return (req, res, next) => {
    fn(req, res, next)
    .then(result => {
      try {
        return res.json(result);
      }
      catch (e) {
        console.error(e);
        return res.status(500).end();
      }
    })
    .catch(exception => {
      if (exception?.status) {
        return res.status(exception.status).json(exception);
      }

      console.error(exception);
      next(new Error(exception))
    })
  };
}

/**
 * Basic wrapper
 * @param fn
 * @return {(function(*=, *=, *=): void)|*}
 */
export function wrapper(fn) {
  return (req, res, next) => {
    fn(req, res, next)
    .catch(exception => {
      if (exception.status) {
        return res.status(exception.status).json(exception);
      }
      console.error(exception);
      next(new Error(exception))
    })
  };
}

/**
 * Helper for getting a document and throw 404 if not found
 * @param {{}} model
 * @param {string} id
 * @return {Promise<{}>}
 */
export async function getDocument(model, id) {
  const doc = mongoose.Types.ObjectId.isValid(id) && await model.findById(id);
  if (!doc) {
    throw {
      status: 404
    }
  }

  return doc;
}
