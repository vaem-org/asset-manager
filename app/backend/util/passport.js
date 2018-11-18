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

import passport from 'passport';
import {OAuth2Strategy as GoogleStrategy} from 'passport-google-oauth';
import _ from 'lodash';
import {renderIndex} from '../util/render-index';
import {json} from 'express';
import {api} from './express-helpers';

const passportMiddleware = app => {
  const config = app.config.googleAuth;

  passport.use(new GoogleStrategy(
    {
      clientID: config.clientID,
      clientSecret: config.clientSecret,
      callbackURL: (config.base || '') + '/auth/passport/google'
    }, (accessToken, refreshToken, profile, done) => {
      const domain = _.get(profile, '_json.domain');

      if (domain !== config.hd) {
        return done('Access denied');
      }
      done(null, _.omit(profile, ['_raw', '_json']));
    }));

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/auth/passport',
    passport.authenticate('google', {
      hd: config.hd,
      scope: [
        'https://www.googleapis.com/auth/plus.login',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ]
    }));

  app.get('/auth/passport/google',
    passport.authenticate('google', {
      failureRedirect: '/login'
    }),
    (req, res) => res.redirect('/')
  );

  app.get('/login', renderIndex('main'));
  app.post('/login', json(), api(req => {
    throw 'Unable to login';
  }));
};

export default passportMiddleware;