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
import { execFile as _execFile } from 'child_process';
import path from 'path';
import { Router, json } from 'express';
import crypto from 'crypto';
import { URL } from 'url';
import { Mutex } from 'async-mutex';
import { promisify } from 'util';
import byLine from 'byline';
import fixKeys from '@/lib/fix-keys';
import {
  getSeekable,
  getSource,
  getVideoParameters,
  getAudioJob,
  getChannelMapping
} from '@/lib/source';
import { api, verify } from '@/lib/express-helpers';
import * as settings from '@/model/settings';
import { File } from '@/model/file';
import { Asset } from '@/model/asset';
import { socketio } from '@/lib/socketio';
import { getSignedUrl } from '@/lib/url-signer';
import { startEncoders } from '@/lib/azure-instances';
import { getStreamInfo } from '@/lib/stream';
import { waitFor } from '@/lib/upload-queue';
import { verifyAsset } from '@/lib/verify-asset';

const execFile = promisify(_execFile);

const encoderIO = socketio.of('/encoder', null);
const browserIO = socketio.of('/encoders-io', null);
const globalIO = socketio.of('/global', null);

const router = new Router({});

router.use(verify);

const encoders = {};
const sockets = {};
let encoderId = 1;

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

  const numEncoders = Object.keys(encoders).length;
  if (numEncoders < config.azureInstances.numInstances && autoScaleEncoders && !creatingEncoders) {
    // create encoders
    creatingEncoders = true;

    console.info('Creating encoder instances');
    const numInstances = Math.min(queue.length-numEncoders, config.azureInstances.numInstances);
    if (numInstances > 0) {
      await startEncoders({
        numInstances
      });
    }

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
      const asset = await Asset.findById(current.asset);

      if (asset.state !== 'processing') {
        asset.state = 'processing';
        Asset.updateOne({
          _id: current.asset
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

  if (autoScaleEncoders) {
    setTimeout(() => {
      const encoder = encoders[id];
      if (!encoder || encoder.state?.status !== 'idle') {
        return;
      }

      sockets[encoder.id].emit('quit');
    }, 20000);
  }
};

const assetDone = async asset => {
  console.log(`Asset has completed: ${asset._id}`);

  try {
    await asset.save();

    if (await verifyAsset({ assetId: asset._id })) {
      globalIO.emit('info', `Encoding asset "${asset.title}" completed`);

      if (config.slackHook) {
        axios.post(config.slackHook, {
          text: `Transcoding asset complete: "${asset.title}"`
        }).catch(e => {
          console.error(`Unable to use Slack hook, ${e.toString()}`)
        });
      }
    }
  }
  catch (e) {
    console.log(e);
  }
};

/**
 * Update an asset
 * @param {String} assetId
 * @param {{}} data
 * @returns {Promise<*>}
 */
async function updateStream({ assetId, data }) {
  const asset = await Asset.findById(assetId);
  asset.bitrates = _.uniq(asset.bitrates.concat(data.bitrate));
  asset.markModified('bitrates');

  // store output resolution
  const bitrates = data.bitrate instanceof Array ? data.bitrate : [data.bitrate];

  // ffprobe first bitrate
  const source = await getStreamInfo(assetId, '127.0.0.1');

  let stream;
  let stdout;
  try {
    ({ stdout } = await execFile('ffprobe', [
      '-v','error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      `http://127.0.0.1:${config.port}${source.streamUrl.replace('.m3u8', `.${bitrates[0]}.m3u8`)}`
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

    asset.streams = _.uniqBy([
      ...asset.streams,
      {
      filename: `${assetId}.${bitrates[0]}.m3u8`,
      bandwidth: parseInt(bitrates[0]) * 1024,
      resolution:
        aspect.length > 0 ? Math.max(stream.width,
          Math.floor(stream.height / aspect[1] * aspect[0])) + 'x' + stream.height :
          `${stream.width}x${stream.height}`
      ,
      codec: 'avc1.640029'
    }], 'filename');
  }

  if (data.bitrate instanceof Array) {
    for (let i = 1; i < data.bitrate.length; i++) {
      asset.audioStreams.push({
        filename: `${assetId}.audio-${i-1}.m3u8`,
        bitrate: data.bitrate[i],
        bandwidth: data.bandwidth[i],
        codec: data.codec[i]
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

const handleFileMutex = new Mutex();

const disconnected = new Set();

encoderIO.on('connection', function (socket) {
  console.log('New connection');

  socket.on('request-encoder-id', (data, callback) => {
    const id = data.encoderId && (disconnected.has(data.encoderId) ||!encoders[data.encoderId]) ? data.encoderId : (encoderId++);

    if (data.token !== config.encoderToken) {
      return callback(null);
    }

    const reconnect = disconnected.has(id);
    if (reconnect) {
      console.log(`Reconnection for ${id}`);
      disconnected.delete(id);
    } else {
      encoders[id] = {
        id,
        currentlyProcessing: {},
        info: {},
        state: {
          status: 'idle'
        },
        progress: {}
      };

      if (encoder2Job[id]) {
        delete encoder2Job[id];
      }
    }

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

    // pipe stdout and stderr
    const lineStreams = {
      stdout: byLine(),
      stderr: byLine()
    };

    ['stdout', 'stderr'].forEach(pipe => {
      socket.on(pipe, data => {
        lineStreams[pipe].write(data);
      });

      lineStreams[pipe].on('data', line => {
        console[pipe === 'stdout' ? 'info' : 'error'](`encoder${encoderId}: ${line}`);
      });
    });

    socket.on('m3u8', data => {
      const handleFile = async () => {
        const release = await handleFileMutex.acquire();

        try {
          const asset = await updateStream({
            assetId: data.asset,
            data
          });

          const todoBitrates = _.map(asset.jobs, 'bitrate').flat();
          if (_.difference(todoBitrates, asset.bitrates).length === 0) {
            asset.state = 'processed';
            await assetDone(asset)
          }

          globalIO.emit('job-completed', _.pick(asset, ['_id', 'bitrates', 'jobs', 'state']));
        }
        catch (e) {
          console.error(e);
        }
        finally {
          release();
        }
      };

      // handle file when upload has completed
      const bitrates = data.bitrate instanceof Array ? data.bitrate : [data.bitrate];

      const filename = `/${data.asset}/${data.asset}.${bitrates[0]}.m3u8`;
      console.log(`Waiting for ${filename}`);
      waitFor(filename).then(() => {
        console.log(`Handling ${filename}`);
        handleFile()
        .catch(e => console.error(e))
        ;
      })
    });

    socket.on('disconnect', () => {
      disconnected.add(id);
      console.log(`Lost connection for ${id}`);
      setTimeout(() => {
        if (disconnected.has(id)) {
          console.log(`Removing connection for ${id}`);
          disconnected.delete(id);
          delete encoders[id];
          delete sockets[id];
          browserIO.emit('removed', { id: id });
        }
      }, 5000);
    });

    if (!reconnect) {
      browserIO.emit('new', {
        id: id,
        data: encoders[id]
      });
    }

    callback({
      encoderId: id
    });
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
  let videoFilter = req.body.vf;
  let skip = req.body.ss;

  let asset;

  if (req.body.assetId) {
    asset = await Asset.findById(req.body.assetId).populate('file');
    file = asset.file;

    if (!asset) {
      throw 'No asset';
    }
    source = getSource(asset.file ? asset.file.name : asset.source);
    audio = asset.audio;
    videoFilter = asset.videoFilter;
    skip = asset.skip;

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
      videoFilter,
      skip,
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

  const outputBase = `${config.outputBase}/output${getSignedUrl(`/${asset._id}`, 16*3600)}`;

  const { stereoMap } = await getChannelMapping(file, source);

  // check if extra audio tracks need to be added
  const audioJob = config.separateAudio ? await getAudioJob(asset, file, source) : null;

  // prepare the jobs array
  const profiles = Object.keys(config.profiles)
    .filter(width => width <= videoParameters.width)
    .map(width => {
      return config.profiles[width]
        .filter(bitrate => !asset.bitrates.includes(`${bitrate}k`))
        .map(bitrate => ({width, bitrate}))
    })
    .flat()
    .reverse()
  ;

  let audioMap = audio ? '1:a' : '0:a';

  if (stereoMap && !audio) {
    audioMap = stereoMap.map ? stereoMap.map : '[aout]';
  }

  for(let i=0; i<profiles.length; i++) {
    const { width, bitrate } = profiles[i];

    let bitrateString = `${bitrate}k`;
    const job = {
      source,
      audio,
      videoParameters,
      asset: asset._id,
      bitrate: bitrateString,
      m3u8: `${outputBase}/${basename}.${bitrateString}.m3u8`,
      hlsEncKey: config.hlsEnc ? asset.hls_enc_key : false,
      segmentFilename: `${asset._id}.${bitrate}.%05d.ts`
    };

    let audioArguments = [];
    let useVarStreamMap = false;
    const filterComplex = [];

    if (file && file.loudNorm) {
      filterComplex.push(file.loudNorm);
    }

    if (!config.separateAudio && (audio || asset.videoParameters.hasAudio)) {
      if (stereoMap && stereoMap.filter_complex) {
        filterComplex.push(stereoMap.filter_complex);
      }

      audioArguments = [
        '-map', audioMap,
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
        m3u8: `${outputBase}/${basename}.%v.m3u8`
      });

      audioArguments = [
        ...audioJob['arguments'],
        '-var_stream_map', `v:0,name:${bitrateString} ${audioJob.varStreamMap}`
      ];

      useVarStreamMap = true;
    }

    const copy = req.body.copyMaxVariant && i === 0;

    todo.push({
      ...job,
      arguments: [
        // http options
        '-seekable', getSeekable(source),
        ...config.localSource ? [] : [
        '-reconnect', 1,
        '-reconnect_streamed', 1,
        '-reconnect_delay_max', 60,
        '-multiple_requests', 1
        ],

        ...(skip ? ['-ss', skip] : []),
        '-i', source,
        ...(audio ? ['-i', audio] : []),

        ...copy ? [
          '-c', 'copy',
        ] : [
          // video options
          '-map', '0:v',
          ...config.hwAcceleration ? [
            '-vcodec', 'h264_nvenc'
          ] : [
            '-vcodec', 'libx264'
          ],
          '-vprofile', 'high',
          '-level', '4.1',
          '-pix_fmt', 'yuv420p',
          '-g', 2 * Math.ceil(framerate),
          '-x264opts', 'no-scenecut',
          '-vf',
            (videoFilter ? videoFilter + '[out];[out]' : '') +
            (config.hwAcceleration ?
              `format=yuv420p,hwupload_cuda,scale_npp=${width}:trunc(ow/dar/2)*2,hwdownload` :
              `scale=${width}:trunc(ow/dar/2)*2`
            ),
          '-b:v', bitrateString,
          '-maxrate', bitrateString,
          '-bufsize', bitrateString,
          '-preset', 'slow',

          // audio options
          ...audioArguments,

          ...(filterComplex.length ? ['-filter_complex', filterComplex.join(',')] : []),
        ],

        // output
        '-f', 'hls',
        '-hls_list_size', 0,
        '-hls_playlist_type', 'vod',
        '-hls_time', 2,
        ...(config.hlsEnc ? ['-hls_key_info_file', hlsKeyInfoFile] : []),
        '-method', 'PUT',
        '-hls_segment_filename', `${outputBase}/${basename}.${useVarStreamMap ? '%v' : bitrateString}.%05d.ts`,
        job.m3u8,
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

  queue = queue.concat(todo);

  browserIO.emit('queue-update', queue.length);

  if (!req.body.assetId) {
    asset.jobs = _.map(todo, job => {
      return {
        bitrate: job.bitrate,
        command: job.arguments.map(value => {
          if (value.startsWith && value.startsWith('-')) {
            return value;
          } else {
            return `'${value}'`;
          }
        }).join(' ')
      }
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

router.delete('/:id', api(async req => {
  if (!sockets[req.params.id]) {
    throw {
      status: 404,
      message: 'Encoder not found'
    }
  }

  sockets[req.params.id].emit('quit');
}));

router.delete('/jobs/:index', api(async req => {
  queue.splice(req.params.index, 1);
  browserIO.emit('queue-update', queue.length);
}));

router.get('/docker', api(async req => {
  const parsed = new URL(config.base);
  parsed.username = process.env.ENCODER_TOKEN;
  return `docker run ${config.hwAcceleration ? '--gpus all' : ''} --name encoder -d --rm -e ASSETMANAGER_URL=${parsed.toString()} vaem/encoder${config.hwAcceleration ? ':nvidia' : ''}`;
}));

browserIO.on('connection', socket => {
  socket.on('disconnect', () => {
    console.log('Browser disconnected');
  });
});

export default router;
