#!/usr/bin/env node

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

const glob = require('glob-promise');
const path = require('path');
const fs = require('fs');
const {s3} = require('../app/backend/util/s3');
const config = require('../config/config');

(async () => {
  const files = await glob(`${__dirname}/../var/subtitles/*.vtt`);

  for (let file of files) {
    const [assetId, language] = path.basename(file).split('.');

    await s3.putObject({
      Bucket: config.s3.bucket,
      Key: `${assetId}/subtitles/${language}.vtt`,
      Body: fs.createReadStream(file)
    }).promise();
  }
})().catch(e => console.error(e));
