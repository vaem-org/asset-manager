#!/usr/bin/env node
/*
 * VAEM - Asset manager
 * Copyright (C) 2019  Wouter van de Molengraft
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

import 'dotenv/config';
import _ from 'lodash';

import config from '~config';
import axios from 'axios';

import mongoose from 'mongoose';
import {bunnycdnStorage} from '../app/backend/util/bunnycdn';
import {listAllObjects} from '../app/backend/util/s3';
import cloudfrontSign from 'aws-cloudfront-sign';
import moment from 'moment';
import querystring from 'querystring';
import fs from 'fs';
import fse from 'fs-extra';
import {Bar} from 'cli-progress';
import {Asset} from '../app/backend/model/asset';
import {EventEmitter} from "events";

async function copyAsset(assetId) {
  const asset = await Asset.findById(assetId);
  if (asset.labels.indexOf('bunnycdn') !== -1) {
    return;
  }

  const objects = await listAllObjects({
    Bucket: config.s3.bucket,
    Prefix: `${assetId}/`
  });

  const signedCookies = _.mapKeys(cloudfrontSign.getSignedCookies(
    `${config.cloudfront.base}/${assetId}/*`,
    _.extend({},
      config.cloudfront,
      {
        expireTime: moment().add(8, 'hours')
      })),
    (value, key) => key.replace(/^CloudFront-/, '')
  );

  const existing = (await bunnycdnStorage.get(`${assetId}/`)).data.map(item => {
    return `${assetId}/${item.ObjectName}`;
  }).concat(
    (await bunnycdnStorage.get(`${assetId}/subtitles/`)).data.map(item => {
      return `${assetId}/subtitles/${item.ObjectName}`;
    })
  );

  const keys = _.difference(
    _.map(objects, 'Key'),
    existing
  );

  const bar = new Bar({
    format: 'progress [{bar}] {percentage}% | {value}/{total} (downloaded: {downloaded})'
  });

  bar.start(keys.length, 0, {
    downloaded: 0
  });

  const total = keys.length;

  await fse.ensureDir(`${config.root}/var/output/${assetId}/subtitles`);

  let uploaders = 0;
  const uploadQueue = [];

  const events = new EventEmitter();

  const downloadNext = async () => {
    if (keys.length === 0) {
      return;
    }

    const key = keys.shift();

    const cloudfrontUrl = `${config.cloudfront.base}/${key}?${querystring.stringify(signedCookies)}`;

    const response = await axios.get(cloudfrontUrl, {
      responseType: 'stream'
    });

    const localFilename = `${config.root}/var/output/${key}`;

    const output = fs.createWriteStream(localFilename);

    response.data.pipe(output);
    response.data.on('end', () => {
      bar.update(done, {
        downloaded: total - keys.length
      });

      uploadQueue.push({key, localFilename});
      downloadNext()
          .catch(e => events.emit('error', e));

      if (uploaders < 8) {
        uploadNext();
      }
    });

    response.data.on('error', e => events.emit('error', e));
  };

  let done = 0;
  const uploadNext = () => {
    if (uploadQueue.length === 0) {
      return;
    }

    uploaders++;

    const {key, localFilename} = uploadQueue.shift();

    Promise.all([
        () => bunnycdnStorage.put(key, fs.createReadStream(localFilename)),
        new Promise(accept => setTimeout(accept, 500))
    ])
      .then(() => {

        uploaders--;
        done++;
        bar.update(done);
        uploadNext();
        if (done === total) {
          events.emit('done');
        }
      })
      .catch(e => events.emit('error', e))
  };

  // start 8 download workers
  for(let i=0; i<8; i++) {
    downloadNext()
        .catch(e => events.emit('error', e));
  }

  await (new Promise((accept, reject) => {
    events.on('done', accept);
    events.on('error', reject);
  }));

  asset.labels = [...asset.labels, 'bunnycdn'];
  await asset.save();

  bar.stop();
}

(async () => {
  await mongoose.connect(config.mongo, {
    useNewUrlParser: true
  });
  await copyAsset('5d2c72a2dd5c39000ddba128' || '5d1114a9f80718000d7cc458');
  await mongoose.disconnect();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
