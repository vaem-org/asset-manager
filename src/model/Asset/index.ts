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

import { Schema, model, Types } from 'mongoose'
import type { SchemaTimestampsConfig, PopulatedDoc, Model } from 'mongoose'

import finish from './methods/finish.js'
import setUploadedVariant from './methods/setUploadedVariant.js'
import createMasterPlaylist from './methods/createMasterPlaylist.js'
import verify from './methods/verify.js'
import verifySubtitles from './methods/verifySubtitles.js'
import setSubtitle from './methods/setSubtitle.js'
import getUrl from './methods/getUrl.js'
import removeFiles from './methods/removeFiles.js'

import preSave from './pre/save.js'
import postRemove from './post/remove.js'
import postSave from './post/save.js'
import { getSignedUrl } from '#/lib/security.js'
import { config } from '#/config.js'
import type { FFProbe } from '#/types/ffmpeg.js'
import type { IJob } from '#/model/Job/index.js'

export interface IAsset extends SchemaTimestampsConfig {
  labels: string[]
  title: string
  state: 'new' | 'processing' | 'processed' | 'verified' | 'error'
  ffprobe: FFProbe
  file: string
  subtitles: Record<string, boolean>
  hls_enc_key: string
  hls_enc_iv: string
  deleted: boolean
  public: boolean
  variants: string[]
  uploadedVariants: string[]
  job: PopulatedDoc<IJob>
}

type IAssetMethods = {
  createMasterPlaylist(): Promise<void>
  finish(): Promise<void>
  getUrl(): string
  removeFiles(): void
  setSubtitle(language: string, source: string): Promise<void>
  setUploadedVariant(variant: string): Promise<boolean>
  verify(): Promise<boolean>
  verifySubtitles(): Promise<boolean>
}

type IAssetVirtuals = {
  highestVariant: string
  playbackInfo: {
    stream: string
    subtitles: Record<string, string>
  }
}

export type AssetModelType = Model<IAsset, object, IAssetMethods, IAssetVirtuals>

const schema = new Schema<IAsset, AssetModelType, IAssetMethods, object, IAssetVirtuals>({
  labels: [String],
  title: String,
  state: { type: String, enum: ['new', 'processing', 'processed', 'verified', 'error'], default: 'new' },
  ffprobe: {},
  file: String,
  subtitles: {
    type: Object,
    default: {},
  },
  hls_enc_key: String,
  hls_enc_iv: String,
  deleted: Boolean,
  public: {
    type: Boolean,
    default: false,
  },
  variants: [String],
  uploadedVariants: [String],
  job: {
    type: Types.ObjectId,
    ref: 'Job',
  },
}, {
  timestamps: true,
})

export type AssetSchema = typeof schema

schema.virtual('highestVariant').get(function () {
  return Math.max(...this.variants.map(variant => parseInt(variant))) + 'k'
})

schema.virtual('playbackInfo').get(function () {
  const expiresIn = 4 * 3600
  return {
    stream: config.base + getSignedUrl(`/assets/${this._id}/stream`, false, expiresIn) + `/${this._id}.m3u8`,
    subtitles: Object.fromEntries(
      Object.entries(this.subtitles || {})
        .filter(([,value]) => value)
        .map(([language]) => [
          language,
          config.base + getSignedUrl(`/assets/${this._id}/subtitles/${language}`, true, expiresIn),
        ]),
    ),
  }
})

preSave(schema)
postSave(schema)
postRemove(schema)

finish(schema)
setUploadedVariant(schema)
createMasterPlaylist(schema)
verify(schema)
verifySubtitles(schema)
setSubtitle(schema)
getUrl(schema)
removeFiles(schema)

export const Asset = model<IAsset, AssetModelType>('Asset', schema)
