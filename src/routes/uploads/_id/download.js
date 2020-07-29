import { Router } from 'express';
import { api, verify } from '@/lib/express-helpers';
import { File } from '@/model/file';
import { getSource } from '@/lib/source';

const router = new Router({
  mergeParams: true
});

router.get('/', verify, api(async req => {
  const file = await File.findById(req.params.id);
  if (!file) {
    throw {
      status: 404
    }
  }

  return getSource(file.name, true);
}));

export default router;
