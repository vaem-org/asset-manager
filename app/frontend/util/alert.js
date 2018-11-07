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

import Vue from 'vue';
import Alert from '@/components/ui/alert';

let $root = null;

/**
 * Show an alert dialog. Returns true when the use clicks on the OK button
 * @param {String} text
 * @param {String} title
 * @param {Boolean} showCancelButton
 * @return {Promise<boolean>}
 */
const alert = ({text = '', title = '', showCancelButton = false}) => new Promise((accept) => {
  if (!$root) {
    const AlertConstructor = Vue.extend(Alert);
    const node = document.createElement('div');
    document.querySelector('body').appendChild(node);
    $root = (new AlertConstructor()).$mount(node);
  }

  Object.assign($root, {text, title, accept, showCancelButton, dialog: true});
});

export default alert;