/*
 * VAEM - Asset manager
 * Copyright (C) 2026  Wouter van de Molengraft
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

import { createServer } from 'http'
import type { DefaultEventsMap, Socket } from 'socket.io'
import { Server } from 'socket.io'
import mongoose from 'mongoose'
import { mkdir, rmdir } from 'fs/promises'
import { Mutex } from 'async-mutex'
import { basename } from 'path'
import { Job } from '#~/model/Job/index.js'
import { config } from '#~/config.js'
import type { AssetDocument } from '#~/model/Asset/index.js'
import { Asset } from '#~/model/Asset/index.js'
import { getSignedUrl } from '#~/lib/security.js'
import type { Express } from 'express'

let io: Server<DefaultEventsMap, DefaultEventsMap>

export const getIO = () => io

interface Event {
  type: 'ready' | 'done' | 'progress' | 'encodeError'
}

interface ReadyEvent extends Event {
  type: 'ready'
}

interface DoneEvent extends Event {
  type: 'done'
  job: string
}

interface ProgressEvent extends Event {
  type: 'progress'
  job: string
  out_time_ms: number
}

interface ErrorEvent extends Event {
  type: 'encodeError'
  job: string
  stderr: string
}

const mutex = new Mutex()
async function ready(connection: Socket) {
  const release = await mutex.acquire()
  try {
    const job = await Job.findOne({
      state: 'new',
      deleted: {
        $ne: true,
      },
    })

    if (job) {
      console.log(`Sending job for asset ${job.asset} to encoder`)

      const output = `${config.root}/var/output/${job.asset}`
      await mkdir(output, {
        recursive: true,
      })

      job.startedAt = new Date()
      await job.save()

      const response = await new Promise((resolve) => {
        connection.emit('job', {
          job: job._id,
          ffmpegArguments: [
            ...job['arguments'],
            '-hls_key_info_file', config.base + getSignedUrl(`/assets/${job.asset}/keyinfo`),
          ],
        }, resolve)
      })

      job.state = response ? 'encoding' : 'new'
      await job.save()
    }
  }
  catch (e) {
    console.warn(e)
  }
  finally {
    release()
  }
}

async function progress(connection: Socket, { out_time_ms, job }: ProgressEvent) {
  const progress = out_time_ms / 1000 / 1000

  await Job.findOneAndUpdate({
    _id: job,
  }, {
    $set: {
      progress,
    },
  })
}

async function done(connection: Socket, { job: id }: DoneEvent) {
  const release = await mutex.acquire()

  try {
    console.log(`Job ${id} done`)
    const job = await Job.findById(id).populate<{
      asset: AssetDocument
    }>('asset').orFail()

    job.state = 'done'
    job.progress = parseFloat(job.asset?.ffprobe?.format?.duration)
    job.completedAt = new Date()
    await job.save()

    if (!config.uploadQueue) {
      await job.asset?.finish?.()
    }
  }
  finally {
    release()
  }
}

async function error(connection: Socket, { job, stderr }: ErrorEvent) {
  console.log(`Error for job ${job}: ${stderr}`)
  await Job.findOneAndUpdate({
    _id: job,
  }, {
    $set: {
      state: 'error',
      error: stderr,
    },
  })
}

async function uploaded(file: string) {
  const release = await mutex.acquire()

  try {
    const [assetId, variant] = basename(file).split('.')
    const asset = mongoose.Types.ObjectId.isValid(assetId) && await Asset.findById(assetId)
    if (asset) {
      const finished = await asset.setUploadedVariant(variant)
      if (finished) {
        console.log(`Finished asset ${assetId}`)
        setTimeout(() => {
          rmdir(`${config.root}/var/output/${assetId}`)
            .catch((e) => {
              console.warn(`Unable to remove directory for ${assetId}`, e)
            })
        }, 10000)
      }
    }
  }
  finally {
    release()
  }
}

export function initialise(app: Express) {
  if (config.uploadQueue) {
    config.uploadQueue.on('uploaded', (file) => {
      if (file.endsWith('.m3u8')) {
        uploaded(file)
          .catch((e) => {
            console.warn(`Unable to set variant as uploaded for ${file}`, e)
          })
      }
    })
  }

  const httpServer = createServer(app)
  io = new Server(httpServer)

  io.on('connection', (connection) => {
    console.log(`New connection ${connection.id}`)
    const wrap = <T>(fn: (event: T) => Promise<void>) => (event: T) => {
      fn(event).catch((e) => {
        console.warn(e)
      })
    }

    connection.on('ready', wrap<ReadyEvent>(() => ready(connection)))
    connection.on('done', wrap<DoneEvent>(event => done(connection, event)))
    connection.on('encodeError', wrap<ErrorEvent>(event => error(connection, event)))
    connection.on('progress', wrap<ProgressEvent>(event => progress(connection, event)))
  })

  return httpServer
}
