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

import { Bar } from 'cli-progress';
import { config } from '#~/config';

export async function run({ assetId }) {
  const entries = await config.storage.list(`${assetId}/subtitles/`);
  const bar = new Bar();

  bar.start(entries.length);
  let i =0;
  for(let { name } of entries) {
    await config.cdn.purge(`/${assetId}/subtitles/${name}`);
    bar.update(++i);
  }
  bar.stop();
}

export const flags = 'purge-subtitle-cache <assetId>'
