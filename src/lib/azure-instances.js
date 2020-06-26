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
import { URL } from "url";

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

  const list = await client.containerGroups.list();

  const existing = _.map(list.filter(item => item.name.startsWith('encoder')), item => parseInt(item.name.replace(/^encoder/, ''), 10));

  const parsed = new URL(config.base);
  parsed.username = process.env.ENCODER_TOKEN;
  const assetManagerUrl = parsed.toString();

  await Promise.all(_.difference(_.range(config.azureInstances.numInstances), existing).map(async index => {
    console.info(`Creating encoder${index}`);
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
                secureValue: assetManagerUrl
              }
            ],
            name: 'encoder',
            resources: {
              requests: {
                cpu: config.azureInstances.numCPUs,
                memoryInGB: 1
              }
            }
          }],
        osType: 'Linux',
        location: 'WestEurope',
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
    config.azureInstances.resourceGroup,
    `encoder${index}`
  )));
}

export async function deleteEncoders() {
  if (!client) {
    throw 'Not initialized';
  }

  await Promise.all(_.range(config.azureInstances.numInstances).map(index =>
    client.containerGroups.deleteMethod(
      config.azureInstances.resourceGroup,
      `encoder${index}`
    )
  ));
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
