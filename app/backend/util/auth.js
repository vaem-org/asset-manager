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

/**
 * Check whether given ip is allowed access without authentication
 * @param {{}} config
 * @param {String} ip
 * @returns {boolean}
 */
const checkIp = (config, ip) => {
  if (ip === '127.0.0.1') {
    return true;
  }

  if (_.get(config, 'auth.allowIp')) {
    return (_.isArray(config.auth.allowIp) ? config.auth.allowIp : [config.auth.allowIp])
      .filter(prefix => ip.substr(0, prefix.length) === prefix)
      .length > 0;
  }

  return false;
};

export {checkIp};