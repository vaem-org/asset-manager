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

import config from '@/config';
import _ from 'lodash';

import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance';
import { loginWithServicePrincipalSecretWithAuthResponse } from '@azure/ms-rest-nodeauth';
import { URL } from 'url';

/**
 * @var ContainerInstanceManagementClient
 */
let client;

let created = false;

/**
 * Create encoders
 * @returns {Promise<void>}
 */
export async function createEncoders() {
  if (!client) {
    throw 'Not initialized';
  }

  console.log('Creating instances');

  const list = (await client.containerGroups.list())
    .filter(({ id }) => id.split('/')[4] === config.azure.resourceGroup)
  ;

  const existing = _.map(list.filter(item => item.name.startsWith('encoder')), item => parseInt(item.name.replace(/^encoder/, ''), 10));

  const parsed = new URL(config.base);
  parsed.username = process.env.ENCODER_TOKEN;
  const assetManagerUrl = parsed.toString();

  await Promise.all(_.difference(_.range(config.azure.numInstances), existing).map(async index => {
    console.info(`Creating encoder${index}`);

    const {
      shareName,
      storageAccountKey,
      storageAccountName
    } = config.azure;

    return client.containerGroups.createOrUpdate(
      config.azure.resourceGroup,
      `encoder${index}`,
      {
        volumes: storageAccountKey ? [{
          name: 'source',
          azureFile: {
            shareName,
            storageAccountKey,
            storageAccountName,
            readOnly: true
          }
        }] : [],
        containers: [
          {
            image: config.azure.image,
            environmentVariables: [
              {
                name: 'ASSETMANAGER_URL',
                secureValue: assetManagerUrl
              }
            ],
            name: 'encoder',
            resources: {
              requests: {
                cpu: config.azure.numCPUs,
                memoryInGB: 1,
                gpu: config.azure.numGPUs >= 1 ? {
                  count: config.azure.numGPUs,
                  sku: 'K80'
                } : null
              }
            },
            volumeMounts: storageAccountKey ? [
              {
                mountPath: '/app/var/uploads',
                name: 'source',
                readOnly: true
              }
            ] : []
          }],
        osType: 'Linux',
        location: config.azure.location,
        restartPolicy: 'Never'
      }
    )
  }));
  created = true;
}

export async function startEncoders({ numInstances }) {
  if (!created) {
    await createEncoders();
  }

  await Promise.all(_.range(numInstances).map(index => client.containerGroups.start(
    config.azure.resourceGroup,
    `encoder${index}`
  )));
}

export async function deleteEncoders() {
  if (!client) {
    throw 'Not initialized';
  }

  await Promise.all(_.range(config.azure.numInstances).map(index =>
    client.containerGroups.deleteMethod(
      config.azure.resourceGroup,
      `encoder${index}`
    )
  ));
}

export async function init() {
  const auth = config.azure;
  if (!auth.clientId) {
    return;
  }

  const creds = await loginWithServicePrincipalSecretWithAuthResponse(
    auth.clientId,
    auth.secret,
    auth.tenantId
  );

  const subscriptionId = auth.subscriptionId || creds.subscriptions[0].id;
  client = new ContainerInstanceManagementClient(
    creds.credentials,
    subscriptionId
  );
}
