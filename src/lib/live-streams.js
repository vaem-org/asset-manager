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

import { get } from 'lodash';
import { ffprobe } from '@/lib/source';

export const listSize = 10;

/**
 *
 * @param {String} source
 * @param {String} hlsKeyInfoFile
 * @param {String} outputBase
 * @param {String} assetId
 * @return {Promise<{profiles: ({bandwidth: *, width: *, bitrate: string, copy: boolean}|{bandwidth: number, width: number, bitrate: string, copy: boolean})[], arguments: *[]}>}
 */
export async function getLiveStreamArguments({
  source,
  hlsKeyInfoFile,
  outputBase,
  assetId
}) {
  const { streams } = await ffprobe(source);
  const video = streams.find(({ codec_type }) => codec_type === 'video');
  const hasAudio = !!streams.find(({ codec_type }) => codec_type === 'audio');
  let framerate = 25;
  const rFrameRate = get(video, 'r_frame_rate', '').split('/').map(i => parseInt(i));
  if (rFrameRate.length === 2) {
    framerate = rFrameRate[0] / rFrameRate[1];
  }

  if (!video) {
    throw 'Unable to find video stream';
  }

  const profiles = [
    {
      width: 1920,
      bitrate: '2500k',
      bandwidth: 2500000
    },
    {
      width: 720,
      bitrate: '1000k',
      bandwidth: 1000000,
    }
  ].filter(({ width }) => width <= video.width)
  ;

  const chunkSize = 1;

  return {
    profiles,
    streams,
    video,

    arguments: [
      '-v', 'error',
      '-re',
      '-threads', 0,
      '-i', source,

      ...profiles.map(({ width, bitrate, copy }) => [

        // video options
        ...(copy ? [
          '-map', '0:v',
          '-c:v', 'copy'
        ] : [
          '-map', '0:v',
          '-c:v', 'libx264',
          '-vprofile', 'high',
          '-level', '4.1',
          '-pix_fmt', 'yuv420p',
          '-g', chunkSize * Math.ceil(framerate),
          '-x264opts', 'no-scenecut',
          '-vf', `scale=${width}:trunc(ow/dar/2)*2`,
          '-b:v', bitrate,
          '-maxrate', bitrate,
          '-bufsize', bitrate,
          '-preset', 'ultrafast',
        ]),

        // audio options
        ...(hasAudio ? [
          '-map', '0:a',
          '-c:a', 'libfdk_aac',
          '-ac', 2,
          '-b:a', '128k',
        ] : []),

        // output
        '-method', 'PUT',
        '-f', 'hls',
        '-hls_list_size', listSize,
        '-hls_time', chunkSize,
        '-hls_segment_filename', `${outputBase}/${assetId}.${bitrate}.%d.ts`,
        `${outputBase}/${assetId}.${bitrate}.m3u8`
      ]).flat()
    ]
  }
}
