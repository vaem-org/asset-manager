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

Vue.use(Vuetify);

import VueRouter from 'vue-router';

Vue.use(VueRouter);

import Login from './components/login';
import Player from './components/player';

const routes = [
  {
    path: '/auth/',
    component: Login
  },
  {
    path: '/shared/player/:assetId',
    component: Player,
    props: route => ({
      useDialog: false,
      assetId: route.params.assetId,
      fullscreen: true
    })
  },
  {
    path: '/embed/:timestamp/:signature/:assetId',
    component: Player,
    props: route => ({
      useDialog: false,
      assetId: route.params.assetId,
      fullscreen: true
    })
  }
];

(async () => {
  // add missing routes
  const router = new VueRouter({
    mode: 'history',
    routes
  });

  new Vue({
    template: '<v-app><router-view/></v-app>',
    router
  }).$mount('#app');
})().catch(e => console.error(e));

