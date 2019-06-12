/*
 * VAEM - Asset manager
 * Copyright (C) 2018  Wouter van de Molengraft
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import fs from 'fs-extra';
import childProcess from 'child_process';
import captions from 'node-captions';
import util from 'util';

import segmentVtt from './segment-vtt';
import {Asset} from '../model/asset';
import {s3} from '../util/s3';

import config from '../../../config/config';
import {bunnycdnStorage} from './bunnycdn';

const outputDir = `${config.root}/var/subtitles`;

const run = (cmd, args) => new Promise((accept, reject) => {
  childProcess.spawn(cmd, args, {stdio: 'inherit'}).on('close', code => {
    if (code === 0) {
      accept();
    }
    else {
      reject(`Command "${cmd} ${args.map(value => `"${value}"`).join(' ')}" failed.`);
    }
  });
});

const srtParse = util.promisify(captions.srt.parse).bind(captions.srt);

const convertSubrip = async (source, destination) => {
  const data = await srtParse(
    (await fs.readFile(source, 'utf-8')).toString());

  await fs.writeFile(destination, captions.vtt.generate(captions.srt.toJSON(data)));
};

/**
 * Convert a subtitle file
 * @param {String} base the base url of the asset manager for segmenting webvtt
 * @param {String} assetId
 * @param {String} sourceFile
 * @param {String} lang
 */
const convert = async (base, assetId, sourceFile, lang) => {
  const vtt = sourceFile.replace(/\.[^.]+$/, '.vtt');
  const ext = sourceFile.replace(/^.*\.([^.]+)$/, '$1');
  const destination = `${outputDir}/${assetId}.${lang}.vtt`;
  const srt = sourceFile.replace(/\.[^.]+$/, '.srt');

  if (ext === 'stl') {
    // convert to srt using python
    await run('python', [
      `${config.root}/lib/stl2srt/to_srt.py`,
      sourceFile,
      srt
    ]);
  }
  else if (ext !== 'vtt' && ext !== 'srt') {
    // use subtitle-edit to convert to srt
    await run('xvfb-run', [
      '-a',
      'mono',
      `${config.root}/lib/se355/SubtitleEdit.exe`,
      '/convert', sourceFile, 'subrip',
      '/encoding:utf-8'
    ]);
  }

  await fs.ensureDir(outputDir);

  if (ext !== 'vtt') {
    // convert srt to vtt
    console.log('Converting from subrip to webvtt');
    await convertSubrip(srt, destination);
    await fs.unlink(srt);
  }
  else {
    await fs.copy(vtt, destination, {
      overwrite: true
    });
  }

  const data = await fs.readFile(destination);
  await fs.writeFile(destination, data.toString().replace(/{\\.*?}/g, ''));

  if (config.s3) {
    // upload vtt to s3
    s3.putObject({
      Bucket: config.s3.bucket,
      Key: `${assetId}/subtitles/${lang}.vtt`,
      Body: fs.createReadStream(destination)
    }, err => {
      console.error('Unable to upload vtt to S3', err);
    });
  } else if (bunnycdnStorage) {
    bunnycdnStorage.put(`${assetId}/subtitles/${lang}.vtt`, fs.createReadStream(destination))
      .catch(e => {
        console.error('Unable to upload vtt to BunnyCDN', e);
      })
  }

  const item = await Asset.findById(assetId);
  item.subtitles = Object.assign(item.subtitles || {}, {[lang]: true});
  await item.save();

  await segmentVtt(base, assetId, lang);
  console.log('Segmenting VTT successful');
};

export {convert};
