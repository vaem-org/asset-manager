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

import { Router } from 'express';
import { api } from '#~/lib/express-helpers';

const router = new Router({
  mergeParams: true
});

router.get('/', api(async ({ model }) => {
  return {
    paths: Object.fromEntries(
      [
        ...Object.entries(model.schema.paths)
        .map(([key, { path, instance, enumValues, options: { ref, ui } }]) => [
          key,
          {
            path,
            enumValues,
            ref,
            instance: ui?.type ?? instance,
            label: ui?.label
          }
        ]),
        ...Object.entries(model.schema.virtuals)
        .filter(([key]) => key !== 'id')
        .map(([key, { path, options }]) => [
          key,
          {
            path,
            instance: 'virtual',
            virtual: true,
            ...options,
          }
        ])
      ]
    )
  };
}))

export default router;
