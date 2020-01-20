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

import config from '@/config';

import { Schema, model } from 'mongoose';
import _ from 'lodash';

const schema = new Schema({
  updatedAt: {type: Date, default: Date.now},
  createdAt: {type: Date, default: Date.now},
  labels: [String],
  basename: String,
  title: String,
  state: {type: String, enum: ['new', 'processing', 'processed'], default: 'new'},
  bitrates: [String],
  streams: [{}],
  audioStreams: [{}],
  videoParameters: {},
  jobs: [{}],
  numStreams: Number,
  source: String,
  file: {type: Schema.Types.ObjectId, ref: 'File'},
  audio: String,
  subtitles: {},
  hls_enc_key: String,
  hls_enc_iv: String,
  deleted: Boolean,
  public: Boolean,
  videoFilter: String
});

let labelsCache = {};

schema.statics.getLabels = async () => {
  if (labelsCache.data && labelsCache.timestamp > Date.now() - 60000) {
    return labelsCache.data;
  }

  const items = await Asset.find({}, 'labels');
  labelsCache.data = _.sortBy(_.uniq(_.flatten(_.map(items, 'labels'))), name => name.toLowerCase());
  labelsCache.timestamp = Date.now();
  return labelsCache.data;
};

schema.methods.removeFiles = function () {
  // remove files
  console.log(`Removing files for asset ${this._id}`);

  config.destinationFileSystem.recursivelyDelete(this._id.toString())
  .catch(err => `Unable to delete files: ${err.toString()}`);

  this.deleted = true;
};

const Asset = model('Asset', schema);

Asset.schema.pre('save', function (next) {
  if (this.isModified()) {
    this.updatedAt = new Date();
  }
  labelsCache = {};

  next();
});

Asset.schema.post('remove', item => {
  item.removeFiles();
});

export {Asset};
