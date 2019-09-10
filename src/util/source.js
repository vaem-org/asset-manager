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
import { URL } from 'url';
import { computeSignature, getSignedUrl } from '@/util/url-signer';

const execFile = util.promisify(child_process.execFile);
/**
 * Check the http seekable option for given source
 */
export function getSeekable(source) {
  if (!/^https?:/.exec(source)) {
    return undefined;
  }
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

  const url = '/' + source.split('/').map(encodeURIComponent).join('/');
  return `${config.base}/source${getSignedUrl(url, 8*3600)}`;
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
  const {stdout} = await execFile('ffprobe', getParams({
    v: 'quiet',
    print_format: 'json',
    show_format: true,
    show_streams: true,
    seekable: getSeekable(source),
  }).concat([source]));

  const sourceParameters = JSON.parse(stdout);

  result['bitrate'] = sourceParameters['format']['bit_rate'] / 1024;
  let hasAudio = false;

  _.each(sourceParameters['streams'], (stream, i) => {
    hasAudio = hasAudio || stream['codec_type'] === 'audio';

    if (stream['codec_type'] === 'video') {
      result['width'] = stream['width'];
      result['height'] = stream['height'];
      result['video'] = i;
    }
    else if (
      stream['codec_type'] === 'audio' && stream['channels'] === 1 &&
      stream.channel_layout && /\(DL|DR\)/.exec(stream.channel_layout)
    ) {
      downmix.push(i);
    }
    else if (
      stream['codec_type'] === 'audio' && stream['channels'] === 2 &&
      stream.channel_layout === 'downmix'
    ) {
      downmix.push(i);
    }
    else if (stream['codec_type'] === 'audio' && stream['channels'] === 1) {
      monoChannels.push(i);
    }
    else if (stream['codec_type'] === 'audio') {
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
  }
  else if (audioStreams) {
    result['mixAudio'] = {};
    result.audio = audioStreams[0];
  }

  if (!audioStreams && downmix.length === 1) {
    result['mixAudio'] = {};
    result.audio = downmix[0];
  }

  result.audioStreams = result.mixAudio ? (audioStreams || monoChannels).slice(0, 2) : [result.audio];

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
  const parameters =  await getVideoParameters(source);

  if (!parameters.hasAudio) {
    return null;
  }

  const audioStreams = _.filter(_.get(parameters, 'ffprobe.streams'), {codec_type: 'audio'});

  const numChannels = _.sumBy(audioStreams, 'channels');
  let surround = [];

  const surroundTrack = _.find(audioStreams, {channels: 6});
  if (surroundTrack) {
    surround = [surroundTrack];
  }
  else if (numChannels >= 6 && _.find(audioStreams, stream => /FL/.exec(stream.layout))) {
    const index = _.findIndex(audioStreams, stream => /FL/.exec(stream.layout));
    surround = audioStreams.slice(index, index+6);
  }
  else if (numChannels >= 6) {
    // assume first 2 channels are for downmix stereo
    surround = audioStreams.slice(2);
  }

  return {
    stereo: parameters.audioStreams.length > 0 ? parameters.audioStreams  : _.map(_.filter(audioStreams, {channels: 2}), 'index'),
    surround: _.map(surround, 'index')
  };
}

/**
 * Perform a first pass for audio normalization and return the audio filter string
 * @param {string} source
 * @param {[]} parameters
 * @return {Promise<string>}
 */
export async function getNormalizeParameters(source, parameters = ['-map', '0:1']) {
  const {stderr} = await execFile('ffmpeg', ['-hide_banner', '-i', source, '-filter:a', 'loudnorm=print_format=json', '-f', 'null', ...parameters, '-']);

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
 * @returns {Promise<[]|Array>}
 */
export async function getAudioJobs(asset, file, source) {
  const jobs = [];

  if (!asset.videoParameters.hasAudio) {
    return [];
  }

  const { surroundMap, stereoMap } = await getChannelMapping(file, source);

  ['64k', '128k'].forEach(bitrate => {
    jobs.push({
      bitrate: `aac-${bitrate}`,
      codec: 'mp4a.40.2',
      bandwidth: parseInt(bitrate) * 1024,
      options: _.merge({}, {
        'b:a': bitrate,
        'c:a': 'libfdk_aac',
        'ac': 2,
        'vn': true
      }, stereoMap)
    });
  });

  if (!_.isEmpty(surroundMap)) {
    jobs.push({
      bitrate: 'ac3-448k',
      codec: 'ac-3',
      bandwidth: 448 * 1024,
      options: _.merge({}, {
        'c:a': 'ac3',
        'ac': 6,
        'vn': true
      }, surroundMap)
    });
  }

  return jobs;
}
