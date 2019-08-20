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

import config from '~config';
import request from 'request';
import _ from 'lodash';
import path from 'path';
import { Router, json } from 'express';
import crypto from 'crypto';
import fixKeys from '~/util/fix-keys';
import { getSeekable, getSource, getVideoParameters, guessChannelLayout } from '~/util/source';
import { api, catchExceptions } from '~/util/express-helpers';
import * as settings from '~/model/settings';
import { File } from '~/model/file';
import { Asset } from '~/model/asset';
import masterPlaylist from '~/util/master-playlist';
import { URL } from 'url';
import { socketio } from '~/util/socketio';

const getAudioJobs = async (asset, file, source) => {
  const jobs = [];

  if (!asset.videoParameters.hasAudio) {
    return [];
  }

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

  if (!_.isEmpty(channels.surround)) {
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
};

const encoderIO = socketio.of('/encoder', null);
const browserIO = socketio.of('/encoders', null);

const router = new Router({});

const encoders = {};
const sockets = {};
let encoderId = 1;

const sources = {};

let queue = [];
/**
 * Process queue and give each encoder a job if there is one available
 */
const encoder2Job = {};
const processQueue = () => {
  let noEncoders = false;
  if (queue.length === 0) {
    return;
  }

  const sortedEncoders = _.orderBy(
    _.map(
      encoders,
      (obj, id) => _.extend({}, obj, { id: id })
    ),
    'info.priority', 'desc'
  );

  let jobStarted = false;

  while (queue.length > 0 && !noEncoders) {
    jobStarted = false;

    const freeEncoder = _.find(sortedEncoders, encoder => {
      return !encoder2Job[encoder.id] && ['idle', 'error'].indexOf(encoder.state.status) !== -1;
    });

    if (freeEncoder) {
      const current = queue[0];
      const id = freeEncoder.id;

      encoder2Job[id] = current;

      console.log(`Starting job on encoder ${id}`);

      sources[current.source].asset.state = 'processing';
      sources[current.source].asset.save()
      .catch(err => {
        console.log('Unable to set state of asset to processing', err);
      });

      // give encoder his job
      sockets[id].emit('new-job', _.assign({}, _.omit(current, 'next'), {
        source: current.audio ? [current.source, current.audio] : current.source
      }), response => {
        console.log('Response from encoder: ', response);
      });

      console.log('Job started.');
      queue.shift();
      browserIO.emit('queue-update', queue.length);
    } else {
      console.log('Currently no encoders available');
      noEncoders = true;
    }
  }
};

/**
 * Called when an encoder is done
 * @param id
 */
const encoderDone = id => {
  if (encoder2Job[id]) {
    delete encoder2Job[id];
  }

  console.log(`Encoder ${id} done.`);
  processQueue();
};

const sourceDone = async source => {
  console.log('Source has completed: ', source);
  const asset = sources[source].asset;

  try {
    await masterPlaylist(asset._id);

    browserIO.emit('source-done', {
      filename: source,
      source: sources[source],
      started: sources[source].started,
      ended: (new Date()).getTime()
    });

    if (config.slackHook) {
      request({
        url: config.slackHook,
        method: 'POST',
        json: {
          text: `Transcoding asset complete: "${sources[source].asset.title}"`
        }
      });
    }

    asset.state = 'processed';
    asset.save();

    delete sources[source];

  }
  catch (e) {
    console.log(e);
  }
};

const getUrl = (req, relative) => {
  const parsed = new URL(req.base);
  const auth = config.auth;
  return `${parsed.protocol}//${auth.username}:${auth.password}@${parsed.host}${relative}`;
};

/**
 * Get the class of the encoder (using the cpu info)
 * @param {{}} encoder the object describing the encoder
 * @return String
 */
const getEncoderClass = encoder => _.map(encoder.info.cpus, 'model').join(', ').replace(/\./g, '-');

encoderIO.on('connection', function (socket) {
  console.log('New connection');

  socket.on('request-encoder-id', (data, callback) => {
    const id = data.encoderId && !encoders[data.encoderId] ? data.encoderId : (encoderId++);
    encoders[id] = {
      id,
      currentlyProcessing: {},
      info: {},
      state: {
        status: 'idle'
      },
      progress: {}
    };
    sockets[id] = socket;

    let initialized = false;

    if (data.encoderId) {
      encoderId = Math.max(encoderId, data.encoderId + 1);
    }

    ['info', 'currently-processing', 'state', 'progress'].forEach(event => {
      socket.on(event, async data => {
        const emit = () => {
          browserIO.emit(event, {
            id: id,
            data: data
          });
        };

        if (event === 'info') {
          // update priority according to settings
          const _settings = await settings.get('/encoders');
          encoders[id][_.camelCase(event)] = data;
          const priority = (_settings.values.priorities || {})[getEncoderClass(encoders[id])];
          if (priority) {
            encoders[id].info.priority = priority;
          }

          emit();
          console.log('Received info');

          if (!initialized) {
            initialized = true;
            console.log('Starting queue');
            processQueue();
          }
        } else {
          encoders[id][_.camelCase(event)] = data;
          emit();
        }

        if (event === 'state' && ['idle', 'error'].indexOf(data.status) !== -1) {
          encoderDone(id);
        }
      });
    });

    socket.on('m3u8', data => {
      _.each(sources, (source, filename) => {
        const job = _.find(source.jobs, { m3u8: data.filename });
        if (job) {
          source.completed++;
          source.asset.bitrates.push(job.options.maxrate || job.bitrate);

          // store output resolution
          const stream = _.find(_.get(data, 'ffprobe.streams', []), { codec_type: 'video' });

          if (stream) {
            const aspect = _.get(stream, 'display_aspect_ratio', '')
              .split(':')
              .map(value => parseInt(value))
              .filter(value => value)
            ;

            source.asset.streams.push({
              filename: path.basename(data.filename),
              bandwidth: parseInt(job.options.maxrate) * 1024,
              resolution:
                aspect.length > 0 ? Math.max(stream.width,
                  Math.floor(stream.height / parseInt(aspect[1]) * parseInt(aspect[0]))) + 'x' + stream.height :
                  `${stream.width}x${stream.height}`
              ,
              codec: 'avc1.640029'
            });
          } else {
            source.asset.audioStreams.push({
              filename: path.basename(data.filename),
              bitrate: job.bitrate,
              bandwidth: parseInt(job.bitrate) * 1024,
              codec: job.codec
            });
          }

          source.asset.save(err => {
            if (err) {
              console.log('Unable to add bitrate to asset');
            }

            if (source.completed === source.jobs.length) {
              sourceDone(filename)
              .catch(e => console.error(e));
            }
          });
        }
      });
    });

    socket.on('disconnect', () => {
      console.log('Lost connection');
      delete encoders[id];
      delete sockets[id];
      browserIO.emit('removed', { id: id });
    });

    browserIO.emit('new', {
      id: id,
      data: encoders[id]
    });

    callback({
      encoderId: id
    });

    if (encoder2Job[id]) {
      delete encoder2Job[id];
    }
  });
});

router.get('/items', api(async () => encoders));

router.get('/queue', api(async () => queue));

router.get('/keyinfo/:assetId', catchExceptions(async (req, res, next) => {
  const asset = await Asset.findById(req.params.assetId);

  if (!asset) {
    return next();
  }

  return res.send([
    'file.key',
    getUrl(req, `/keyinfo/${req.params.assetId}/file.key`),
    asset.hls_enc_iv
  ].join('\n'));
}));

router.get('/keyinfo/:assetId/file.key', catchExceptions(async (req, res, next) => {
  const asset = await Asset.findById(req.params.assetId);

  if (!asset) {
    return next();
  }

  return res.send(Buffer.from(asset.hls_enc_key, 'hex'));
}));

router.post('/start-job', json(), api(async req => {
  const file = req.body.fileId ? await File.findById(req.body.fileId) : null;

  if (!file && req.body.fileId) {
    throw 'File not found';
  }

  let todo = [];
  let source = file ? getSource(req, file.name) : null;

  let videoParameters = file ? await getVideoParameters(source,
    _.get(file, 'audioStreams.length') ? file.audioStreams : null) : null;

  let basename = source && path.basename(source);
  let audio = req.body.audio;

  let asset;

  if (req.body.assetId) {
    asset = await Asset.findById(req.body.assetId);

    if (!asset) {
      throw 'No asset';
    }
    source = getSource(req, asset.source);
    audio = asset.audio;

    basename = path.basename(source);
    videoParameters = asset.videoParameters;
  } else {
    asset = new Asset({
      title: decodeURIComponent(basename.replace(/\.([^.]+)$/, '')),
      basename: basename,
      videoParameters: fixKeys(videoParameters),
      state: 'new',
      source,
      audio,
      hls_enc_key: config.hlsEnc ? crypto.randomBytes(16).toString('hex') : null,
      hls_enc_iv: config.hlsEnc ? crypto.randomBytes(16).toString('hex') : null
    });
  }

  basename = asset._id;

  let framerate = 25;

  const rFrameRate = _.get(_.find(_.get(asset, 'videoParameters.ffprobe.streams'),
    { codec_type: 'video' }), 'r_frame_rate', '').split('/').map(i => parseInt(i));

  if (rFrameRate.length === 2) {
    framerate = rFrameRate[0] / rFrameRate[1];
  }

  // prepare the jobs array
  _.each(config.profiles, (profiles, width) => {
    width = parseInt(width);
    if (width <= videoParameters.width) {
      todo = todo
      .concat(_.filter(profiles, profile => asset.bitrates.indexOf(profile.maxrate) === -1)
      .map(options => (
        {
          source,
          audio,
          options: _.extend({}, options,
            {
              'ss': req.body.ss || null,
              'vf': (req.body.vf ? req.body.vf + '[out];[out]' : '') + options.vf,
              'f': 'mpegts',
              'map': `0:${videoParameters.video}`,
              'seekable': getSeekable(source),
              'vcodec': 'libx264',
              'vprofile': 'high',
              'level': '4.1',
              'preset': 'slow',
              'pix_fmt': 'yuv420p',
              'g': 2 * Math.ceil(framerate),
              'x264opts': 'no-scenecut'
            }
          ),
          videoParameters,
          width: width,
          m3u8: `/output/${basename}/${basename}.${options.maxrate}.m3u8`,
          segmentOptions: config.hlsEnc ? {
            'hls_key_info_file': getUrl(req, `/keyinfo/${asset._id}`)
          } : {},
          hlsEncKey: config.hlsEnc ? asset.hls_enc_key : false
        })));
    }
  });

  await asset.save();

  // check if extra audio tracks need to be added
  const audioJobs = await getAudioJobs(asset, file, source);

  const segmentOptions = {};

  if (config.hlsEnc) {
    segmentOptions.hls_key_info_file = getUrl(req, `/keyinfo/${asset._id}`);
  }

  audioJobs.forEach(job => {
    if (asset.bitrates.indexOf(job.bitrate) !== -1) {
      return;
    }

    todo.unshift({
      source,
      segmentOptions,

      bitrate: job.bitrate,
      options: job.options,
      codec: job.codec,
      m3u8: `/output/${basename}/${basename}.${job.bitrate}.m3u8`,
      hlsEncKey: config.hlsEnc ? asset.hls_enc_key : false
    });
  });

  if (todo.length === 0) {
    throw 'No jobs left';
  }

  sources[source] = {
    completed: 0,
    started: (new Date()).getTime(),
    jobs: todo,
    asset: asset
  };

  queue = queue.concat(todo.reverse());

  browserIO.emit('queue-update', queue.length);

  if (!req.body.assetId) {
    asset.jobs = _.map(todo, 'options');
    await asset.save();
  }

  // add job to queue
  processQueue();

  if (file) {
    file.asset = asset._id;
    await file.save();
  }
}));

router.post('/update', api(async () => encoderIO.emit('update')));

router.post('/encoders/:id/priority', json(), api(async req => {
  if (!encoders[req.params.id]) {
    throw 'Encoder not found';
  }
  const encoderSettings = await settings.get('/encoders');
  encoderSettings.values.priorities = encoderSettings.values.priorities || {};

  const encoderClass = getEncoderClass(encoders[req.params.id]);
  encoderSettings.values.priorities[encoderClass] = parseInt(req.body.priority);
  encoderSettings.markModified('values');

  await encoderSettings.save();
  // update priority in currently active encoders
  _.each(encoders, encoder => {
    if (getEncoderClass(encoder) === encoderClass) {
      encoder.info.priority = parseInt(req.body.priority);
    }
  });
}));

router.delete('/jobs/:index', api(async req => {
  queue.splice(req.params.index, 1);
  browserIO.emit('queue-update', queue.length);
}));

router.get('/docker', api(async req => {
  const url = new URL(req.query.origin);

  return `docker run --name encoder -d --rm -e ASSETMANAGER_URL=${url.protocol}//admin:${config.auth.password}@${url.host} vaem/encoder`;
}));

browserIO.on('connection', socket => {
  socket.on('disconnect', () => {
    console.log('Browser disconnected');
  });
});

export default router;