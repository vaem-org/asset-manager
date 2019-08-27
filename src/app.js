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

import glob from 'glob';
import path from 'path';
import cors from 'cors';
import _ from 'lodash';
import { initMongoose } from '~/util/mongoose';
import { app, server as socketIOServer } from './util/socketio';

app.use(cors({
  origin: true,
  credentials: true
}));

app.set('trust proxy', true);

app.get('/_alive', (req, res) => res.end('alive'));

// add routes
const root = `${__dirname}/routes`;
const routes = _.mapKeys(glob
  .sync('**/*.js', { cwd: root })
, path =>
    '/' + path
    .replace(/\.js$/, '')
    .split('/')
    .map(component => component.replace(/^_/, ':'))
    .join('/')
    .replace(/(\/|^)index$/, '')
);

Object.keys(routes).sort().reverse().forEach(route => {
  const router = require(path.join(root, routes[route])).default;
  if (typeof router === 'function') {
    console.log(`Adding route: ${route}`);
    app.use(route, router);
  }
});

const port = process.env.PORT || 5000;

(async () => {
  await initMongoose();

  socketIOServer.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
