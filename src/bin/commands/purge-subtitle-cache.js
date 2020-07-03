import config from '@/config';
import sywac from 'sywac';
import { Bar } from 'cli-progress';
import { purgeCache } from '@/lib/bunnycdn';

sywac.command('purge-subtitle-cache <assetId>', async ({ assetId }) => {
  const entries = await config.destinationFileSystem.list(`/${assetId}/subtitles`);
  const bar = new Bar();

  bar.start(entries.length);
  let i =0;
  for(let { name } of entries) {
    await purgeCache(`/${assetId}/subtitles/${name}`);
    bar.update(++i);
  }
  bar.stop();
});
