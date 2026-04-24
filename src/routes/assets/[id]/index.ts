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
import { useRouter } from '#/lib/express-helpers.js'

import download from './download.js'
import keyinfo from './keyinfo.js'
import share from './share.js'
import stream from './stream.js'
import subtitles from './subtitles/index.js'
import thumbnail from './thumbnail/index.js'

export default (router: Router) => {
  download(router)
  keyinfo(router)
  share(router)
  stream(router)
  useRouter(router, '/subtitles', subtitles)
  useRouter(router, '/thumbnail', thumbnail)
}
