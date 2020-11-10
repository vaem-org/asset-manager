import { computeSignature } from '@/lib/url-signer';
import config from '@/config';
import { loginWithServicePrincipalSecretWithAuthResponse } from '@azure/ms-rest-nodeauth';
import { AzureMediaServices } from '@azure/arm-mediaservices';
import { Asset } from '@/model/asset';
import { getSource, getVideoParameters } from '@/lib/source';
import slug from 'slug';

/**
 * The client for azure media services
 * @type {AzureMediaServices}
 */
let client = null;

export async function initialise() {
  const {
    clientId,
    secret,
    tenantId,
    subscriptionId
  } = config.azure;

  const { credentials } = await loginWithServicePrincipalSecretWithAuthResponse(
    clientId,
    secret,
    tenantId
  );

  client = new AzureMediaServices(credentials, subscriptionId);
}

/**
 * Create an asset on Azure
 * @param {File} file
 * @return {Promise<void>}
 */
export async function createAsset({ file }) {
  const timestamp = Date.now() + 8*60*60*1000;
  const signature = computeSignature(file._id, timestamp);
  const url = `${config.base}/uploads/${file._id}/transcode/${timestamp}/${signature}/stream.ts`;

  const {
    resourceGroup,
    storageAccountName
  } = config.azure;

  const asset = new Asset({
    file,
    provider: 'azure',
    title: file.name.replace(/\.[^.]+$/, ''),
    state: 'processing',
    source: url,
    videoParameters: await getVideoParameters(getSource(file.name))
  });

  const namePrefix = `${slug(asset.title.toLowerCase())}-${asset._id}`;

  await asset.save();

  const outputAsset = await client.assets.createOrUpdate(
    resourceGroup,
    storageAccountName,
    namePrefix,
    {
      alternateId: asset._id.toString()
    }
  );

  await client.jobs.create(
    resourceGroup,
    storageAccountName,
    'default',
    `job-${namePrefix}`, {
    input: {
      odatatype: '#Microsoft.Media.JobInputHttp',
      files: [url]
    },
    outputs: [{
      odatatype: '#Microsoft.Media.JobOutputAsset',
      assetName: outputAsset.name
    }]
  });

  await client.streamingLocators.create(
    resourceGroup,
    storageAccountName,
    `locator-${asset._id}`, {
      assetName: outputAsset.name,
      streamingPolicyName: 'Predefined_ClearStreamingOnly'
    }
  );
}

/**
 * Get streaming urls for an asset
 * @param {String} assetId
 * @return {Promise<String[]>}
 */
export async function getStreamingUrls({ assetId }) {
  const {
    resourceGroup,
    storageAccountName
  } = config.azure;

  const streamingEndpoint = await client.streamingEndpoints.get(
    resourceGroup,
    storageAccountName,
    'default'
  );

  const { streamingPaths } = await client.streamingLocators.listPaths(
    resourceGroup,
    storageAccountName,
    `locator-${assetId}`
  );

  return streamingPaths.map(paths => `https://${streamingEndpoint.hostName}/${paths[0]}`);
}
