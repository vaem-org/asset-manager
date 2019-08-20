/*
 * VAEM - Asset manager
 * Copyright (C) 2018  Wouter van de Molengraft
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

import config from '~config';
import _ from 'lodash';
import jwt from 'jsonwebtoken';

/**
 * Wrap an async function into middleware
 * @param fn
 * @return {Function}
 */
export function api(fn) {
  return (req, res) => {
    fn(req, res)
    .then(result => res.json({result}))
    .catch(exception => {
      res.status(exception.status || 500).json({
        error: _.isPlainObject(exception) ? exception : exception.toString()
      });
      console.error(exception);
    })
  };
}

/**
 * Wrap an async function into middleware
 * @param fn
 * @return {Function}
 */
export function catchExceptions(fn) {
  return (req, res, next) => {
    fn(req, res, next)
    .catch(exception => {
      res.status(exception.status || 500).json(_.isPlainObject(exception) ? exception : exception.toString());
      console.error(exception);
    });
  };
}

const getToken = req => {
  let token = req.headers['authorization'];
  if (token.startsWith('Bearer ')) {
    token = token.substr(7);
  }
  req._token = token;
  return jwt.verify(token, config.jwtSecret);
};

/**
 * Verify JWT token middleware
 * @param req
 * @param res
 * @param next
 */
export function verify(req, res, next) {
  if (req.token) {
    return next();
  }

  try {
    req.token = getToken(req);
  } catch (e) {
    return res.status(401).json({
      status: 401,
      message: e.name === 'TokenExpiredError' ? 'TokenExpiredError' : 'Unauthorized'
    });
  }

  next();
}
