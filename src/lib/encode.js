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

import { basename } from 'path';
import { Asset } from '#~/model/Asset/index';
import { ffprobe, getAudio, getFramerate } from '#~/lib/ffmpeg';
import { Job } from '#~/model/Job/index';
import profiles from '#~/lib/profiles';
import { config } from '#~/config';

/**
 * Create an asset and accompanying job
 * @param {string} file
 * @param {int[]} audio
 * @param {boolean} copyHighestVariant
 * @param {?string} customAudioFilter
 * @return {Promise<void>}
 */
export async function encode({
  file,
  audio = null,
  copyHighestVariant = false,
  customAudioFilter = null
}) {
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

  const framerate = getFramerate(videoStream);

  const videoFilter = null;
  audio = audio ?? getAudio(asset.ffprobe.streams);

  const matchingProfiles = Object.entries(profiles)
    .filter(([width]) => width <= videoStream.width)
    .flatMap(([width, bitrates]) => bitrates.map(bitrate => ({
      bitrate: `${bitrate}k`,
      width
    })));

  asset.variants = matchingProfiles.map(({ bitrate }) => bitrate);
  asset.job = job._id;

  const highestVariant = asset.highestVariant;

  const asplit = `${matchingProfiles.length}${
    matchingProfiles.map((profile, i) => `[aout${i}]`).join('')
  }`;

  job['arguments'] = [
    '-i', path,
    // audio merge filter
    ...!customAudioFilter && audio.length > 1 ? [
      '-filter_complex', `${audio.map(index => `[0:${index}]`).join('')}amerge=inputs=2,asplit=${asplit}`
    ] : [],
    ...customAudioFilter ? [
      '-filter_complex', `${customAudioFilter},asplit=${asplit}`
    ] : [],

    ...matchingProfiles.flatMap(({ width, bitrate }, i) => {
      return [
        ...highestVariant === bitrate && copyHighestVariant ? [
          // copy streams from source
          ...audio.length > 0 ? [
            '-map', '0:a',
            '-c:a', 'copy'
          ] : [],

          '-map', '0:v',
          '-c', 'copy'
        ] : [
          // process audio and video
          ...audio.length > 0 || customAudioFilter ? [
            // audio options,
            '-map', audio.length === 1 ? `0:${audio[0]}` : `[aout${i}]`,
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
        ],

        // output
        '-f', 'hls',
        '-hls_list_size', 0,
        '-hls_playlist_type', 'vod',
        '-hls_time', 2,
        '-hls_segment_filename', `${config.root}/var/output/${asset._id}/${asset._id}.${bitrate}.%05d.ts`,
        `${config.root}/var/output/${asset._id}/${asset._id}.${bitrate}.m3u8`
      ];
    })
  ];

  await asset.save();
  await job.save();

  return job;
}
