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

import mongoose from 'mongoose';

const Settings = mongoose.model('Settings', {
  path: {type: String, unique: true},
  values: {}
});

const cache = {};

const get = async path => {
  if (cache[path]) {
    return cache[path];
  }

  const item = await Settings.findOne({path});

  if (item) {
    cache[path] = item;
  }
  else {
    cache[path] = new Settings({path, values: {}});
  }

  return cache[path];
};

export {Settings, get};
