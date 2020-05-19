#!/usr/bin/env node
import sywac from 'sywac';
import mongoose from 'mongoose';
import { sync as glob } from 'glob';
import { initMongoose } from '@/lib/mongoose';

process.env.PATH = `/opt/ffmpeg/bin:${process.env.PATH}`;
process.env.LD_LIBRARY_PATH = '/opt/ffmpeg/lib';

(async () => {
  await initMongoose();

  sywac
    .showHelpByDefault();

  for(let entry of glob(`${__dirname}/commands/*.js`)) {
    require(entry);
  }

  await sywac.parseAndExit();
})().catch(e => {
  console.error(e.toString());
  process.exit(1);
}).finally(() => {
  mongoose.disconnect();
});
