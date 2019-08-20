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

import rangeParser from 'range-parser';
import { Router } from 'express';
import { catchExceptions } from '~/util/express-helpers';

const router = new Router();

router.use(catchExceptions(async (req, res) => {
  const redirect = await config.sourceFileSystem.getSignedUrl(req.url);
  if (redirect) {
    res.redirect(redirect);
  } else {
    // parse ranges
    const stat = await config.sourceFileSystem.get(req.url);
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

    const input = await config.sourceFileSystem.read(req.url, {
      start: ranges.length === 1 ? ranges[0].start : 0
    });

    input.stream.pipe(res);
  }
}));

export default router;