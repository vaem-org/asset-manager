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
require('dotenv').config();

const fs = require('fs');

const root = fs.realpathSync(`${__dirname}/..`);

const port = parseInt(process.env.PORT) || 1234;

const merge = (object, files) => {
  files.forEach(file => Object.assign(object, fs.existsSync(file) ? require(file) : {}));
  return object;
};

module.exports = merge({
  port,
  host: '0.0.0.0',

  devserver: `http://localhost:${port + 1}/`,

  root,

  auth: {
    username: 'admin',
    password: process.env.PASSWORD,
    allowIp: (process.env.ALLOW_IP || '').split(',').filter(value => value.length !== 0)
  },

  profiles: require(`${__dirname}/profiles.json`),

  // simple encryptor key for share urls
  encryptor: {
    key: process.env.SIMPLE_ENCRYPTOR_KEY,
    hmac: false
  },

  hlsEnc: true,

  env: process.env.NODE_ENV || 'development',

  mongo: process.env.MONGO_URL || 'mongodb://localhost/asset-manager',

  memcached: process.env.MEMCACHED_URL,

  output: `${root}/var/output`,
  tmp: `${root}/var/tmp`,
  source: `${root}/var/uploads`,
  archive: `${root}/var/archive`,
  protocol: process.env.PROTOCOL,

  sourceBase: process.env.SOURCE_BASE,
  publicStreams: process.env.PUBLIC_STREAMS,

  base: process.env.BASE,

  bunnyCDN: process.env.BUNNYCDN_AUTHENTICATIONKEY ? {
    authenticationKey: process.env.BUNNYCDN_AUTHENTICATIONKEY,
    hostname: process.env.BUNNYCDN_HOSTNAME,
    username: process.env.BUNNYCDN_USERNAME,
    password: process.env.BUNNYCDN_PASSWORD,
    storageZoneName: process.env.BUNNYCDN_STORAGEZONENAME
  } : null
}, [`${__dirname}/local.js`, `${__dirname}/../var/config.js`]);
