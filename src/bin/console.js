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

#!/usr/bin/env node
import sywac from 'sywac';
import glob from 'glob';
import { basename } from 'path';
import mongoose from 'mongoose';
import { config } from '#~/config';
import { initialisation } from '#~/lib/initialisation';

(async () => {
  await initialisation();

  for(let file of glob.sync(`${config.root}/src/bin/commands/*.js`)) {
    // eslint-disable-next-line node/no-unsupported-features/es-syntax
    const { run, flags } = await import(file);
    sywac.command(flags || basename(file, '.js'), run);
  }

  return sywac
    .showHelpByDefault()
    .parseAndExit()
})().catch(e => {
  console.error(e);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
}).finally(() => mongoose.disconnect());
