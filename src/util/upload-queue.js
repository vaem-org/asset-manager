import { EventEmitter } from 'events';
import { createReadStream, unlink } from 'fs';
import { dirname } from 'path';
import config from '@/config';

const queue = [];

export const events = new EventEmitter();

let processing = false;

const ensured = new Set();

const ensureDir = async dirname => {
  if (ensured.has(dirname)) {
    return;
  }

  await config.destinationFileSystem.ensureDir(dirname);
  ensured.add(dirname);
};

async function next() {
  if (queue.length === 0) {
    processing = false;
    return;
  }
  processing = true;

  const filename = queue.shift();
  await ensureDir(dirname(filename));
  const { stream } = await config.destinationFileSystem.write(filename);

  console.log(`Uploading ${filename}`);
  const tempFilename = `${config.root}/var/tmp${filename}`;

  await (new Promise((accept, reject) => {
    stream
      .on('done', accept)
      .on('error', reject)
    ;

    createReadStream(tempFilename)
      .on('error', reject)
      .pipe(stream);
  }));

  unlink(tempFilename, err => {
    if (err) {
      console.warn(`Unable to remove ${tempFilename}`);
    }
  });

  events.emit(filename);
  return next();
}

export function addToQueue(filename) {
  queue.push(filename);

  if (!processing) {
    next()
      .catch(e => {
        console.error(`Error uploading file: ${e.toString()}`);
      })
    ;
  }
}

export async function waitFor(filename) {
  try {
    await config.destinationFileSystem.get(filename);
    return;
  }
  catch (e) {
  }

  return new Promise(accept => {
    events.once(filename, accept);
  });
}