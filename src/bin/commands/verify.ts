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

import { Asset } from '#~/model/Asset/index.js'
import type { Command } from 'commander'

async function action(assetId: string) {
  const asset = await Asset.findById(assetId)
  if (!asset) {
    throw new Error('Unable to find asset')
  }

  const previousState = asset.state
  console.log(
    await asset.verify()
      ? 'Asset verified successfully'
      : 'Asset not verified',
  )

  if (previousState !== asset.state && asset.state === 'verified') {
    await asset.createMasterPlaylist()
  }
}

export default (program: Command) =>
  program
    .command('verify <assetId>')
    .action(action)
