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
import type { PopulatedDoc, SchemaTimestampsConfig, Model } from 'mongoose'
import postSave from './post/save.js'
import type { IAsset } from '#/model/Asset/index.js'

export interface IJob extends SchemaTimestampsConfig {
  asset: PopulatedDoc<IAsset>
  file: string
  arguments: string[]
  state: 'new' | 'encoding' | 'done' | 'error'
  progress: number
  error: string
  startedAt: Date
  completedAt: Date
}

type JobModelType = Model<IJob>

const schema = new Schema<IJob>({
  asset: {
    type: Types.ObjectId,
    ref: 'Asset',
  },
  file: String,
  arguments: [String],
  state: { type: String, enum: ['new', 'encoding', 'done', 'error'], default: 'new' },
  progress: Number,
  error: String,
  startedAt: Date,
  completedAt: Date,
}, {
  timestamps: true,
})

postSave(schema)

export const Job = model<IJob, JobModelType>('Job', schema)
