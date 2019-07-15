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

import config from '../config/config';
import mongoose from 'mongoose';
import masterPlaylist from '../app/backend/util/master-playlist';

(async () => {
  await mongoose.connect(config.mongo, {
    useNewUrlParser: true
  });

  await masterPlaylist(process.argv[2]);

  await mongoose.disconnect();
})().catch(e => console.error(e));