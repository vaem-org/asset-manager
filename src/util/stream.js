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

import { Asset } from '@/model/asset';
import moment from 'moment';
import { computeSignature } from '@/util/url-signer';
import _ from 'lodash';

export async function getStreamInfo(assetId) {
  const item = await Asset.findById(assetId);

  if (!item) {
    throw 'Not found';
  }

  const timestamp = moment().add(8, 'hours').valueOf();
  const signature = computeSignature(assetId, timestamp);

  return {
    streamUrl: `/streams/${timestamp}/${signature}/${assetId}.m3u8`,
    subtitles: _.mapValues(_.pickBy(item.subtitles), (enabled, language) => `/streams/${timestamp}/${signature}/${assetId}.${language}.vtt`)
  }
}