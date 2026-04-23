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

import type { SchemaTimestampsConfig } from 'mongoose'
import { Schema, model } from 'mongoose'

import synchronise from './statics/synchronise.js'
import postRemove from './post/deleteOne.js'
import preSave from './pre/save.js'
import { config } from '#/config.js'

export const root = `${config.root}/var/files`

interface IFile extends SchemaTimestampsConfig {
  name: string
  size: number
  type: 'unknown' | 'video' | 'subtitle'
  sourceSize: number
}

const schema = new Schema<IFile, unknown, unknown, unknown, {
  path: string
}, {
  synchronise(): Promise<void>
}>({
  name: String,
  size: {
    type: Number,
    default: 0,
  },
  type: {
    type: String,
    enum: ['unknown', 'video', 'subtitle'],
    default: 'unknown',
  },
  sourceSize: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
})

export type FileSchema = typeof schema

schema.virtual('path').get(function () {
  return `${root}/${this.name}`
})

synchronise(schema, root)
postRemove(schema)
preSave(schema)

export const File = model('File', schema)
