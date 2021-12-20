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

import { basename } from 'path';
import { Asset } from '#~/model/Asset/index';
import { ffprobe, getAudio } from '#~/lib/ffmpeg';
import { Job } from '#~/model/Job/index';
import profiles from '#~/lib/profiles';
import { config } from '#~/config';

/**
 * Create an asset and accompanying job
 * @param {string} file
 * @return {Promise<void>}
 */
export async function encode({ file }) {
  const path = `${config.root}/var/files/${file}`;
  const asset = await Asset.findOne({
    file,
    deleted: false
  }) ?? new Asset({
    file,
    title: basename(path).replace(/\.[^.]+$/, ''),
    ffprobe: await ffprobe(path)
  });

  // create job
  const job = await Job.findOne({
    asset
  }) ?? new Job({
    asset,
    file
  });

  if (!['encoding', 'done'].includes(job.state)) {
    job.state = 'new';
  }

  const videoStream = asset.ffprobe.streams
    .find(({ codec_type }) => codec_type === 'video');

  const rFrameRate = (videoStream?.r_frame_rate ?? '')
    .split('/')
    .map(i => parseInt(i))
  ;

  let framerate = 25;
  if (rFrameRate.length === 2) {
    framerate = rFrameRate[0] / rFrameRate[1];
  }

  const videoFilter = null;
  const audio = getAudio(asset.ffprobe.streams);

  const matchingProfiles = Object.entries(profiles)
    .filter(([width]) => width <= videoStream.width)
    .flatMap(([width, bitrates]) => bitrates.map(bitrate => ({
      bitrate: `${bitrate}k`,
      width
    })));

  asset.variants = matchingProfiles.map(({ bitrate }) => bitrate);
  asset.job = job._id;

  job['arguments'] = [
    '-i', path,
    // audio merge filter
    ...audio.length > 1 ? [
      '-filter_complex', audio.map(index => `[0:${index}]`).join('') + 'amerge=inputs=2[aout]'
    ] : [],

    ...matchingProfiles.flatMap(({ width, bitrate }) => [
      ...audio.length > 0 ? [
        // audio options,
        '-map', audio.length === 1 ? `0:${audio[0]}` : '[aout]',
        '-c:a', 'libfdk_aac',
        '-ac', 2,
        '-b:a', '128k',
      ] : [],

      // video options
      '-map', '0:v',
      '-vcodec', 'libx264',
      '-vprofile', 'high',
      '-level', '4.1',
      '-pix_fmt', 'yuv420p',
      '-g', 2 * Math.ceil(framerate),
      '-x264opts', 'no-scenecut',
      '-vf',
      (videoFilter ? videoFilter + '[out];[out]' : '') +
        `scale=${width}:trunc(ow/dar/2)*2`,
      '-b:v', bitrate,
      '-maxrate', bitrate,
      '-bufsize', bitrate,
      '-preset', 'slow',

      // output
      '-f', 'hls',
      '-hls_list_size', 0,
      '-hls_playlist_type', 'vod',
      '-hls_time', 2,
      '-hls_segment_filename', `${config.root}/var/output/${asset._id}/${asset._id}.${bitrate}.%05d.ts`,
      `${config.root}/var/output/${asset._id}/${asset._id}.${bitrate}.m3u8`
    ])
  ];

  await asset.save();
  await job.save();

  return job;
}
