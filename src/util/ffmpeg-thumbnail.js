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

import childProcess from 'child_process';

const createThumbnail = (source, destination, time) => new Promise((accept, reject) => {
  childProcess.spawn('ffmpeg', [
    '-y',
    '-ss', time,
    '-i', source,
    '-c:v', 'png',
    '-frames:v', 1,
    '-v', 'error',
    destination
  ], {
    stdio: 'inherit',
    env: {
      LD_LIBRARY_PATH: '/opt/ffmpeg/lib'
    }
  })
  .on('close', code => {
    if (code !== 0) {
      return reject(new Error('ffmpeg thumbnail process failed'));
    }

    accept();
  });
});

export { createThumbnail };
