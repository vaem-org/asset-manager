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

import _ from 'lodash';

const getParams = params => {
  const result = [];
  _.each(params, (value, key) => {
    if (typeof value === 'undefined') {
      return;
    }

    (typeof value === 'object' ? value : [value]).forEach(value => {
      result.push('-' + key);
      if (value !== true) {
        result.push(value);
      }
    });
  });

  return result;
};

/**
 * Convert an associative array to a flat array for passing as arguments to ffmpeg
 * @param {{}} params
 * @return []
 */
export default getParams;
