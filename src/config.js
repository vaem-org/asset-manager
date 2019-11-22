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
import { fileSystemFromURL } from '@vaem-util/filesystem';
import fs from 'fs';
import { URL } from 'url';
import { randomBytes } from 'crypto';

const root = fs.realpathSync(`${__dirname}/..`);

const port = parseInt(process.env.PORT) || 5000;

const merge = (object, files) => {
  files.forEach(file => Object.assign(object, fs.existsSync(file) ? require(file) : {}));
  return object;
};

let auth = null;
const authUrl = process.env.AUTH_URL && new URL(process.env.AUTH_URL);
if (authUrl) {
  switch(authUrl.protocol) {
    case 'google:':
      auth = {
        provider: 'google',
        clientId: authUrl.username,
        clientSecret: authUrl.password,
        hd: authUrl.hostname
      };
      break;

    case 'local:':
      auth = {
        provider: 'local',
        password: authUrl.hostname
      };
      break;

    default:
      throw `Unknown authentication protocol ${authUrl.protocol}`;
  }
}

const source = `${root}/var/uploads`;
const destinationFS = process.env.DESTINATION_FS || `file://${root}/var/output`;
const config = merge({
  port,
  host: '0.0.0.0',

  root,

  jwtSecret: process.env.JWT_SECRET,

  auth,

  profiles: require(`${root}/config/profiles.json`),

  hlsEnc: true,

  env: process.env.NODE_ENV || 'development',

  mongo: process.env.MONGO_URL || 'mongodb://localhost:48489/asset-manager',

  output: `${root}/var/output`,
  source,

  base: process.env.BASE,

  destinationFileSystem: fileSystemFromURL(destinationFS),
  destinationIsLocal: destinationFS.startsWith('file://'),
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
    tenantId: process.env.AZURE_TENANT_ID,
    numInstances: 4,
    numCPUs: 4
  },

  encoderToken: process.env.ENCODER_TOKEN || randomBytes(16).toString('hex'),
  slackHook: process.env.SLACK_HOOK,

  separateAudio: process.env.SEPARATE_AUDIO === '1',
  sourceAccelRedirect: process.env.SOURCE_ACCEL_REDIRECT
}, [`${root}/config/local.js`, `${__dirname}/../var/config.js`]);

export default config;
