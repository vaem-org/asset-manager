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

import 'whatwg-fetch';

import Vue from 'vue';
import Vuetify from 'vuetify';

import 'vuetify/dist/vuetify.min.css';
import moment from 'moment';
import {get as _get} from 'lodash';

Vue.use(Vuetify);

import VueRouter from 'vue-router';

Vue.use(VueRouter);

import TreeView from 'vue-json-tree-view';

Vue.use(TreeView);

import App from './app.vue';

import Assets from './components/assets';
import Encoders from './components/encoders';
import Uploads from './components/uploads';
import Login from './components/login';

const routes = [
  {
    path: '/assets/',
    component: Assets,
    meta: {
      title: 'Assets'
    }
  },
  {
    path: '/encoders/',
    component: Encoders,
    meta: {
      title: 'Encoders'
    }
  },
  {
    path: '/uploads/',
    component: Uploads,
    meta: {
      title: 'Uploads'
    }
  },
  {
    path: '/login/',
    component: Login,
    meta: {
      title: 'Login',
      showToolbar: false
    },
    props: {
      showUsername: true
    },
  }
];

Vue.filter('durationFormat', value => {
  if (isNaN(value)) {
    return '';
  }
  let minutes = Math.floor(parseInt(value) / 60);
  const hours = Math.floor(minutes / 60);
  minutes = minutes % 60;
  if (isNaN(minutes) || isNaN(hours)) {
    return '';
  }
  return `${hours}:${minutes < 10 ? '0' : ''}${minutes}`;
});
Vue.filter('dateFormat', value => moment(value).format('LLL'));
Vue.filter('get', _get);

(async () => {
  // add missing routes
  const router = new VueRouter({
    mode: 'history',
    routes
  });

  new Vue({
    template: '<App/>',
    components: {App},
    router
  }).$mount('#app');
})().catch(e => console.error(e));

