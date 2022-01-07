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

import { Asset } from '#~/model/Asset/index';

export async function run() {
  // assume all processed assets are verified
  await Asset.updateMany({
    state: 'processed'
  }, {
    $set: {
      state: 'verified'
    }
  });

  // assign ffprobe to videoParameters.ffprobe
  await Asset.updateMany({
    ffprobe: {
      $exists: false
    }
  }, [
    {
      $set: {
        ffprobe: '$videoParameters.ffprobe'
      }
    }
  ]);

  await Asset.updateMany({},
    {
      $rename: {
        bitrates: 'variants'
      }
    }, {
      strict: false
    })

  await Asset.updateMany({}, {
    $unset: Object.fromEntries(
      ['audio', 'audioStreams', 'basename', 'videoParameters', 'numStreams', 'streams'].map(key => [key, 1])
    )
  }, {
    strict: false
  })
}
