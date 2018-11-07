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
import s3 from '../util/s3';

export default app => {
  const router = express.Router();

  const root = app.config.output;

  router.use((req, res) => {
    const path = req.path.split('/');

    let output = (s3.s3 ? '' : root + '/') + path.slice(2).join('/');

    const buffers = [];

    if (req.path.search(/\.vtt$/) !== -1) {
      console.log(req.path);
      req
        .on('data', data => buffers.push(data))
        .on('end', () => {
          const pkt_pts = path[1];

          const data = Buffer.concat(buffers).toString().replace(
            /WEBVTT/g, 'WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:' + pkt_pts + ',LOCAL:00:00:00.000');

          if (!s3.s3) {
            fs.writeFile(output, data).catch(err => {
              console.log('Unable to write file', err);
            });
          }
          else {
            s3.s3.putObject({
              Bucket: app.config.s3.bucket,
              Key: output,
              Body: data
            }, err => {
              if (err) {
                console.log('Unable to write to file', err);
              }
            })
          }

          res.end();
        })
    }
    else if (req.path.search(/\._vtt\.m3u8$/) !== -1) {
      output = output.replace(/\._vtt\.m3u8$/, '.m3u8');

      req
        .on('data', buffer => buffers.push(buffer))
        .on('end', () => {
          const data = Buffer.concat(buffers);

          if (data.toString().indexOf('#EXT-X-ENDLIST') === -1) {
            // ignore incomplete playlists
            return res.end();
          }

          if (!s3.s3) {
            fs.writeFile(output, data).catch(() => {
              console.log(`Unable to write ${output}`);
            });
          }
          else {
            s3.s3.putObject({
              Bucket: app.config.s3.bucket,
              Key: output,
              Body: data
            }, err => {
              if (err) {
                console.log('Unable to upload file to s3', err);
              }
            });
          }

          res.end();
        });
    }
    else {
      // ignore the rest
      req.on('data', () => {
      });
      req.on('end', () => {
        res.end();
      });
    }
  });

  app.use('/segment-vtt', router);
}