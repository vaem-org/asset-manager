import { Router } from 'express';
import { api, verify } from '@/lib/express-helpers';
import { createAsset } from '@/lib/azure-media-services';
import { File } from '@/model/file';

const router = new Router({
  mergeParams: true
});

router.post('/', verify, api(async req => {
  return createAsset({
    file: await File.findById(req.params.id)
  });
}));

export default router;
