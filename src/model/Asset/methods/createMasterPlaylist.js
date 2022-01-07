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

import { ffprobe } from '#~/lib/ffmpeg';
import { config } from '#~/config';

export default schema => {
  /**
   * Create a master playlist
   * @returns {Promise<void>}
   */
  schema.methods.createMasterPlaylist = async function() {
    // probe variants
    const variants = [];
    for(let variant of this.variants.sort((a, b) => parseInt(b) - parseInt(a))) {
      const { streams }  = await ffprobe(this.getUrl(variant));
      const { display_aspect_ratio, height, width } = streams.find(({ codec_type }) => codec_type === 'video');
      const aspect = (display_aspect_ratio ?? '')
        .split(':')
        .map(value => parseInt(value))
        .filter(value => value)
      ;

      const resolution = aspect.length > 0 ? Math.max(width,
        Math.floor(height / aspect[1] * aspect[0])) + 'x' + height :
        `${width}x${height}`

      const bandwidth = parseInt(variant) * 1024;
      variants.push(
        [
          `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=${bandwidth},RESOLUTION=${resolution},CLOSED-CAPTIONS=NONE`,
          `${this._id}.${variant}.m3u8`
        ]
      )
    }

    await config.storage.upload(`${this._id}/${this._id}.m3u8`,
      [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        ...variants.flat()
      ].join('\n')
    );
  }
}
