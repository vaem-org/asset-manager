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

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { text } from 'node:stream/consumers'

import { Asset } from '#~/model/Asset/index.js'
import { config } from '../config.js'
import { hlsSegment, hlsSegmentPlaylist } from 'node-webvtt/lib/hls.js'
import type { Format, Stream } from '#~/types/ffmpeg.js'

/**
 *
 * @returns {Promise<Buffer>}
 */
async function run(cmd: string, args: string[]): Promise<Buffer> {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const stdout: Buffer[] = []
  child.stdout.on('data', buf => stdout.push(buf))
  const stderr: Buffer[] = []
  child.stderr.on('data', (buf) => {
    process.stderr.write(buf)
    stderr.push(buf)
  })

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code !== 0) {
        reject(Buffer.concat(stderr))
      }
      else {
        resolve(Buffer.concat(stdout))
      }
    })
  })
}

/**
 * Run ffmpeg probe on given file
 */
export async function ffprobe(filename: string): Promise<{ streams: Stream[], format: Format }> {
  try {
    return JSON.parse((await run('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      ...filename.toLowerCase().endsWith('.mxf') ? ['-seekable', '0'] : [],
      filename,
    ])).toString(),
    )
  }
  catch (e) {
    throw new Error(`ffprobe process failed: ${e?.toString?.()}`)
  }
}

/**
 * Find the streams to use for audio
 */
export function getAudio(streams: Stream[]): number[] {
  const audioStreams = streams.filter(({ codec_type }) => codec_type === 'audio')

  const stereo = audioStreams.find(({ channels }) => channels === 2)
  if (stereo) {
    return [stereo.index]
  }

  const monoChannels = audioStreams.filter(({ channels }) => channels === 1)
  const findChannel = (layout: string) => {
    return monoChannels.find(({ channel_layout: layout2 }) => layout2 === layout)?.index
  }

  const dl = findChannel('DL')
  const dr = findChannel('DR')
  if (dl && dr) {
    return [
      dl,
      dr,
    ]
  }
  else if (monoChannels.length >= 2) {
    return monoChannels.slice(0, 2).map(({ index }) => index)
  }
  else return audioStreams
    .filter(({ channels }) => channels === 6)
    .map(({ index }) => index)
    .slice(0, 1)
}

/**
 * Segment a vtt file for playback on Apple devices
 */
export async function segmentVtt(assetId: string, lang: string): Promise<void> {
  const item = await Asset.findById(assetId)

  if (!item) {
    throw 'Item not found'
  }

  const { frames } = JSON.parse(
    (await run('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_frames',
      '-read_intervals', '%+#1',
      item.getUrl('235k'),
    ])).toString(),
  )

  const pkt_pts = frames?.[0]?.pkt_pts ?? frames?.[0]?.pts
  if (!pkt_pts) {
    throw 'No frames found for asset'
  }

  const stream = await config.storage?.download?.(`${assetId}/subtitles/${lang}.vtt`)
  const outputPath = join(config.root, 'var/output', assetId, 'subtitles')
  const input = await text(stream)

  await mkdir(outputPath, {
    recursive: true,
  })
  await writeFile(
    join(outputPath, `${lang}.m3u8`),
    hlsSegmentPlaylist(input, 10).toString().replace(
      /^\d+\.vtt$/mg,
      (match: string) => `${lang}.${match}`,
    ),
  )

  for (const { filename, content } of hlsSegment(input, 10, pkt_pts)) {
    await writeFile(
      join(outputPath, `${lang}.${filename}`),
      content,
    )
  }
}

/**
 * Get the framerate from a ffprobe stream object
 */
export function getFramerate(stream: Stream): number {
  const rFrameRate = (stream?.r_frame_rate ?? '')
    .split('/')
    .map(i => parseInt(i))

  let framerate = 25
  if (rFrameRate.length === 2) {
    framerate = rFrameRate[0] / rFrameRate[1]
  }

  return framerate
}
