#!/usr/bin/env node

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

import moment from 'moment';
import { computeSignature } from '~/util/asset-signer';

import _ from 'lodash';
import mongoose from 'mongoose';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';

import config from '~config';

import { Asset } from '~/model/asset';
import { listAllObjects } from '~/util/s3';
import { bunnyCDNStorage } from '~/util/bunnycdn';

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

(async () => {
  await mongoose.connect(config.mongo, {
    useNewUrlParser: true
  });

  const assetId = process.argv[2];
  const asset = await Asset.findById(assetId);

  if (!asset) {
    throw 'Item not found';
  }

  if (asset.bitrates.length !== asset.jobs.length) {
    console.error(`Not all jobs are completed: ${_.difference(_.map(asset.jobs, 'maxrate'),
      asset.bitrates).join(', ')} are missing`);
    process.exit(1);
  }

  console.info('Verifying file count');

  let counts;
  if (config.s3) {
    // verify file counts on s3
    const objects = (await listAllObjects({
      Prefix: `${assetId}/`,
      Bucket: config.s3.bucket
    })).filter(object => /\.ts$/.exec(object.Key));

    counts = _.countBy(objects, object => object.Key.split('.')[1]);
  } else if (config.bunnyCDN) {
    const objects = (await bunnyCDNStorage.get(`${assetId}/`)).data;
    counts = _.countBy(objects, object => object.ObjectName.split('.')[1]);
  }

  const max = _.max(_.values(counts));

  const faulty = _.keys(_.omit(counts, 'm3u8'))
  .filter(bitrate => Math.abs(counts[bitrate] - max) >= 5);
  if (faulty.length > 0) {
    console.error(`File count for bitrates ${faulty.join(', ')} differ from maximum.`);
  }
  asset.bitrates = _.difference(asset.bitrates, faulty);

  const good = [];
  // verify durations of all bitrates
  for (let bitrate of asset.bitrates) {
    if (bitrate === '1k') {
      good.push(bitrate);
      return;
    }

    const timestamp = moment().add(8, 'hours').valueOf();
    const signature = computeSignature(assetId, timestamp, '10.1.0.122');
    const videoUrl = `${config.base}/player/streams/${timestamp}/${signature}/${assetId}.${bitrate}.m3u8`;
    console.info(`Checking duration for ${bitrate}`);
    const duration = await getDuration(videoUrl);
    if (Math.abs(asset.videoParameters.duration - Math.floor(duration)) > 2) {
      console.error(`Duration for bitrate ${bitrate} (${duration}) differs from source (${asset.videoParameters.duration}).`);
    } else {
      good.push(bitrate);
    }
  }
  asset.bitrates = good;

  await asset.save();

  if (asset.bitrates.length === asset.jobs.length) {
    console.info('Asset has been verified successfully');
  }

  await mongoose.disconnect();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
