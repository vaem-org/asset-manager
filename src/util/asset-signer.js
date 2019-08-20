import crypto from 'crypto';

/**
 * Compute a signature for given asset
 * @param {String} assetId the id of the asset
 * @param {int} validTo a unix timestamp to which the signature is considered valid
 * @param {String} ip the client's ip address
 */
export function computeSignature(assetId, validTo, ip) {
  return crypto.createHmac('sha256', process.env.SIGNATURE_SECRET)
    .update(assetId + validTo + ip)
    .digest('hex')
}