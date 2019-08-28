import config from '@/config';
import { Router } from 'express';
import { catchExceptions } from '@/util/express-helpers';
import { Asset } from '@/model/asset';
import { getSignedUrl, verifySignature } from '@/util/url-signer';

const router = new Router();

router.get('/:timestamp/:signature/:assetId',
  catchExceptions(async (req, res, next) => {

  if (!verifySignature(req, `/${req.params.assetId}`)) {
    return res.status(403).end();
  }

  const asset = await Asset.findById(req.params.assetId);

  if (!asset) {
    return next();
  }

  return res.send([
    'file.key',
    `${config.base}/encoders/keyinfo${getSignedUrl(`/${req.params.assetId}/file.key`, 4*3600)}`,
    asset.hls_enc_iv
  ].join('\n'));
}));

router.get('/:timestamp/:signature/:assetId/file.key',
  catchExceptions(async (req, res, next) => {
  if (!verifySignature(req, `/${req.params.assetId}/file.key`)) {
    return res.status(403).end();
  }

  const asset = await Asset.findById(req.params.assetId);

  if (!asset) {
    return next();
  }

  return res.send(Buffer.from(asset.hls_enc_key, 'hex'));
}));

export default router;