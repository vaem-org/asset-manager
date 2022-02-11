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

import finish from './methods/finish.js';
import setUploadedVariant from './methods/setUploadedVariant.js';
import createMasterPlaylist from './methods/createMasterPlaylist.js';
import verify from './methods/verify.js';
import verifySubtitles from './methods/verifySubtitles.js';
import setSubtitle from './methods/setSubtitle.js';
import getUrl from './methods/getUrl.js';
import removeFiles from './methods/removeFiles.js';

import preSave from './pre/save.js';
import postRemove from './post/remove.js';
import postSave from './post/save.js';
import { getSignedUrl } from '#~/lib/security';
import { config } from '#~/config';

const { Schema, model, Types: { ObjectId } } = mongoose;

const schema = new Schema({
  labels: [String],
  title: String,
  state: { type: String, enum: ['new', 'processing', 'processed', 'verified'], default: 'new' },
  ffprobe: {},
  file: String,
  subtitles: {
    type: Object,
    default: {}
  },
  hls_enc_key: String,
  hls_enc_iv: String,
  deleted: Boolean,
  public: {
    type: Boolean,
    default: false
  },
  variants: [String],
  uploadedVariants: [String],
  job: {
    type: ObjectId,
    ref: 'Job'
  }
}, {
  timestamps: true
});

schema.virtual('highestVariant').get(function() {
  return Math.max(...this.variants.map((variant) => parseInt(variant))) + 'k';
});

schema.virtual('playbackInfo').get(function() {
  const expiresIn = 4*3600;
  return {
    stream: config.base + getSignedUrl(`/assets/${this._id}/stream`, false, expiresIn) + `/${this._id}.m3u8`,
    subtitles: Object.fromEntries(
      Object.entries(this.subtitles || {})
      .filter(([,value]) => value)
      .map(([language]) => [
        language,
        config.base + getSignedUrl(`/assets/${this._id}/subtitles/${language}`, true, expiresIn)
      ])
    )
  }
});

preSave(schema);
postSave(schema);
postRemove(schema);

finish(schema);
setUploadedVariant(schema);
createMasterPlaylist(schema);
verify(schema);
verifySubtitles(schema);
setSubtitle(schema);
getUrl(schema);
removeFiles(schema);

export const Asset = model('Asset', schema);
