import sywac from 'sywac';
import config from '@/config';
import { Asset } from '@/model/asset';

sywac.command('verify-subtitles <assetId>', async ({ assetId }) => {
  const asset = await Asset.findById(assetId);
  if (!asset) {
    throw `Unable to find asset ${assetId}`;
  }

  if (Object.keys(asset.subtitles || {}).length === 0) {
    console.info(`No subtitles for ${assetId}`);
    return;
  }

  const entries = (await config.destinationFileSystem.list(`${assetId}/subtitles`))
    .map(entry => entry.name);

  let errors = 0;
  for(let language of Object.keys(asset.subtitles)) {
    // check for main vtt and m3u8 files
    ['vtt', 'm3u8'].forEach(extension => {
      const filename = `${language}.${extension}`;
      if (!entries.includes(filename)) {
        console.error(`${filename} does not exist`);
        errors++;
      }
    });

    // check segments
    const m3u8 = await config.destinationFileSystem.readFile(`${assetId}/subtitles/${language}.m3u8`);
    const segments = m3u8.toString()
      .split('\n')
      .filter(line => line.endsWith('.vtt'))
    ;

    for(let segment of segments) {
      if (!entries.includes(segment)) {
        console.error(`${segment} does not exist`);
        errors++;
      }
    }
  }

  if (errors > 0) {
    throw `Subtitles missing for ${assetId}`;
  } else {
    console.info(`Asset ${assetId} is ok`);
  }
});