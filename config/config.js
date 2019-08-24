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

const { fileSystemFromURL } = require('@vaem/filesystem');

const fs = require('fs');

const root = fs.realpathSync(`${__dirname}/..`);

const port = parseInt(process.env.PORT) || 1234;

const merge = (object, files) => {
  files.forEach(file => Object.assign(object, fs.existsSync(file) ? require(file) : {}));
  return object;
};

const source = `${root}/var/uploads`;
const config = merge({
  port,
  host: '0.0.0.0',

  root,

  jwtSecret: process.env.JWT_SECRET,

  auth: {
    username: 'admin',
    password: process.env.PASSWORD,
    allowIp: (process.env.ALLOW_IP || '').split(',').filter(value => value.length !== 0)
  },

  profiles: require(`${__dirname}/profiles.json`),

  hlsEnc: true,

  env: process.env.NODE_ENV || 'development',

  mongo: process.env.MONGO_URL || 'mongodb://localhost/asset-manager',

  output: `${root}/var/output`,
  source,

  publicStreams: process.env.PUBLIC_STREAMS,

  base: process.env.BASE,

  destinationFileSystem: fileSystemFromURL(process.env.DESTINATION_FS || `file://${root}/var/output`),
  sourceFileSystem: fileSystemFromURL(process.env.SOURCE_FS || `file://${source}`),

  bunnyCDN: process.env.BUNNYCDN_AUTHENTICATIONKEY ? {
    authenticationKey: process.env.BUNNYCDN_AUTHENTICATIONKEY,
    hostname: process.env.BUNNYCDN_HOSTNAME,
    username: process.env.BUNNYCDN_USERNAME,
    password: process.env.BUNNYCDN_PASSWORD,
    storageZoneName: process.env.BUNNYCDN_STORAGEZONENAME
  } : null,

  azureInstances: {
    image: 'vaem/encoder',
    resourceGroup: process.env.AZURE_RESOURCE_GROUP,
    clientId: process.env.AZURE_CLIENT_ID,
    secret: process.env.AZURE_SECRET,
    tenantId: process.env.AZURE_TENANT_ID
  }
}, [`${__dirname}/local.js`, `${__dirname}/../var/config.js`]);

export default config;