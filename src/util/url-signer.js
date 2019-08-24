import crypto from 'crypto';

/**
 * Compute a signature for given asset
 * @param {String} source the source string to perform a hash on
 * @param {int} validTo a unix timestamp to which the signature is considered valid
 * @param {String} ip the client's ip address
 */
export function computeSignature(source, validTo, ip='') {
  return crypto.createHmac('sha256', process.env.SIGNATURE_SECRET)
    .update(source + validTo + ip)
    .digest('hex')
}

/**
 * Verify a url signature
 * @param {Request} req
 * @param {String} source
 * @returns {boolean}
 */
export function verifySignature(req, source=null) {
  // timestamp should be before now
  if (req.params.timestamp < Date.now()) {
    return false;
  }

  // validate signature
  const signature = computeSignature(source || req.url,
    req.params.timestamp);

  return signature === req.params.signature;
}

/**
 * Get a signed url
 * @param {String} source
 * @param {Number} expiresInSeconds the number of seconds the url is valid
 */
export function getSignedUrl(source, expiresInSeconds) {
  const validTo = Date.now() + expiresInSeconds*1000;
  return `/${validTo}/${computeSignature(source, validTo)}${source}`;
}