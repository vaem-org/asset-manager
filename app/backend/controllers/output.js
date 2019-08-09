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

import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import {catchExceptions} from '../util/express-helpers';
import {s3} from '../util/s3';
import {bunnycdnStorage} from '../util/bunnycdn';

export default app => {
  const ensured = new Set();

  const ensureDir = async dirname => {
    if (ensured.has(dirname)) {
      return;
    }

    await fs.ensureDir(dirname);
    ensured.add(dirname);
  };

  const upload = destination => catchExceptions(async (req, res, next) => {
    if (req.method !== 'PUT') {
      return next();
    }

    const output = path.join(destination, decodeURIComponent(req.path));

    await ensureDir(path.dirname(output));

    req
      .on('end', () => res.end())
      .pipe(fs.createWriteStream(output));
  });

  if (s3) {
    app.use('/output', (req, res) => {
      console.log(`Uploading to s3: ${req.path.substr(1)}`);

      s3.upload({
        Bucket: app.config.s3.bucket,
        Key: req.path.substr(1),
        Body: req
      }, function (err) {
        if (err) {
          console.log(err);
        }
        res.statusCode = err ? 500 : 200;
        res.end();
      });
    });
  } else if (bunnycdnStorage) {
    app.use('/output', catchExceptions(async (req, res) => {
      console.log(`Uploading to BunnyCDN: ${req.path.substr(1)}`);

      const output = path.join(app.config.output, decodeURIComponent(req.path));

      await ensureDir(path.dirname(output));

      let upload = true;

      if (!output.endsWith('.m3u8')) {
        req
          .pipe(fs.createWriteStream(output));

        await (new Promise((accept, reject) => {
          req.on('end', accept);
          req.on('error', reject);
        }));
      } else {
        const buffers = [];
        req.on('data', buffer => buffers.push(buffer));

        await (new Promise((accept, reject) => {
          req.on('end', accept);
          req.on('error', reject);
        }));

        const content = Buffer.concat(buffers).toString();
        if (content.indexOf('#EXT-X-ENDLIST') !== -1) {
          await fs.writeFile(output, content);
        } else {
          upload = false;
        }
      }

      if (upload) {
        try {
          await bunnycdnStorage.put(req.path.substr(1), fs.createReadStream(output));
        }
        catch (e) {
          console.error(e);
        }
      }

      res.end();
    }));
  } else {
    app.use('/output', upload(app.config.output));
  }

  app.use('/tmp', upload(app.config.tmp));
  app.use('/tmp', express.static(app.config.tmp));
}
