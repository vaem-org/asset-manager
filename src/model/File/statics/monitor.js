/*
 * VAEM - Asset manager
 * Copyright (C) 2021  Wouter van de Molengraft
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

import chokidar from 'chokidar';
import { relative } from 'path';

const log = e => {
  console.warn(`Unable to update file ${e.toString()}`);
};

export default ({ schema, root }) => {
  schema.statics.monitor = function() {
    chokidar.watch(`${root}/**`, {
      ignoreInitial: true
    })
    .on('add', ((path, stats) => {
      if (!stats) {
        return;
      }

      const name = relative(root, path);
      this.countDocuments({ name }).then(count => {
        if (count === 0) {
          return new this({
            name,
            size: stats.size
          }).save();
        }
      }).catch(log)
    }))
    .on('change', (path, stats) => {
      if (!stats) {
        return;
      }

      const name = relative(root, path);
      this.updateOne({
        name
      }, {
        $set: {
          size: stats.size
        }
      }).catch(log)
    })
    .on('unlink', path => {
      const name = relative(root, path);
      this.deleteOne({
        name
      }).catch(log);
    })
  }
}
