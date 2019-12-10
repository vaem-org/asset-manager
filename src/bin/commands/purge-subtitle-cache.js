import config from '@/config';
import sywac from 'sywac';
import axios from 'axios';
import { Bar } from 'cli-progress';

sywac.command('purge-subtitle-cache <assetId>', async ({ assetId }) => {
  const entries = await config.destinationFileSystem.list(`/${assetId}/subtitles`);
  const bar = new Bar();

  bar.start(entries.length);
  let i =0;
  for(let { name } of entries) {
    await axios.post('https://bunnycdn.com/api/purge', null, {
      params: {
        url: `https://${config.bunnyCDN.hostname}.b-cdn.net/${assetId}/subtitles/${name}`
      },
      headers: {
        AccessKey: config.bunnyCDN.apiKey
      }
    });
    bar.update(++i);
  }
  bar.stop();
});
