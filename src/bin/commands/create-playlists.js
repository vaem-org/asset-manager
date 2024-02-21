/*
 * VAEM - Asset manager
 * Copyright (C) 2022  Wouter van de Molengraft
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

import { config } from '#~/config'
import { purgeCache } from '#~/lib/bunny'

export const flags = 'create-playlists <assetId>'

export async function run({ assetId }) {
  const entries = await config.storage.list(`${assetId}/`);
  const variants = entries.reduce((variants, { name }) => {
    const bitrate = name.split('.')[1]
    return {
      ...variants,
      [bitrate]: [
        ...variants[bitrate] ?? [],
        name
      ]
    }
  }, {})

  const getOrder = filename => parseInt(filename.split('.')[2]);

  for (const [bitrate, variant] of Object.entries(variants)) {
    const m3u8 = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:2',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      ...variant
        .filter(filename => filename.endsWith('.ts'))
        .sort((a, b) => getOrder(a) - getOrder(b))
        .flatMap(filename => [
        '#EXTINF:2.0000',
        filename
      ]),
      '#EXT-X-ENDLIST'
    ].join('\n');

    const filename = `${assetId}/${assetId}.${bitrate}.m3u8`;
    await config.storage.upload(filename, m3u8)
    await purgeCache(`/${filename}`)
  }
}
