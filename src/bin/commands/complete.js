/*
 * VAEM - Asset manager
 * Copyright (C) 2019  Wouter van de Molengraft
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

import sywac from 'sywac';
import { dirname } from 'path';
import { Asset } from '@/model/asset';
import masterPlaylist from '@/lib/master-playlist';
import config from '@/config';
import { getStreamInfo } from '@/lib/stream';
import _ from 'lodash';
import { promisify } from "util";
import { execFile as _execFile } from "child_process";
import { verifyAsset } from '@/lib/verify-asset';

const execFile = promisify(_execFile);

sywac.command('complete <assetId>', async ({ assetId }) => {
  const asset = await Asset.findById(assetId);

  if (!asset) {
    throw 'Item not found';
  }

  const list = (await config.destinationFileSystem.list(assetId))
    .map(({ name }) => name)
    .filter(name => name.endsWith('k.m3u8'))
  ;

  asset.bitrates = list.map(name => name.split('.')[1]);

  asset.streams = [];
  // ffprobe first bitrate
  const source = await getStreamInfo(assetId, '127.0.0.1');

  const base = dirname(source.streamUrl);
  for(let filename of list) {
    let stream;
    let stdout;
    try {
      ({ stdout } = await execFile('ffprobe', [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        `http://127.0.0.1:${config.port}${base}/${filename}`
      ]));

      stream = _.find(_.get(JSON.parse(stdout), 'streams', []), { codec_type: 'video' });
    }
    catch (e) {
      throw `ffprobe failed with ${e.stderr || e.toString()}`
    }

    if (stream) {
      const aspect = _.get(stream, 'display_aspect_ratio', '')
        .split(':')
        .map(value => parseInt(value))
        .filter(value => value)
      ;

      asset.streams.push(
        {
          filename,
          bandwidth: parseInt(filename.split('.')[1].replace(/k$/, '')) * 1024,
          resolution:
            aspect.length > 0 ? Math.max(stream.width,
              Math.floor(stream.height / aspect[1] * aspect[0])) + 'x' + stream.height :
              `${stream.width}x${stream.height}`
          ,
          codec: 'avc1.640029'
        });
    }
  }
  await asset.save();
  await masterPlaylist(asset._id);

  await verifyAsset({
    assetId
  });
  await asset.save();
});
