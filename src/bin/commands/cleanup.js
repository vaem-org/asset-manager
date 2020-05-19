import sywac from 'sywac';
import config from '@/config';
import { removeEmptyDirectories } from '@/lib/util';

async function run() {
  await removeEmptyDirectories(`${config.root}/var/tmp`);
}

sywac.command('clean', run);
