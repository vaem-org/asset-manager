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

import { config } from '#~/config.js'
import axios, { AxiosError } from 'axios'
import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import { writeFile } from 'fs/promises'

const { username, origin } = config.subtitleEditApiUrl ? new URL(config.subtitleEditApiUrl) : {}

const api = axios.create({
  baseURL: origin,
  headers: {
    authorization: `Bearer ${username}`,
  },
})

/**
 * Convert a subtitle file
 */
export async function convert(source: string, destination?: string): Promise<string> {
  let data

  try {
    ({ data } = await api.post(basename(source), createReadStream(source)))
  }
  catch (e) {
    const axiosError = e instanceof AxiosError ? e : undefined
    throw new Error(`Unable to convert subtitle: ${axiosError?.response?.data ?? e}`)
  }

  if (destination) {
    await writeFile(destination, data)
  }

  return data
}
