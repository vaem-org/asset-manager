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
import util from 'util';
import config from '../../../config/config';
import getParams from './get-params';

const execFile = util.promisify(child_process.execFile);
/**
 * Check the http seekable option for given source
 */
const getSeekable = source => {
  if (!/^https?:/.exec(source)) {
    return undefined;
  }
  return /\.mxf$/i.exec(source) ? 0 : -1;
};

/**
 * Get an absolute path for given source
 * @param {{}} req
 * @param {string} source
 */
const getSource = (req, source) => {
  if (/^https?:/.exec(source)) {
    return source;
  }

  return (config.sourceBase || (`${req.protocol}://${req.get('host')}/source/`)) +
    source.split('/').map(encodeURIComponent).join('/');
};

/**
 * Get video parameters
 * @param {String} source
 * @param {[] | null} [audioStreams] the audio streams to use
 */
const getVideoParameters = async (source, audioStreams = null) => {
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
    seekable: getSeekable(source)
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
};

const guessChannelLayout = async source => {
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
    stereo: parameters.audioStreams,
    surround: _.map(surround, 'index')
  };
};

export {getSeekable, getVideoParameters, getSource, guessChannelLayout};