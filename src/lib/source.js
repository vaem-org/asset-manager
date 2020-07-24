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

import child_process from 'child_process';
import _ from 'lodash';
import util from 'util';
import config from '../config';
import getParams from './get-params';
import { getSignedUrl } from '@/lib/url-signer';

const execFile = util.promisify(child_process.execFile);

/**
 * Check the http seekable option for given source
 */
export function getSeekable(source) {
  return /\.mxf$/i.exec(source) ? 0 : -1;
}

/**
 * Get an absolute path for given source
 * @param {string} source
 */
export function getSource(source) {
  if (/^https?:/.exec(source)) {
    return source;
  }

  if (config.localSource) {
    return `${config.source}/${source}`;
  }

  const url = '/' + source.split('/').map(encodeURIComponent).join('/');
  return `${config.sourceBase}${getSignedUrl(url, 16 * 3600)}`;
}

export async function ffprobe(source) {
  return new Promise((accept, reject) => execFile('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    source
  ], (error, stdout) => {
    if (error) {
      return reject(error);
    }

    try {
      accept(JSON.parse(stdout));
    } catch (e) {
      accept('Unable to parse ffprobe output');
    }
  }));
}

/**
 * Get video parameters
 * @param {String} source
 * @param {[] | null} [audioStreams] the audio streams to use
 */
export async function getVideoParameters(source, audioStreams = null) {
  const result = {
    'bitrate': 0,
    'width': false,
    'height': false,
    'mixAudio': false,
    'duration': 0,
    'video': 0,
    'audio': 1
  };

  let monoChannels = [];
  const downmix = [];

  const sourceParameters = await ffprobe(source);

  result['bitrate'] = sourceParameters['format']['bit_rate'] / 1024;
  let hasAudio = false;

  _.each(sourceParameters['streams'], (stream, i) => {
    hasAudio = hasAudio || stream['codec_type'] === 'audio';

    if (stream['codec_type'] === 'video') {
      result['width'] = stream['width'];
      result['height'] = stream['height'];
      result['video'] = i;
    } else if (
      stream['codec_type'] === 'audio' && stream['channels'] === 1 &&
      stream.channel_layout && /\(DL|DR\)/.exec(stream.channel_layout)
    ) {
      downmix.push(i);
    } else if (
      stream['codec_type'] === 'audio' && stream['channels'] === 2 &&
      stream.channel_layout === 'downmix'
    ) {
      downmix.push(i);
    } else if (stream['codec_type'] === 'audio' && stream['channels'] === 1) {
      monoChannels.push(i);
    } else if (stream['codec_type'] === 'audio') {
      result.audio = i;
    }
  });

  result['duration'] = sourceParameters['format']['duration'];

  if (downmix.length > 0) {
    monoChannels = downmix;
  }

  result['mixAudio'] = monoChannels.length >= 2 ? {
    'filter_complex': `[0:${monoChannels[0]}][0:${monoChannels[1]}]amerge=inputs=2[aout]`,
    'map': [`0:${result.video}`, '[aout]']
  } : {};

  if (audioStreams && audioStreams.length > 1) {
    result['mixAudio'] =
      {
        'filter_complex': `[0:${audioStreams[0]}][0:${audioStreams[1]}]amerge=inputs=2[aout]`,
        'map': [`0:${result.video}`, '[aout]']
      };
  } else if (audioStreams) {
    result['mixAudio'] = {};
    result.audio = audioStreams[0];
  }

  if (!audioStreams && downmix.length === 1) {
    result['mixAudio'] = {};
    result.audio = downmix[0];
  }

  result.audioStreams = result.mixAudio ? (audioStreams || monoChannels).slice(0,
    2) : [result.audio];

  result.hasAudio = hasAudio;

  result.ffprobe = sourceParameters;

  return result;
}

/**
 * Guess the channel layout for a source file
 * @param {string} source
 * @return {Promise<{stereo: [int], surround: [int]}>}
 */
export async function guessChannelLayout(source) {
  const parameters = await getVideoParameters(source);

  if (!parameters.hasAudio) {
    return null;
  }

  const audioStreams = _.filter(_.get(parameters, 'ffprobe.streams'), { codec_type: 'audio' });

  const numChannels = _.sumBy(audioStreams, 'channels');
  let surround = [];

  const surroundTrack = _.find(audioStreams, { channels: 6 });
  if (surroundTrack) {
    surround = [surroundTrack];
  } else if (numChannels >= 6 && _.find(audioStreams, stream => /FL/.exec(stream.layout))) {
    const index = _.findIndex(audioStreams, stream => /FL/.exec(stream.layout));
    surround = audioStreams.slice(index, index + 6);
  } else if (numChannels >= 6) {
    // assume first 2 channels are for downmix stereo
    surround = audioStreams.slice(2);
  }

  return {
    stereo: parameters.audioStreams.length > 0 ? parameters.audioStreams : _.map(_.filter(
      audioStreams,
      { channels: 2 }), 'index'),
    surround: _.map(surround, 'index')
  };
}

/**
 * Perform a first pass for audio normalization and return the audio filter string
 * @param {string} source
 * @param {string} [map]
 * @param {string} [filter_complex]
 * @return {Promise<string>}
 */
export async function getNormalizeParameters({ source, map, filter_complex }) {
  const filter = 'loudnorm=print_format=json';
  const parameters = filter_complex ?
    ['-filter_complex', filter_complex + ',[aout]' + filter] :
    ['-filter:a', filter, '-map', map]
  ;

  const { stderr } = await execFile('ffmpeg',
    ['-hide_banner', '-i', source, '-f', 'null', ...parameters, '-']);

  const parsed = JSON.parse(stderr.split('\n').slice(-13).join('\n'));

  return [
    'loudnorm=linear=true',
    `measured_I=${parsed['input_i']}`,
    `measured_LRA=${parsed['input_lra']}`,
    `measured_tp=${parsed['input_tp']}`,
    `measured_thresh=${parsed['input_thresh']}`,
    `offset=${parsed['target_offset']}`
  ].join(':');
}

/**
 * Get the audio channel mapping for a file
 * @param {File} file
 * @param {String} source
 * @returns {Promise<{stereoMap: *, surroundMap: *}>}
 */
export async function getChannelMapping(file, source) {
  const channels = file && !_.isEmpty(file.audioStreams) ? file.audioStreams : await guessChannelLayout(
    source);

  // check validity of channel layout
  if (channels.stereo.length > 2) {
    throw 'Too many stereo channels';
  }

  if ([0, 1, 6].indexOf(channels.surround.length) === -1) {
    throw 'Invalid number of surround channels';
  }

  let surroundMap = null;
  if (!_.isEmpty(channels.surround)) {
    surroundMap = channels.surround.length > 1 ? {
      'filter_complex': `${channels.surround.map(stream => `[0:${stream}]`)
      .join('')}amerge=inputs=6[aout]`,
      'map': '[aout]'
    } : {
      'map': `0:${channels.surround[0]}`,
    }
  }

  let stereoMap = null;
  if (channels.stereo.length > 1) {
    stereoMap = {
      'filter_complex': `${channels.stereo.map(stream => `[0:${stream}]`)
      .join('')}amerge=inputs=2[aout]`,
      'map': '[aout]'
    };
  } else if (channels.stereo.length === 1) {
    stereoMap = {
      'map': `0:${channels.stereo[0]}`
    };
  } else {
    // if no stereo channels are available downmix the surround channel to stereo
    stereoMap = surroundMap;
  }

  return {
    surroundMap,
    stereoMap
  }
}

/**
 * Get jobs for encoding audio
 * @param {Asset} asset
 * @param {File} file
 * @param {String} source
 * @returns {Promise<{}>}
 */
export async function getAudioJob(asset, file, source) {
  if (!asset.videoParameters.hasAudio) {
    return [];
  }

  const { surroundMap, stereoMap } = await getChannelMapping(file, source);

  const filterComplex = [
    ...(stereoMap && stereoMap.filter_complex ? [stereoMap.filter_complex, '[aout]asplit=2[aout1][aout2]'] : []),
    ...(surroundMap && surroundMap.filter_complex ? [surroundMap.filter_complex.replace('[aout]',
      '[surround]')] : [])
  ].join(',');

  const stereo = stereoMap && stereoMap.filter_complex ? false : stereoMap.map;

  return {
    bitrate: ['aac-64k', 'aac-128k', ...(surroundMap ? ['ac3-448k'] : [])],
    codec: ['mp4a.40.2', 'mp4a.40.2', ...(surroundMap ? ['ac-3'] : [])],
    bandwidth: [64 * 1024, 128 * 1024, ...(surroundMap ? [448 * 1024] : [])],
    varStreamMap: ['a:0,name:audio-0', 'a:1,name:audio-1', ...(surroundMap ? ['a:2,name:audio-2'] : [])].join(
      ' '),
    arguments: [
      '-b:a:0', '64k',
      '-b:a:1', '128k',
      '-c:a:0', 'libfdk_aac',
      '-c:a:1', 'libfdk_aac',
      '-ac:0', 2,
      '-ac:1', 2,
      ...(filterComplex ? ['-filter_complex', filterComplex] : []),

      ...(surroundMap ? [
        '-b:a:2', '448k',
        '-ac:2', 6,
        '-c:a:2', 'ac3'
      ] : []),

      ...[
        stereo || '[aout1]',
        stereo || '[aout2]',
        ...(surroundMap && surroundMap.filter_complex ? ['[surround]'] : []),
        ...(surroundMap && !surroundMap.filter_complex ? [surroundMap.map] : []),
      ].map(map => ['-map', map]).flat(),
    ],
  };
}
