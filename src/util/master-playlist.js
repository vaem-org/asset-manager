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

import fs from 'fs-extra';
import path from 'path';
import {Asset} from '../model/asset';
import config from '../../config/config';
import {s3} from './s3';
import {bunnycdnStorage} from './bunnycdn';

const masterPlaylist = async assetId => {
  const asset = await Asset.findById(assetId);

  const playlists = asset.streams;

  playlists.sort((a, b) => a.bandwidth - b.bandwidth);

  const basename = assetId;

  let masterPlaylist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3'
  ].concat(
    asset.audioStreams.map(entry => `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${entry.bitrate}",CHANNELS="${entry.bitrate.indexOf('ac3') !== -1 ? 6 : 2}",NAME="audio",AUTOSELECT=YES, DEFAULT=YES,URI="${entry.filename}"`)
  );

  const audioStreams = asset.audioStreams.length === 0 ? [null] : asset.audioStreams;
  for (let audio of audioStreams) {
    masterPlaylist = masterPlaylist.concat(playlists.filter(entry => entry.bandwidth > 2048)
      .map(entry => {
        const audioCodec = audio ? (audio.codec || (audio.bitrate.indexOf('ac3') !== -1 ? 'ac-3' : 'mp4a.40.2')) : null;
        const audioBandwidth = audio ? (audio.bandwidth || (parseInt(audio.bitrate.split('-')[1]) * 1024)) : 0;
        const codecs = audio ? `,CODECS="avc1.640029,${audioCodec}",AUDIO="${audio.bitrate}"` : '';
        return `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=${entry.bandwidth + audioBandwidth},RESOLUTION=${entry.resolution}${codecs}\n` +
          path.basename(entry.filename)
      }));
  }

  if (s3) {
    await s3.putObject({
      Bucket: config.s3.bucket,
      Key: `${basename}/${basename}.m3u8`,
      Body: masterPlaylist.join('\n')
    }).promise();
  }
  else if (bunnycdnStorage) {
    await bunnycdnStorage.put(`${basename}/${basename}.m3u8`, masterPlaylist.join('\n'));
  }

  if (!s3) {
    await fs.writeFile(`${config.output}/${basename}/${basename}.m3u8`, masterPlaylist.join('\n'));
  }
};

export default masterPlaylist;
