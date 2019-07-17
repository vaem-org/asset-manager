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

export default function setClipboard(text) {
  const div = document.createElement('div');
  Object.assign(div.style, {
    opacity: 0,
    position: 'absolute',
    left: '-100%',
    top: 0
  });

  div.innerText = text;
  const body = document.getElementsByTagName('body')[0];
  body.appendChild(div);

  let range;
  if (document.selection) {
    range = document.body.createTextRange();
    range.moveToElementText(div);
    range.select();
  } else if (window.getSelection) {
    range = document.createRange();
    range.selectNode(div);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }

  document.execCommand('copy');
  setTimeout(function () {
    body.removeChild(div);
  }, 0);
}
