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

import { createReadStream } from 'fs';
import { config } from '#~/config';
import { segmentVtt } from '#~/lib/ffmpeg';
import { convert } from '#~/lib/subtitles';
import { tmpdir } from 'os';
import { unlink } from 'fs/promises';

export default schema => {
  /**
   * Add subtitle
   * @param {string} language
   * @param {string} source
   * @returns {Promise<void>}
   */
  schema.methods.setSubtitle = async function(language, source) {
    let converted = null;
    if (!source.toLowerCase().endsWith('.vtt')) {
      converted = `${tmpdir()}/${this._id}.vtt`;
      await convert(source, converted);
    }
    await config.storage.upload(
      `${this._id}/subtitles/${language}.vtt`,
      createReadStream(converted || source)
    );
    this.subtitles = {
      ...this.subtitles,
      [language]: true
    }
    await this.save();
    await segmentVtt(this._id, language);
    if (converted) {
      await unlink(converted);
    }
  }
}