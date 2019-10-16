/*
 * VAEM - Asset manager
 * Copyright (C) 2018  Wouter van de Molengraft
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
import sywac from 'sywac';
import moment from 'moment';
import { computeSignature } from '@/util/url-signer';

import _ from 'lodash';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';

import { Asset } from '@/model/asset';

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

sywac.command('verify-asset <assetId>', async ({ assetId }) => {
  const asset = await Asset.findById(assetId);

  if (!asset) {
    throw 'Item not found';
  }

  if (asset.bitrates.length !== (asset.numStreams || asset.jobs.length)) {
    console.error(`Not all jobs are completed: ${_.difference(_.map(asset.jobs, 'maxrate'),
      asset.bitrates).join(', ')} are missing`);
    process.exit(1);
  }

  console.info('Verifying file count');

  const entries = await config.destinationFileSystem.list(`/${assetId}`);
  const counts = _.countBy(entries, ({name}) => name.split('.')[1]);

  const max = _.max(_.values(counts));

  const faulty = _.keys(_.omit(counts, ['m3u8', 'undefined']))
  .filter(bitrate => Math.abs(counts[bitrate] - max) >= 5);
  if (faulty.length > 0) {
    console.warn(`File count for bitrates ${faulty.join(', ')} differ from maximum.`);
  }
  asset.bitrates = _.difference(asset.bitrates, faulty);

  const good = [];
  // verify durations of all bitrates
  for (let entry of [...asset.streams, ...asset.audioStreams]) {
    const timestamp = moment().add(8, 'hours').valueOf();
    const signature = computeSignature(assetId, timestamp);
    const videoUrl = `${config.base}/streams/${timestamp}/${signature}/${entry.filename}`;
    console.info(`Checking duration for ${entry.bitrate || `${entry.bandwidth/1024}k`}`);
    const duration = await getDuration(videoUrl);
    if (Math.abs(asset.videoParameters.duration - Math.floor(duration)) > 2) {
      console.error(`Duration for bitrate ${entry.bitrate} (${duration}) differs from source (${asset.videoParameters.duration}).`);
    } else {
      good.push(entry.bitrate);
    }
  }
  asset.bitrates = good;

  await asset.save();

  if (asset.bitrates.length === asset.jobs.length) {
    console.info('Asset has been verified successfully');
  }
});
