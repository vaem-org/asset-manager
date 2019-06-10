import {catchExceptions} from '~/util/express-helpers';
import {spawn} from 'child_process';
import {Router} from 'express';
import {computeSignature} from '~/util/asset-signer';
import moment from 'moment';
import {Asset} from '@/model/asset';
import _ from 'lodash';
import slug from 'slug';

const router = new Router();

router.get('/:id.ts', catchExceptions(async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  const videoStream = _.maxBy(asset.streams, 'bandwidth');
  const audioStream = asset.audioStreams.find(item => item.bitrate === 'aac-128k');

  const timestamp = moment().add(8, 'hours').valueOf();
  const signature = computeSignature(req.params.id, timestamp, req.ip);

  const videoUrl = `${req.protocol}://${req.get('host')}/player/streams/${timestamp}/${signature}/${videoStream.filename}`;
  const audioUrl = audioStream &&`${req.protocol}://${req.get('host')}/player/streams/${timestamp}/${signature}/${audioStream.filename}`;

  const child = spawn('ffmpeg', [
    '-v', 'error',
    '-i', videoUrl,
    ...(audioUrl ? [
      '-i', audioUrl,
      '-map', '0:0',
      '-map', '1:0',
    ] : []),
    '-c', 'copy',
    '-f', 'mpegts',
    '-'
  ], {
    stdio: ['ignore', 'pipe', 'inherit']
  });

  res.setHeader('content-disposition', `attachment; filename="${slug(asset.title)}.ts"`);

  child.stdout.pipe(res);

  child.on('close', () => {
    res.end();
  });

  req.on('close', () => {
    child.kill();
  });
}));

module.exports = {router};