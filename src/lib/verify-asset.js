/*
 * VAEM - Asset manager
 * Copyright (C) 2020  Wouter van de Molengraft
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

import config from '@/config';

import _ from 'lodash';
import moment from 'moment';
import { promisify } from 'util';
import { execFile as _execFile } from 'child_process';

import { Asset } from '@/model/asset';
import { computeSignature } from '@/lib/url-signer';
import masterPlaylist from '@/lib/master-playlist';
import { purgeCache } from '@/lib/bunnycdn';

const execFile = promisify(_execFile);
const getDuration = async source => {
  const { stdout } = await execFile('ffprobe', [
    '-print_format', 'json',
    '-show_format',
    source
  ]);

  const json = JSON.parse(stdout.toString());

  return parseFloat(_.get(json, 'format.duration'));
};

/**
 * Verify an asset
 * @param {String} assetId
 * @param {Boolean} countOnly when true the m3u8 files are not checked
 * @returns {Promise<boolean>} true when asset has been verified successfully
 */
export async function verifyAsset({ assetId, countOnly=false }) {
  const asset = await Asset.findById(assetId);

  if (!asset) {
    throw 'Item not found';
  }

  if (asset.bitrates.length !== (asset.numStreams || asset.jobs.length)) {
    console.warn(`Not all jobs are completed: ${_.difference(_.map(asset.jobs, 'bitrate'),
      asset.bitrates).join(', ')} are missing`);
  }

  // remove duplicate streams
  asset.streams = _.uniqBy(asset.streams, 'filename');
  console.log(asset.streams);

  console.info('Verifying file count');

  const entries = await config.destinationFileSystem.list(`/${assetId}`);
  const counts = _.countBy(entries, ({ name }) => name.split('.')[1]);

  const max = _.max(_.values(counts));

  const faulty = _.keys(_.omit(counts, ['m3u8', 'undefined']))
  .filter(bitrate => Math.abs(counts[bitrate] - max) >= 5);
  if (faulty.length > 0) {
    console.warn(`File count for bitrates ${faulty.join(', ')} differ from maximum.`);
  }
  asset.bitrates = _.difference(asset.bitrates, faulty);

  if (!countOnly) {
    const good = [];
    // verify durations of all bitrates
    for (let entry of [...asset.streams, ...asset.audioStreams]) {
      await purgeCache(`/${asset._id}/${entry.filename}`);
      const bitrate = entry.filename.split('.')[1];

      if (!asset.bitrates.includes(bitrate)) {
        continue;
      }

      const timestamp = moment().add(8, 'hours').valueOf();
      const signature = computeSignature(assetId, timestamp);
      const videoUrl = `${config.base}/streams/${timestamp}/${signature}/${entry.filename}`;
      console.info(`Checking duration for ${bitrate}`);
      const duration = await getDuration(videoUrl);
      if (Math.abs(asset.videoParameters.duration - Math.floor(duration)) > 2) {
        console.error(`Duration for bitrate ${bitrate} (${duration}) differs from source (${asset.videoParameters.duration}).`);
      } else {
        good.push(bitrate);
      }
    }
    asset.bitrates = _.uniq(good);
  }

  if (asset.bitrates.length === asset.jobs.length) {
    asset.state = 'processed';
  }

  await asset.save();

  await masterPlaylist(asset._id);

  return asset.bitrates.length === asset.jobs.length;
}
