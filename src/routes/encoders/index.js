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

import config from '@/config';
import axios from 'axios';
import _ from 'lodash';
import path from 'path';
import { Router, json } from 'express';
import crypto from 'crypto';
import { URL } from 'url';
import { Mutex } from 'async-mutex';
import fixKeys from '@/util/fix-keys';
import {
  getSeekable,
  getSource,
  getVideoParameters,
  getAudioJob,
  getChannelMapping
} from '@/util/source';
import { api, verify } from '@/util/express-helpers';
import * as settings from '@/model/settings';
import { File } from '@/model/file';
import { Asset } from '@/model/asset';
import masterPlaylist from '@/util/master-playlist';
import { socketio } from '@/util/socketio';
import { getSignedUrl } from '@/util/url-signer';
import { startEncoders } from '@/util/azure-instances';

const encoderIO = socketio.of('/encoder', null);
const browserIO = socketio.of('/encoders-io', null);
const globalIO = socketio.of('/global', null);

const router = new Router({});

router.use(verify);

const encoders = {};
const sockets = {};
let encoderId = 1;

const sources = {};

const autoScaleEncoders = !!config.azureInstances.clientId;

let queue = [];
/**
 * Process queue and give each encoder a job if there is one available
 */
const encoder2Job = {};
let creatingEncoders = false;

const queueMutex = new Mutex();

async function processQueue() {
  let noEncoders = false;
  if (queue.length === 0) {
    return;
  }

  const release = await queueMutex.acquire();

  if (Object.keys(encoders).length === 0 && autoScaleEncoders && !creatingEncoders) {
    // create encoders
    creatingEncoders = true;

    console.info('Creating encoder instances');
    await startEncoders();

    creatingEncoders = false;
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
      return !encoder2Job[encoder.id] && encoder.state.status === 'idle';
    });

    if (freeEncoder) {
      const current = queue[0];
      const id = freeEncoder.id;

      encoder2Job[id] = current;

      console.log(`Starting job on encoder ${id}`);
      const asset = sources[current.source].asset;

      if (asset.state !== 'processing') {
        asset.state = 'processing';
        Asset.updateOne({
          _id: asset._id
        }, {
          $set: {
            state: 'processing'
          }
        })
        .catch(err => {
          console.log('Unable to set state of asset to processing', err);
        });
      }

      // give encoder his job
      const response = await new Promise((accept) => {
        sockets[id].emit('new-job', _.assign({}, _.omit(current, 'next'), {
          source: current.audio ? [current.source, current.audio] : current.source
        }), accept);
      });

      console.log('Response from encoder: ', response);

      console.log('Job started.');
      queue.shift();
      browserIO.emit('queue-update', queue.length);
    } else {
      console.log('Currently no encoders available');
      noEncoders = true;
    }
  }

  release();
}

/**
 * Called when an encoder is done
 * @param id
 */
const encoderDone = id => {
  if (encoder2Job[id]) {
    delete encoder2Job[id];
  }

  console.log(`Encoder ${id} done.`);
  processQueue()
    .catch(e => console.error(e));
};

// check for idle encoders
if (autoScaleEncoders) {
  setInterval(() => {
    if (queue.length !== 0) {
      return;
    }

    Object.values(encoders).forEach(encoder => {
      if (encoder.state.status === 'idle') {
        console.log(`Quitting encoder ${encoder.id}`);
        sockets[encoder.id].emit('quit');
      }
    });
  }, 5000);
}

const sourceDone = async source => {
  console.log('Source has completed: ', source);
  const asset = await Asset.findById(sources[source].asset.id);

  try {
    await masterPlaylist(asset._id);

    globalIO.emit('info', `Encoding asset "${asset.title}" completed`);

    console.info(`"${asset.title}" completed in ${Math.round((Date.now() - sources[source].started) / 1000)} seconds`);

    if (config.slackHook) {
      axios.post(config.slackHook, {
        text: `Transcoding asset complete: "${asset.title}"`
      }).catch(e => {
        console.error(`Unable to use Slack hook, ${e.toString()}`)
      });
    }

    asset.state = 'processed';
    await asset.save();

    delete sources[source];
  }
  catch (e) {
    console.log(e);
  }
};

/**
 * Update an asset
 * @param {String} assetId
 * @param {{}} data
 * @param {{}} job
 * @returns {Promise<*>}
 */
async function updateStream({ assetId, data, job }) {
  const asset = await Asset.findById(assetId);
  asset.bitrates = asset.bitrates.concat(job.bitrate);
  asset.markModified('bitrates');

  // store output resolution
  const stream = _.find(_.get(data, 'ffprobes[0].streams', []), { codec_type: 'video' });

  if (stream) {
    const aspect = _.get(stream, 'display_aspect_ratio', '')
      .split(':')
      .map(value => parseInt(value))
      .filter(value => value)
    ;

    asset.streams.push({
      filename: path.basename(data.filenames[0]),
      bandwidth: parseInt(job.bitrate) * 1024,
      resolution:
        aspect.length > 0 ? Math.max(stream.width,
          Math.floor(stream.height / aspect[1] * aspect[0])) + 'x' + stream.height :
          `${stream.width}x${stream.height}`
      ,
      codec: 'avc1.640029'
    });
  }

  if (job.bitrate instanceof Array) {
    for (let i = 1; i < job.bitrate.length; i++) {
      asset.audioStreams.push({
        filename: path.basename(data.filenames[i]),
        bitrate: job.bitrate[i],
        bandwidth: job.bandwidth[i],
        codec: job.codec[i]
      });
    }
  }

  await asset.save();

  return asset;
}

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

    if (data.token !== config.encoderToken) {
      return callback(null);
    }

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
            processQueue()
              .catch(e => console.error(e))
            ;
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
          updateStream({
            assetId: source.asset._id,
            data,
            job
          }).then(asset => {
            source.asset = asset;
            const emit = () => globalIO.emit('job-completed', _.pick(asset, ['_id', 'bitrates', 'jobs', 'state']));

            if (source.completed === source.jobs.length) {
              source.asset.state = 'processed';
              sourceDone(filename)
                .then(emit)
                .catch(e => console.error(e));
            } else if (asset) {
              emit();
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
      encoderId: id,
      destinationFileSystem: process.env.DESTINATION_FS
    });

    if (encoder2Job[id]) {
      delete encoder2Job[id];
    }
  });
});

router.get('/', api(async () => encoders));

router.get('/queue', api(async () => queue));

router.post('/start-job', json(), api(async req => {
  let file = req.body.fileId ? await File.findById(req.body.fileId) : null;

  if (!file && req.body.fileId) {
    throw 'File not found';
  }

  let todo = [];
  let source = file ? getSource(file.name) : null;

  let videoParameters = file ? await getVideoParameters(source,
    _.get(file, 'audioStreams.length') ? file.audioStreams : null) : null;

  let basename = source && path.basename(source);
  let audio = req.body.audio;

  let asset;

  if (req.body.assetId) {
    asset = await Asset.findById(req.body.assetId).populate('file');
    file = asset.file;

    if (!asset) {
      throw 'No asset';
    }
    source = getSource(asset.file ? asset.file.name : asset.source);
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
      file,
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

  const hlsKeyInfoFile = `${config.base}/encoders/keyinfo${getSignedUrl(`/${asset._id}`, 16*3600)}`;

  const outputBase = `/output${getSignedUrl(`/${asset._id}`, 16*3600)}`;

  const { stereoMap } = await getChannelMapping(file, source);

  // check if extra audio tracks need to be added
  const audioJob = config.separateAudio ? await getAudioJob(asset, file, source) : null;

  // prepare the jobs array
  const profiles = Object.keys(config.profiles)
    .filter(width => width <= videoParameters.width)
    .map(width => {
      return config.profiles[width]
        .filter(bitrate => !asset.bitrates.includes(bitrate))
        .map(bitrate => ({width, bitrate}))
    })
    .flat()
    .reverse()
  ;

  let audioMap = '0:a';

  if (stereoMap) {
    audioMap = stereoMap.map ? stereoMap.map : '[aout]';
  }

  for(let i=0; i<profiles.length; i++) {
    const { width, bitrate } = profiles[i];

    let bitrateString = `${bitrate}k`;
    const job = {
      source,
      audio,
      videoParameters,
      bitrate: bitrateString,
      m3u8: `${outputBase}/${basename}.${bitrateString}.m3u8`,
      hlsEncKey: config.hlsEnc ? asset.hls_enc_key : false,
      segmentFilename: `${asset._id}.${bitrate}.%05d.ts`
    };

    let audioArguments = [];

    if (!config.separateAudio && asset.videoParameters.hasAudio) {
      audioArguments = [
        '-map', audioMap,
        ...(stereoMap && stereoMap.filter_complex ? ['-filter_complex', stereoMap.filter_complex] : []),
        '-c:a', 'libfdk_aac',
        '-ac', 2,
        '-b:a', '128k',
      ]
    } else if (i === 0 && asset.videoParameters.hasAudio) {
      // add audio variants
      Object.assign(job, {
        bitrate: [bitrateString, ...audioJob.bitrate],
        codec: ['avc1.640029', ...audioJob.codec],
        bandwidth: [bitrate*1024, ...audioJob.bandwidth],
        segmentFilename: `${asset._id}.%v.%05d.ts`,
        m3u8: `${outputBase}/${basename}.%v.m3u8`
      });

      audioArguments = [
        ...audioJob['arguments'],
        '-var_stream_map', `v:0,name:${bitrateString} ${audioJob.varStreamMap}`
      ]
    }

    todo.push({
      ...job,
      arguments: [
        '-seekable', getSeekable(source),
        '-i', source,

        // output
        '-f', 'hls',
        '-hls_list_size', 0,
        '-hls_playlist_type', 'vod',
        '-hls_time', 2,
        ...(config.hlsEnc ? ['-hls_key_info_file', hlsKeyInfoFile] : []),

        // video options
        '-map', '0:v',
        '-vcodec', 'libx264',
        '-vprofile', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-g', 2 * Math.ceil(framerate),
        '-x264opts', 'no-scenecut',
        '-vf', (req.body.vf ? req.body.vf + '[out];[out]' : '') + `scale=${width}:trunc(ow/dar/2)*2`,
        '-b:v', bitrateString,
        '-maxrate', bitrateString,
        '-bufsize', bitrateString,

        // audio options
        ...audioArguments
      ]
    })
  }

  if (todo.length === 0) {
    throw 'No jobs left';
  }

  await asset.save();

  if (!req.body.assetId) {
    globalIO.emit('asset-added', {
      id: asset._id
    });
  }

  sources[source] = {
    completed: 0,
    started: Date.now(),
    jobs: todo,
    asset: asset
  };

  queue = queue.concat(todo);

  browserIO.emit('queue-update', queue.length);

  if (!req.body.assetId) {
    asset.jobs = _.map(todo, job => {
      return job.arguments.map(value => {
        if (value.startsWith && value.startsWith('-')) {
          return value;
        } else {
          return `'${value}'`;
        }
      }).join(' ')
    });
    asset.numStreams = _.sumBy(todo, job => _.isArray(job.bitrate) ? job.bitrate.length : 1);
    await asset.save();
  }

  // add job to queue
  processQueue()
    .catch(e => console.error(e));

  if (file) {
    file.asset = asset._id;
    await file.save();
  }

  globalIO.emit('info', `Jobs added for "${asset.title}"`);
}));

router.post('/update', api(async () => encoderIO.emit('update')));

router.post('/:id/priority', json(), api(async req => {
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
  const parsed = new URL(config.base);
  parsed.username = process.env.ENCODER_TOKEN;
  return `docker run --name encoder -d --rm -e ASSETMANAGER_URL=${parsed.toString()} vaem/encoder`;
}));

browserIO.on('connection', socket => {
  socket.on('disconnect', () => {
    console.log('Browser disconnected');
  });
});

export default router;
