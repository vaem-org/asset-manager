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
import {range} from 'lodash';

import {URL} from 'url';
import {ContainerInstanceManagementClient} from '@azure/arm-containerinstance';
import {loginWithServicePrincipalSecretWithAuthResponse} from '@azure/ms-rest-nodeauth';

/**
 * @var ContainerInstanceManagementClient
 */
let client;

/**
 * Create encoders
 * @param {Number} numCpus the number of cpus per instance
 * @param {Number} numInstances the number of instances to create
 * @returns {Promise<void>}
 */
export async function createEncoders({numCpus=1, numInstances=1}) {
  if (!client) {
    throw 'Not initialized';
  }

  await Promise.all(range(numInstances).map(async index => {
    return client.containerGroups.createOrUpdate(
      config.azureInstances.resourceGroup,
      `encoder${index}`,
      {
        containers: [
          {
            image: config.azureInstances.image,
            environmentVariables: [
              {
                name: 'ASSETMANAGER_URL',
                secureValue: config.base
              }
            ],
            name: 'encoder',
            resources: {
              requests: {
                cpu: numCpus,
                memoryInGB: 1
              }
            }
          }],
        osType: 'Linux',
        location: 'WestEurope'
      }
    )
  }));
}

export async function deleteEncoder(index) {
  if (!client) {
    throw 'Not initialized';
  }

  await client.containerGroups.deleteMethod(
    config.azureInstances.resourceGroup,
    `encoder${index}`
  );
}

export async function init() {
  const auth = config.azureInstances;
  if (!auth.clientId) {
    return;
  }

  const creds = await loginWithServicePrincipalSecretWithAuthResponse(
    auth.clientId,
    auth.secret,
    auth.tenantId
  );

  const subscriptionId = creds.subscriptions[0].id;
  client = new ContainerInstanceManagementClient(
    creds.credentials,
    subscriptionId
  );
}