import { Router } from 'express';
import { EventEmitter } from 'events';
import { catchExceptions } from '@/lib/express-helpers';
import { verifySignature } from '@/lib/url-signer';
import { Asset } from '@/model/asset';
import { listSize } from '@/lib/live-streams';

const router = new Router({
  mergeParams: true
});

const assets = {};
const events = new EventEmitter();

router.put( '/:timestamp/:signature/:assetId/:name', catchExceptions(async (req, res) => {
  if (!verifySignature(req, req.params.assetId)) {
    return res.status(403).end();
  }

  if (!assets[req.params.assetId]) {
    const asset = await Asset.findById(req.params.assetId);
    assets[req.params.assetId] = {
      asset,
      buffers: {},
      files: [],
      validPlaylists: new Set(asset.bitrates.map(
        bitrate => `${req.params.assetId}.${bitrate}.m3u8`
      ))
    }
  }

  const { buffers, files } = assets[req.params.assetId];

  const data = [];
  req.on('data', buf => data.push(buf));
  req.on('end', () => {
    buffers[req.params.name] = Buffer.concat(data);

    if (req.params.name.endsWith('.ts')) {
      files.push(req.params.name);

      if (files.length > listSize+2) {
        const drop = files.shift();
        delete buffers[drop];
      }
    } else if (req.params.name.endsWith('.m3u8')) {
      events.emit(req.params.name);
    }

    res.end();
  });
}));

router.get('/:timestamp/:signature/:assetId/:assetId.m3u8', catchExceptions(async (req, res, next) => {
  if (!verifySignature(req, req.params.assetId)) {
    return next();
  }

  if (!assets[req.params.assetId]) {
    throw {
      status: 404
    }
  }

  const { validPlaylists, asset, buffers } = assets[req.params.assetId];

  // check for all m3u8s
  const waitFor = Array.from(validPlaylists)
    .filter(file => !buffers[file])
  ;

  const video = asset.videoParameters;
  await Promise.all(waitFor.map(file => new Promise(accept => events.on(file, accept))));

  res.header('Content-Type', 'application/vnd.apple.mpegurl');
  res.end([
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    ...asset.streams.map(({ width, bandwidth, bitrate }) =>
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${Math.floor(width/video.width*video.height)}
${req.params.assetId}.${bitrate}.m3u8`
    )
  ].join('\n'));
}));

router.get('/:timestamp/:signature/:assetId/:name', catchExceptions(async (req, res) => {
  if (!verifySignature(req, req.params.assetId)) {
    return res.status(403).end();
  }

  if (!assets[req.params.assetId]) {
    throw {
      status: 404
    }
  }

  const { buffers, validPlaylists } = assets[req.params.assetId];

  if (buffers[req.params.name]) {
    res.end(buffers[req.params.name]);
  } else if (validPlaylists.has(req.params.name)) {
    // wait for upload
    events.on(req.params.name, () => {
      res.end(buffers[req.params.name]);
    });
  } else {
    throw {
      status: 404
    }
  }
}));

export default router;
