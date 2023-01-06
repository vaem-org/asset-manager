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

import glob from 'glob';
import cors from 'cors';
import express, { json, Router } from 'express';
import { config } from '#~/config';
import { initialise } from '#~/lib/encoders.socket.io';
import { initialisation } from '#~/lib/initialisation';
import { security } from '#~/lib/security';
import { File } from '#~/model/File/index';

(async () => {
  const app = express();

  await initialisation({
    createUploadQueue: true
  });

  await File.synchronise();

  app.use(cors({
    origin: true,
    credentials: true
  }));

  app.set('trust proxy', true);

  app.get('/_alive', (req, res) => res.end('alive'));

  app.use(json());

  // add routes
  const root = `${config.root}/src/routes`;
  const routes = glob.sync('**/*.js', { cwd: root })
    .map(path => {
        let route = '/' + path
        .replace(/\.js$/, '')
        .split('/')
        .map(component => component.replace(/^_/, ':'))
        .join('/')
        .replace(/(\/|^)index$/, '');
        return ({
          sort: route.replace(/:/g, 'ZZ'),
          route,
          path
        });
      }
    )
    .sort(({ sort: sortA }, { sort: sortB }) => sortA.localeCompare(sortB))
  ;

  const main = new Router({
    mergeParams: true
  });
  for (let { route, path } of routes) {
    // eslint-disable-next-line node/no-unsupported-features/es-syntax
    const router = (await import(`${root}/${path}`)).default;
    if (typeof router === 'function') {
      console.log(`Adding route: ${route}`);
      main.use(route, router);
    }
  }

  app.use(['/signed/:timestamp/:n/:signature', '/'], security(), main);

  const server = initialise(app);
  server.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
})().catch(e => {
  console.error(e);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

