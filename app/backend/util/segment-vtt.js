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

import child_process from 'child_process';
import _ from 'lodash';
import fs from 'fs-extra';
import util from 'util';
import config from '../../../config/config';
import {Asset} from '../model/asset';
import {authorizationHeaders} from './source';

const execFile = util.promisify(child_process.execFile);

const run = args => new Promise((accept, reject) => {
  child_process.spawn('ffmpeg', args, {stdio: 'inherit'})
    .on('close', code => {
      if (code === 0) {
        return accept();
      }
      else {
        return reject('ffmpeg failed');
      }
    });
});

const segmentVtt = async (base, assetId, lang) => {
  const root = config.output;
  const item = await Asset.findById(assetId);

  if (!item) {
    throw 'Item not found';
  }

  const source = `${base}/${assetId}.235k.m3u8`;

  const {stdout} = await execFile('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_frames',
    '-read_intervals', '%+#1',
    '-headers', authorizationHeaders,
    source
  ], {maxBuffer: 10 * 1024 * 1024});

  let frames = false;

  try {
    frames = JSON.parse(stdout);
  }
  catch (e) {

  }

  const pkt_pts = _.get(frames, 'frames[0].pkt_pts');
  if (!pkt_pts) {
    throw 'No frames found for asset';
  }

  if (!config.s3) {
    fs.ensureDirSync(`${root}/${assetId}/subtitles/`);
  }

  await run(
    [
      '-v', 'error',
      '-y',
      '-f', 'webvtt',
      '-i', `${config.root}/var/subtitles/${assetId}.${lang}.vtt`,
      '-f', 'lavfi',
      '-i', `nullsrc=s=1x1:d=${item.videoParameters.duration}`,
      '-f', 'hls',
      '-hls_list_size', 0,
      '-hls_playlist_type', 'vod',
      '-hls_time', 10,
      '-hls_segment_filename', `http://localhost:${config.port}/segment-vtt/null.%d.ts`,
      '-method', 'PUT',
      '-c', 'copy',
      `http://localhost:${config.port}/segment-vtt/${pkt_pts}/${assetId}/subtitles/${lang}..m3u8`
    ]);
};

export default segmentVtt;
