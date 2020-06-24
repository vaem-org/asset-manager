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

import config from '@/config';
import rangeParser from 'range-parser';
import { Router } from 'express';
import { catchExceptions, verify } from '~/lib/express-helpers';
import { verifySignature } from '@/lib/url-signer';

const router = new Router();

const serve = catchExceptions(async (req, res) => {
  const resource = req.url
  .split('/')
  .map(component => decodeURIComponent(component))
  .join('/');

  const redirect = await config.sourceFileSystem.getSignedUrl(resource);
  if (redirect) {
    res.redirect(redirect);
  } else if (config.sourceAccelRedirect) {
    res.setHeader('X-Accel-Redirect', config.sourceAccelRedirect + req.url);
    res.end();
  } else {
    // parse ranges
    const path = decodeURIComponent(req.url);
    const stat = await config.sourceFileSystem.get(path);
    const ranges = req.headers.range ? rangeParser(stat.size, req.headers.range) : [];

    if (ranges === -1) {
      res.status(416);
      return res.end();
    }

    res.setHeader('Content-Type', 'binary/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.headers.range && ranges.length === 1) {
      res.status(206);

      res.setHeader('Content-Range', `bytes ${ranges[0].start}-${ranges[0].end}/${stat.size}`);
      res.setHeader('Content-Length', ranges[0].end - ranges[0].start + 1);
    } else {
      res.setHeader('Content-Length', stat.size);
    }

    const input = await config.sourceFileSystem.read(path, {
      start: ranges.length === 1 ? ranges[0].start : 0
    });

    input.stream.pipe(res);

    req.on('close', () => {
      setTimeout(() => input.stream.destroy(), 250);
    });
  }
});

router.use('/:timestamp/:signature', (req, res, next) => {
  if (!verifySignature(req)) {
    return res.status(403).end();
  }

  req.token = true;
  next();
}, serve);

router.use(verify, serve);

export default router;
