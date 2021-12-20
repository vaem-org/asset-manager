import { Router } from 'express';
import { getDocument, wrapper } from '#~/lib/express-helpers';
import { File } from '#~/model/File/index';
import send from 'send';

const router = new Router({
  mergeParams: true
});

router.get('/', wrapper(async (req, res) => {
  const { params: { id } } = req;
  const file = await getDocument(File, id);
  res.setHeader('content-disposition', `attachment; filename="${file.name}"`)
  send(req, file.path).pipe(res);
}));

export default router;
