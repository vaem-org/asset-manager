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

import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import type { Router } from 'express'
import { api, getDocument } from '#~/lib/express-helpers.js'
import { config } from '#~/config.js'
import { ffprobe, getAudio, getFramerate, ffmpegPath } from '#~/lib/ffmpeg.js'
import { getSignedUrl } from '#~/lib/security.js'
import { File } from '#~/model/File/index.js'
import { HttpError } from '#~/lib/HttpError.js'

interface Child {
  child: ChildProcess
  buffers: Map<string, Buffer>
  files: string[]
  writeToken: string
  setTimer(): void
  timer?: NodeJS.Timeout
}

const MAX_PREVIEW_PROCESSES = 5
const MAX_SEGMENT_BYTES = 16 * 1024 * 1024

export default (router: Router) => {
  const processes = new Map<string, Child>()

  const events = new EventEmitter()

  router.post('/preview', api(async ({ params: { id }, body: { audio, ss } = {} }) => {
    if (processes.size >= MAX_PREVIEW_PROCESSES) {
      throw new HttpError(429, 'Too many active preview processes')
    }
    const item = await getDocument(File, id)

    const source = item.path

    const { streams } = await ffprobe(
      source,
    )

    const video = streams.find(({ codec_type }) => codec_type === 'video')

    if (!video) {
      throw new HttpError(400, 'No video stream found')
    }

    const framerate = getFramerate(video)

    audio = audio ?? getAudio(streams)
    if (!Array.isArray(audio) || !audio.every((idx: unknown) => typeof idx === 'number' && Number.isInteger(idx) && idx >= 0)) {
      throw new HttpError(400, 'Invalid audio stream indices')
    }
    if (ss !== undefined && ss !== null && !/^\d+(\.\d+)?$/.test(String(ss))) {
      throw new HttpError(400, 'Invalid ss parameter')
    }

    let audioMapping: string[] = []
    if (audio.length > 0) {
      audioMapping = audio.length > 1
        ? ['-filter_complex', `${audio.map((index: number) => `[0:${index}]`).join('')}amerge=inputs=2[aout]`, '-map', '[aout]']
        : ['-map', `0:${audio[0]}`]
    }

    // start a new ffmpeg process
    const uuid = randomUUID()
    const writeToken = randomUUID()
    const location = getSignedUrl(`/files/${id}/preview/${uuid}`, false, 3600 * 4)
    const base = `http://localhost:${config.port}` + location
    const child = spawn(ffmpegPath, [
      '-re',
      '-ss', ss ? String(ss) : '0',
      '-i', source,
      '-loglevel', 'error',
      '-threads', '0',
      '-vf', 'scale=1280:trunc(ow/dar/2)*2',
      '-b:v', '3000k',
      '-maxrate', '3000k',
      '-bufsize', '3000k',
      '-map', `0:${video.index}`,
      ...audioMapping,
      '-ac', '2',
      '-vcodec', 'libx264',
      '-vprofile', 'high',
      '-level', '4.1',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-g', (2 * framerate).toString(),
      '-x264opts', 'no-scenecut',
      '-f', 'hls',
      '-method', 'PUT',
      '-headers', `X-Preview-Write-Token: ${writeToken}\r\n`,
      '-hls_list_size', '5',
      '-hls_time', '2',
      `${base}/stream.m3u8`,
    ], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    child.on('close', (code) => {
      console.log(`ffmpeg proces closed with ${code}`)

      events.emit(uuid, 'process exited')
      // clean up after 30 seconds
      setTimeout(() => processes.delete(uuid), 30000)
    })

    processes.set(uuid, {
      child,
      buffers: new Map<string, Buffer>(),
      files: [],
      writeToken,
      setTimer() {
        if (this.timer) {
          clearTimeout(this.timer)
        }

        // automatically kill ffmpeg when no file has been accessed for 30 seconds
        this.timer = setTimeout(() => {
          this.child.kill()
        }, 30000)
      },
    } satisfies Child)

    processes.get(uuid)?.setTimer?.()

    await new Promise<void>((resolve, reject) => {
      events.once(uuid, (err) => {
        if (err) {
          console.warn(err)
          reject(new HttpError(
            500,
            'ffmpeg failed',
          ))
        }
        else {
          resolve()
        }
      })
    })

    processes.get(uuid)?.setTimer?.()

    return {
      stream: `${config.base}${location}/stream.m3u8`,
      uuid,
    }
  }))

  router.put('/preview/:uuid/:filename', (req, res, next) => {
    const { uuid, filename } = req.params
    const process = processes.get(uuid)
    if (!process || req.headers['x-preview-write-token'] !== process.writeToken) {
      return next()
    }

    const buffers: Buffer[] = []
    let totalBytes = 0
    let aborted = false
    req.on('data', (buf: Buffer) => {
      totalBytes += buf.length
      if (totalBytes > MAX_SEGMENT_BYTES) {
        aborted = true
        req.destroy()
        res.status(413).end()
        return
      }
      buffers.push(buf)
    })
    req.on('end', () => {
      if (aborted) {
        return
      }
      process.buffers.set(filename, Buffer.concat(buffers))
      res.end()

      process.files.push(filename)

      // remove old files from memory
      if (process.files.length > 5) {
        const drop = process.files.shift()
        if (drop) {
          process.buffers.delete(drop)
        }
      }

      if (filename.endsWith('.m3u8')) {
        events.emit(req.params.uuid)
      }
    })
  })

  router.get('/preview/:uuid/:filename', (req, res, next) => {
    const process = processes.get(req.params.uuid)
    const buffer = process && process.buffers.get(req.params.filename)
    if (!buffer) {
      return next()
    }

    if (process.timer) {
      clearTimeout(process.timer)
    }

    process.setTimer()

    res.end(buffer)
  })

  router.delete('/preview/:uuid', (req, res, next) => {
    const process = processes.get(req.params.uuid)
    if (!process) {
      return next()
    }

    process.child.kill()
    res.end()
  })
}
