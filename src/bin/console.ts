#!/usr/bin/env node

/*
 * VAEM - Asset manager
 * Copyright (C) 2026  Wouter van de Molengraft
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

import mongoose from 'mongoose'
import { Command } from 'commander'
import { initialisation } from '../lib/initialisation.js'
import createMasterplaylist from './commands/create-masterplaylist.js'
import createPlaylists from './commands/create-playlists.js'
import purgeSubtitleCache from './commands/purge-subtitle-cache.js'
import verify from './commands/verify.js'
import verifySubtitles from './commands/verify-subtitles.js'

await initialisation()
const program = new Command()

createMasterplaylist(program)
createPlaylists(program)
purgeSubtitleCache(program)
verify(program)
verifySubtitles(program)

await program.parseAsync()

await mongoose.disconnect()
