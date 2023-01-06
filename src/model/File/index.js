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

import mongoose from 'mongoose';

import synchronise from './statics/synchronise.js';
import postRemove from './post/remove.js';
import preSave from './pre/save.js';
import { config } from '#~/config';

const { Schema, model } = mongoose;

export const root = `${config.root}/var/files`;

const schema = new Schema({
  name: String,
  size: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    enum: ['unknown', 'video', 'subtitle'],
    default: 'unknown'
  },
  sourceSize: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

schema.virtual('path').get(function() {
  return `${root}/${this.name}`
});

synchronise({ schema, root });
postRemove(schema);
preSave(schema);

export const File = model('File', schema);
