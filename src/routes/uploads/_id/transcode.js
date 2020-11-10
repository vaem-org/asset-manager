import { Router } from 'express';
import { spawn } from 'child_process';
import { catchExceptions } from '@/lib/express-helpers';
import { File } from '@/model/file';
import { getChannelMapping, getSource } from '@/lib/source';
import { verifySignature } from '@/lib/url-signer';

const router = new Router({
  mergeParams: true
});

router.get('/:timestamp/:signature/stream.ts', catchExceptions(async (req, res) => {
  if (!verifySignature(req, req.params.id)) {
    throw {
      status: 401
    }
  }

  const item = await File.findById(req.params.id);
  if (!item) {
    throw {
      status: 404
    }
  }

  const source = getSource(item.name);
  const channels = await getChannelMapping(item, source);

  const child = spawn('ffmpeg', [
    '-v', 'error',
    '-i', source,
    '-c', 'copy',
    '-map', '0:v',
    ...Object.entries(channels.stereoMap).map(([key, value]) => [
      `-${key}`, value
    ]).flat(),
    '-f', 'mpegts',
    '-'
  ], {
    stdio: ['inherit', 'pipe', 'inherit']
  });

  child.stdout.pipe(res);

  req.on('close', () => {
    child.kill('SIGKILL');
  });

  child.on('close', code => {
    if (code !== 0) {
      res.status(500);
    }
    res.end();
  });
}));

export default router;
