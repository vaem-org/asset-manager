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

import _ from 'lodash';
import { Router } from 'express';
import { api, verify } from '@/util/express-helpers';
import { Asset } from '@/model/asset';

const router = new Router();

router.get('', verify, api(async () => {
  const assets = await Asset.find()
    .select(['subtitles', 'hls_enc_iv', 'hls_enc_key', 'labels', 'title', 'deleted', 'videoParameters.duration']);

  return _.mapValues(_.keyBy(assets, '_id'), value => {
    return {
      ..._.omit(value.toObject(), ['_id', 'videoParameters']),
      duration: parseFloat(value.videoParameters.duration)
    }
  });
}));

export default router;
