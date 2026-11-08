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

import { isAbsolute, relative, resolve } from 'node:path'
import type { Model, Document, Types } from 'mongoose'
import { Schema, model } from 'mongoose'

import synchronise from './statics/synchronise.js'
import postRemove from './post/deleteOne.js'
import preSave from './pre/save.js'
import { config } from '#~/config.js'
import type { ITimestamps } from '#~/types/ITimestamps.js'

export const root = `${config.root}/var/files`

export function resolveFilePath(name: string): string {
  if (!name || typeof name !== 'string' || name.includes('\0')) {
    throw new Error('Invalid file name')
  }
  const base = resolve(root)
  const full = resolve(base, name)
  const rel = relative(base, full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Invalid file path: ${name}`)
  }
  return full
}

export interface IFile extends ITimestamps {
  name: string
  size: number
  type: 'unknown' | 'video' | 'subtitle'
  sourceSize: number
}

export interface IFileVirtuals {
  path: string
}

export type FileDocument = Document<Types.ObjectId, object, IFile, IFileVirtuals> & IFile

export type FileModelType = Model<IFile, object, object, IFileVirtuals> & {
  synchronise(): Promise<void>
}

const schema = new Schema<IFile, FileModelType, object, object, IFileVirtuals>({
  name: {
    type: String,
    required: true,
    validate: {
      validator: (v: string) => {
        try {
          resolveFilePath(v)
          return true
        }
        catch {
          return false
        }
      },
      message: 'File name must resolve within var/files',
    },
  },
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
  return resolveFilePath(this.name)
})

synchronise(schema, root)
postRemove(schema)
preSave(schema)

export const File = model<IFile, FileModelType>('File', schema)
