import { Router } from 'express';
import { api } from '@/lib/express-helpers';
import { Asset } from '@/model/asset';

const router = new Router({
  mergeParams: true
});

router.get('/', api(async req => {
  const asset = await Asset.findOne({
    externalId: req.params.externalId
  });

  if (!asset) {
    throw {
      status: 404
    }
  }

  return asset;
}))

export default router;
