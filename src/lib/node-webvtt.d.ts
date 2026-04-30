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

declare module 'node-webvtt/lib/hls.js' {
  interface Opts {
    meta?: boolean
    strict?: boolean
  }

  export interface Cue {
    identifier: string
    start: number
    end: number
    text: string
    styles: string
  }

  export interface VTT {
    valid: boolean
    strict: boolean
    cues: Cue[]
    errors: unknown[]
    meta?: Partial<Record<string, string>>
  }

  export interface Segment {
    filename: string
    content: string
    duration: number
    cues: ReadonlyArray<Cue>
  }

  export function parse(input: string, options?: Opts): VTT

  export function compile(input: VTT): string

  export function hlsSegment(
    input: string,
    segmentLength?: number,
    startOffset?: number,
  ): ReadonlyArray<Segment>

  export function hlsSegmentPlaylist(
    input: string,
    segmentLength?: number,
  ): ReadonlyArray<Segment>
}
