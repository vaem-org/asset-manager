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

import util from 'util';
import AWS from 'aws-sdk';
import config from '../../../config/config';
import _ from 'lodash';

if (config.s3) {
  AWS.config.update({
    accessKeyId: config.s3.key,
    secretAccessKey: config.s3.secret,
    region: config.s3.region,
    maxRetries: 20
  });
}

const s3 = config.s3 ? new AWS.S3() : null;

const listObjects = s3 ? util.promisify(s3.listObjectsV2).bind(s3) : null;
const deleteObjects = s3 ? util.promisify(s3.deleteObjects).bind(s3) : null;

/**
 * List all objects with given params
 * @param {{}} params
 * @return {Promise<Array>}
 */
const listAllObjects = async params => {
  let data;

  let result = [];

  do {
    data = await listObjects(params);

    result = result.concat(data.Contents);
    params.ContinuationToken = data.NextContinuationToken;
  }
  while (data.IsTruncated);

  return result;
};

/**
 * Delete all objects with given prefix
 * @param {String} prefix
 */
const deleteAllObjects = async prefix => {
  for (let items of _.chunk(await listAllObjects({
    Bucket: config.s3.bucket,
    Prefix: prefix
  }), 1000)) {
    await deleteObjects({
      Bucket: config.s3.bucket,
      Delete: {
        Objects: items.map(item => ({
          Key: item.Key
        })),
        Quiet: true
      }
    });
  }
};

export {listAllObjects, deleteAllObjects, s3};