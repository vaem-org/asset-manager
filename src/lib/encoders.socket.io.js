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

import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { mkdir, rmdir } from 'fs/promises';
import { Mutex } from 'async-mutex';
import { basename } from 'path';
import { Job } from '#~/model/Job/index';
import { config } from '#~/config';
import { Asset } from '#~/model/Asset/index';
import { getSignedUrl } from '#~/lib/security';

export let io = null;

const mutex = new Mutex();
async function ready({ connection }) {
  const release = await mutex.acquire();
  try {
    const job = await Job.findOneAndUpdate({
      state: 'new',
      deleted: {
        $ne: true
      }
    }, {
      $set: {
        state: 'encoding'
      }
    });

    if (job) {
      console.log('Sending job to encoder');

      const output = `${config.root}/var/output/${job.asset}`;
      await mkdir(output, {
        recursive: true
      });

      connection.emit('job', {
        job: job._id,
        ffmpegArguments: [
          ...job['arguments'],
          '-hls_key_info_file', config.base + getSignedUrl(`/assets/${job.asset}/keyinfo`)
        ]
      }, response => {
        if (!response) {
          job.state = 'new';
          job.save();
        }
      })
    }
  } finally {
    release();
  }
}

async function progress({ event: { job, out_time_ms }}) {
  const progress = out_time_ms / 1000 / 1000;

  await Job.findOneAndUpdate({
    _id: job
  }, {
    $set: {
      progress
    }
  })
}

async function done({ event: { job: id } }) {
  console.log(`Job ${id} done`);
  const job = await Job.findById(id).populate('asset');
  if (!job) {
    return;
  }
  job.state = 'done';
  job.progress = parseFloat(job.asset.ffprobe?.format?.duration);
  await job.save();

  if (!config.uploadQueue) {
    await job.asset.finish();
  }
}

async function error({ event: { job, stderr } }) {
  console.log(`Error for job ${job}: ${stderr}`);
  await Job.findOneAndUpdate({
    _id: job
  }, {
    $set: {
      state: 'error',
      error: stderr
    }
  });
}

async function uploaded(file) {
  const release = await mutex.acquire();

  try {
    const [assetId, variant] = basename(file).split('.');
    const asset = mongoose.Types.ObjectId.isValid(assetId) && await Asset.findById(assetId);
    if (asset) {
      const finished = await asset.setUploadedVariant(variant);
      if (finished) {
        console.log(`Finished asset ${assetId}`);
        setTimeout(() => {
          rmdir(`${config.root}/var/output/${assetId}`)
          .catch(e => {
            console.warn(`Unable to remove directory for ${assetId}`, e);
          })
        }, 10000);
      }
    }
  } finally {
    release();
  }
}

export function initialise(app) {
  if (config.uploadQueue) {
    config.uploadQueue.on('uploaded', file => {
      if (file.endsWith('.m3u8')) {
        uploaded(file)
        .catch(e => {
          console.warn(`Unable to set variant as uploaded for ${file}`, e);
        })
      }
    });
  }

  const httpServer = createServer(app);
  io = new Server(httpServer);

  io.on('connection', connection => {
    console.log(`New connection ${connection.id}`);
    const wrap = fn => (event) => {
      fn({
        connection,
        event
      }).catch(e => {
        console.warn(e);
      })
    };

    Object.entries({
      ready,
      done,
      error,
      progress
    }).forEach(([name, handler]) => {
      connection.on(name, wrap(handler))
    });
  });

  return httpServer;
}
