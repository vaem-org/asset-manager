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
import config from '../../config/config';

import mongoose from 'mongoose';
import basicAuth from 'basic-auth';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import _ from 'lodash';
import compression from 'compression';
import throng from 'throng';
import session from 'express-session';
import connectMemcached from 'connect-memcached';
import url from 'url';
import {sync as glob} from 'glob';
import os from 'os';

const MemcachedStore = connectMemcached(session);

const app = express();

const run = config.env === 'production' ? throng : (count, fn) => fn();

run(1, () => {
  const http = require('http').Server(app);
  const io = require('socket.io')(http);

  mongoose.Promise = Promise;

  mongoose.connect(config.mongo, {
    useNewUrlParser: true,
    useCreateIndex: true
  });

  app.config = config;
  app.io = io;

  app.set('view engine', 'ejs');
  app.set('views', `${__dirname}/views`);
  app.set('trust proxy', ['loopback', 'uniquelocal', '172.17.0.1']);

  if (config.env === 'development') {
    app.use((req, res, next) => {
      if (req.hostname !== 'localhost') {
        return next();
      }

      const ips = _.flatten(_.values(os.networkInterfaces()))
        .filter(data => data.family === 'IPv4' && !data.internal)
      ;

      return res.redirect(`http://${ips[0].address}:${config.port+1}/`);
    });
  }

  app.use(compression());

  app.engine('ejs', function (template, locals, callback) {
    ejs.renderFile(template, _.extend({}, locals), {
      rmWhitespace: true,
      cache: app.config.viewCache,
      root: `${__dirname}/views`
    }, callback);
  });

  if (config.googleAuth || config.auth) {
    app.use(cookieParser());
  }

  app.sessionStore = config.memcached ? new MemcachedStore({
    hosts: [url.parse(config.memcached).hostname]
  }) : new session.MemoryStore();

  app.use(session(
    {
      secret: 'QXHC5H+FeDHuc//PkVBipKEdglh8NdJLzC8tb8xT1Og=',
      resave: false,
      saveUninitialized: false,
      store: app.sessionStore
    }));

  if (config.googleAuth) {
    require('./util/passport').default(app);
  }

  app.use('/', express.static(`${config.root}/public`, {
    maxAge: 7 * 24 * 3600 * 1000
  }));

  if (config.auth || config.googleAuth) {
    app.use((req, res, next) => {
      if (/^\/(embed\/\d+\/|player\/\d+\/|check|auth|player\/subtitles|__webpack|player\/streams)/.exec(req.url)) {
        return next();
      }

      const user = basicAuth(req);

      const isPlayer = /^(\/shared)?\/player\/[^\/]+\//.exec(req.url);
      if (isPlayer && req.session.authenticated) {
        return next();
      }
      else if (!isPlayer && req.session.sharedOnly) {
        req.session.authenticated = null;
      }

      if (req.session.basicAuthenticated) {
        return next();
      }

      if (config.googleAuth && !user) {
        if (!req.session.passport && !req.session.authenticated) {
          return res.redirect('/auth/passport/');
        }
        else {
          return next();
        }
      }

      if (!user || user.name !== app.config.auth.username || user.pass !== app.config.auth.password) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        res.statusCode = /^\/shared\/player/.exec(req.url) ? 403 : 401;
        return res.end();
      }
      else if (user) {
        req.session.basicAuthenticated = true;
      }

      next();
    });
  }

  app.use((req, res, next) => {
    req.base = config.base || `${config.protocol || req.protocol}://${req.get('host')}`;
    next();
  });

  // load controllers
  glob(`${__dirname}/controllers/*.js`)
    .forEach(controller => require(controller).default(app));

  app.get('/check', (req, res) => res.send('ready'));

  http.listen(config.port, config.host, () => {
    console.log('server listening on  http://%s:%s/', config.host, config.port);
  });
});
