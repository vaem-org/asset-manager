/*
 * VAEM - Asset manager
 * Copyright (C) 2022  Wouter van de Molengraft
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

import { spawn } from 'child_process';
import { join, extname } from 'path';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { copyFile, unlink } from 'fs/promises';
import { config } from '#~/config';

/**
 * Convert a subtitle file
 * @param {String} source
 * @param {String} destination
 */
export async function convert(source, destination) {
  const extension = extname(source);
  const tempFile = join(tmpdir(), `${randomBytes(4).toString('hex')}${extension}`);
  await copyFile(source, tempFile);

  await new Promise((accept, reject) => {
    let stdout = [];
    let stderr = [];
    const child = spawn('xvfb-run', [
      '-a',
      'mono',
      `${config.root}/lib/subtitleedit-3.6.3/SubtitleEdit.exe`,
      '/convert', tempFile, 'webvtt',
      '/encoding:utf-8'
    ], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LD_LIBRARY_PATH: ''
      }
    }).on('close', code => {
      if (code === 0) {
        accept();
      } else {
        reject(new Error(Buffer.concat(stderr).toString() || Buffer.concat(stdout).toString()));
      }
    }).on('error', reject);

    child.stdout.on('data', data => stdout.push(data));
    child.stderr.on('data', data => stderr.push(data));
  })

  const vttTempfile = tempFile.replace(/\.[^.]+$/, '.vtt');
  await copyFile(vttTempfile, destination);
  await unlink(vttTempfile);
  await unlink(tempFile);
}
