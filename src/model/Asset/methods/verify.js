/*
 * VAEM - Asset manager
 * Copyright (C) 2021  Wouter van de Molengraft
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
import { ffprobe } from '#~/lib/ffmpeg';

export default schema => {
  /**
   * Verify if all files are present
   * @returns {Promise<boolean>}
   */
  schema.methods.verify = async function() {
    console.info('Verifying file count');

    const entries = (await config.storage.list(`${this.id}/`))
    .map(({ name }) => name);
    const counts = entries.reduce((counts, name) => {
      const [,variant] = name.split('.');
      return ({
        ...counts,
        [variant]: (counts[variant] ?? 0) + 1
      });
    }, {});

    const max = Object.values(counts)
    .reduce((max, count) => Math.max(max, count), 0);

    const faulty = Object.entries(counts)
    .filter(([variant, count]) => variant !== 'm3u8' && count !== max);

    if (faulty.length > 0) {
      console.warn(`File count for bitrates ${faulty.join(', ')} differ from maximum.`);
    }

    // verify durations of all bitrates
    let verified = 0;
    for (let variant of this.variants) {
      const videoUrl = this.getUrl(variant);
      console.info(`Checking duration for ${variant}`);
      let duration;
      try {
        duration = parseFloat((await ffprobe(videoUrl)).format.duration);
      }
      catch (e) {
        duration = 0;
      }
      if (Math.abs(this.ffprobe.format.duration - Math.floor(duration)) > 2) {
        console.error(`Duration for bitrate ${variant} (${duration}) differs from source (${this.ffprobe.format.duration}).`);
      } else {
        verified++;
      }
    }

    this.state = faulty.length === 0 && verified === this.variants.length ? 'verified' : 'error';
    await this.save();
    return this.state === 'verified';
  }
}
