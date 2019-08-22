/*
 * VAEM - Asset manager
 * Copyright (C) 2019  Wouter van de Molengraft
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
import { request } from 'express';
import { Model } from 'mongoose';
import _ from 'lodash';

/**
 * Helper function for listing documents for the user interface
 * @param { request } req
 * @param { Model } model
 * @param { {} } where
 * @returns {Promise<{totalItems, items}>}
 */
export async function listDocuments(req, model, where={}) {
  const itemsPerPage = parseInt(req.query.itemsPerPage || '10');
  const sortBy = _.get(req.query, 'sortBy[0]', 'createdAt');
  const sortDesc = _.get(req.query, 'sortDesc[0]', 'true') === 'true';
  return {
    items: await model
    .find(where)
    .sort({ [sortBy]: sortDesc ? -1 : 1 })
    .limit(itemsPerPage)
    .skip((parseInt(req.query.page || '1') - 1) * itemsPerPage)
    ,
    totalItems: await model.countDocuments(where)
  }
}