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
import fs from 'fs-extra';
import _ from 'lodash';

import config from '../../../config/config';

import * as s3Util from '../util/s3';

const schema = new mongoose.Schema({
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
  source: String,
  audio: String,
  subtitles: {},
  hls_enc_key: String,
  hls_enc_iv: String,
  deleted: Boolean
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

  if (s3Util.s3) {
    s3Util
      .deleteAllObjects(`${this._id}/`)
      .catch(err => {
        console.log('Unable to delete objects from S3', err);
      })
  }

  fs.remove(`${config.output}/${this._id}`)
    .catch(err => {
      console.log('Unable to remove asset files', err);
    });

  this.deleted = true;
};

const Asset = mongoose.model('Asset', schema);

Asset.schema.pre('save', function (next) {
  if (this.isModified()) {
    this.updatedAt = new Date();
  }
  labelsCache = {};

  next();
});

Asset.schema.post('save', () => {
  console.log('Saving asset');
  if (!config.s3) {
    return;
  }

  // store necessary information for frontend on S3
  (async () => {
    const assets = await Asset.find().select(['subtitles', 'hls_enc_iv', 'hls_enc_key', 'labels', 'title']);

    const map = _.mapValues(_.keyBy(assets, '_id'), value => _.omit(value.toObject(), '_id'));

    await s3Util.s3.putObject({
      Bucket: config.s3.bucket,
      Key: 'assets.json',
      Body: JSON.stringify(map)
    }).promise();

    console.log('assets.json uploaded to s3');
  })().catch(e => console.error(e));
});

Asset.schema.post('remove', item => {
  item.removeFiles();
});

export {Asset};