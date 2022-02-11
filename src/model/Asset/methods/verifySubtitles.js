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
import { config } from '#~/config';
import { parseM3U8 } from '#~/lib/m3u8';

export default schema => {
  /**
   * Verify if all subtitle files are available
   */
  schema.methods.verifySubtitles = async function () {
    const root = `${this._id}/subtitles/`;
    const files = new Set(
      (await config.storage.list(root))
        .map(({ name }) => name)
      )
    ;

    let result = true;
    for(const lang of Object.keys(this.subtitles ?? {})) {
      // check if this language has a vtt and m3u8 file
      result = result && files.has(`${lang}.vtt`) && files.has(`${lang}.m3u8`);

      // check if all playlist items of m3u8 are available
      const playlist = result && await parseM3U8(await config.storage.download(`${root}/${lang}.m3u8`));
      result = result && playlist?.items?.PlaylistItem?.every?.(i => files.has(i.properties?.uri));
    }

    return result;
  }
}
