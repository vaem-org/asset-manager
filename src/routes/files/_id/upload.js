import { Router } from 'express';
import { createWriteStream } from 'fs';
import { dirname } from 'path';
import { stat, mkdir } from 'fs/promises';
import { api, getDocument, wrapper } from '#~/lib/express-helpers';
import { File } from '#~/model/File/index';

const router = new Router({
  mergeParams: true
});

router.get('/', api(async ({ params: { id }}) => {
  const file = await getDocument(File, id);

  try {
    file.size = (await stat(file.path)).size;
  }
  catch (e) {
    // skip
  }
  return file.toJSON();
}));

router.put('/:start', wrapper(async (req, res) => {
  const { params: { id, start } } = req;
  const file = await getDocument(File, id);
  await mkdir(dirname(file.path), {
    recursive: true
  });
  const output = createWriteStream(file.path, {
    flags: 'a+',
    start: parseInt(start)
  });
  req.pipe(output)

  const updateSize = () => {
    (async () => {
      file.size = (await stat(file.path)).size;
      console.log(file.size)
      await file.save();
      res.json(file.toJSON());
    })().catch(e => {
      console.warn(`Unable to update size for upload ${id}: ${e.toString()}`);
      res.status(500).end()
    })
  }

  output.on('close', updateSize)
}));

export default router;
