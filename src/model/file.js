/*
 * VAEM - Asset manager
 * Copyright (C) 2018  Wouter van de Molengraft
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
import * as fileType from '../lib/file-type';

const schema = new mongoose.Schema({
    name: {type: String, unique: true},
    size: {type: Number, default: 0},
    state: {type: String, enum: ['prepared', 'idle', 'uploading', 'complete'], default: 'idle'},
    uploaded: {type: Number, default: 0},
    asset: {type: mongoose.Schema.Types.ObjectId, ref: 'Asset'},
    audioStreams: {type: Object},
    loadNorm: String
  },
  {
    toObject: {virtuals: true},
    toJSON: {virtuals: true},
    timestamps: true
  });

schema.virtual('type').get(function () {
  if (fileType.isVideo(this.name)) {
    return 'video';
  }
  else if (fileType.isSubtitle(this.name)) {
    return 'subtitle';
  }
  else {
    return 'unknown';
  }
});

const File = mongoose.model('File', schema);

export {File};
