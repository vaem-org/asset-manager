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
import { useRouter } from '#~/lib/express-helpers.js'

import assetsJson from './assets.json.js'
import me from './me.js'
import sign from './sign.js'
import auth from './auth/index.js'
import publicRouter from './public/index.js'
import files from './files/index.js'
import model from './[model]/index.js'

export default (router: Router) => {
  assetsJson(router)
  me(router)
  sign(router)
  useRouter(router, '/auth', auth)
  useRouter(router, '/public', publicRouter)
  useRouter(router, '/files', files)
  useRouter(router, '/:model', model)
}
