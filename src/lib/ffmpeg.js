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

import { spawn } from 'child_process';
import { join } from 'path';
import { finished } from 'stream/promises';
import { mkdir, writeFile } from 'fs/promises';
import { Asset } from '#~/model/Asset/index';
import { config } from '#~/config';
import { hlsSegment, hlsSegmentPlaylist } from 'node-webvtt/lib/hls.js';

/**
 *
 * @param {string} cmd
 * @param {[]} args
 * @returns {Promise<Buffer>}
 */
async function run(cmd, args) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const stdout = [];
  child.stdout.on('data', buf => stdout.push(buf));
  const stderr = [];
  child.stderr.on('data', buf => {
    process.stderr.write(buf);
    stderr.push(buf);
  });

  return new Promise((resolve, reject) => {
    child.on('close', code => {
      if (code !== 0) {
        reject(Buffer.concat(stderr));
      } else {
        resolve(Buffer.concat(stdout));
      }
    })
  });
}

/**
 * Run ffmpeg probe on given file
 * @param {string} filename
 * @return {Promise<{ streams: [{}], format: {} }>}
 */
export async function ffprobe(filename) {
  try {
    return JSON.parse((await run('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filename
    ])).toString()
    );
  }
  catch (e) {
    throw new Error(`ffprobe process failed: ${e.toString()}`);
  }
}


/**
 * Find the streams to use for audio
 * @param {[{}]} streams
 * @return {[int]}
 */
export function getAudio(streams) {
  const audioStreams = streams.filter(({ codec_type }) => codec_type === 'audio');

  const stereo = audioStreams.find(({ channels }) => channels === 2);
  if (stereo) {
    return [stereo.index]
  }

  const monoChannels = audioStreams.filter(({ channels }) => channels === 1);
  const findChannel = layout => monoChannels.find(({ layout: layout2 }) => layout2 === layout)?.index;

  if (findChannel('DL')) {
    return [
      findChannel('DL'),
      findChannel('DR'),
    ]
  } else if (monoChannels.length >= 2) {
    return monoChannels.slice(0, 2).map(({ index }) => index)
  } else return audioStreams
    .filter(({ channels }) => channels === 6)
    .map(({ index }) => index)
    .slice(0, 1)
}

/**
 * Segment a vtt file for playback on Apple devices
 * @param {string} assetId
 * @param {string} lang
 * @returns {Promise<void>}
 */
export async function segmentVtt(assetId, lang) {
  const item = await Asset.findById(assetId);

  if (!item) {
    throw 'Item not found';
  }

  const { frames } = JSON.parse(
    (await run('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_frames',
      '-read_intervals', '%+#1',
      item.getUrl('235k')
    ])).toString()
  )

  const pkt_pts = frames?.[0]?.pkt_pts;
  if (!pkt_pts) {
    throw 'No frames found for asset';
  }

  const stream = await config.storage.download(`${assetId}/subtitles/${lang}.vtt`);
  const outputPath = join(config.root, 'var/output', assetId, 'subtitles');
  const buffers = [];
  stream.on('data', buffer => buffers.push(buffer));
  await finished(stream);
  const input = Buffer.concat(buffers).toString();

  await mkdir(outputPath, {
    recursive: true
  });
  await writeFile(
    join(outputPath, `${lang}.m3u8`),
    hlsSegmentPlaylist(input, 10).replace(
      /^\d+\.vtt$/mg,
      (match) => `${lang}.${match}`
    )
  );

  for(const { filename, content } of hlsSegment(input, 10, pkt_pts)) {
    await writeFile(
      join(outputPath, `${lang}.${filename}`),
      content
    );
  }
}

/**
 * Get the framerate from a ffprobe stream object
 * @param {{}} stream
 * @returns {number}
 */
export function getFramerate(stream) {
  const rFrameRate = (stream?.r_frame_rate ?? '')
    .split('/')
    .map(i => parseInt(i))
  ;

  let framerate = 25;
  if (rFrameRate.length === 2) {
    framerate = rFrameRate[0] / rFrameRate[1];
  }

  return framerate;
}
