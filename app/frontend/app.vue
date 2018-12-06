<!--
  - VAEM - Asset manager
  - Copyright (C) 2018  Wouter van de Molengraft
  -
  - This program is free software: you can redistribute it and/or modify
  - it under the terms of the GNU General Public License as published by
  - the Free Software Foundation, either version 3 of the License, or
  - (at your option) any later version.
  -
  - This program is distributed in the hope that it will be useful,
  - but WITHOUT ANY WARRANTY; without even the implied warranty of
  - MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  - GNU General Public License for more details.
  -
  - You should have received a copy of the GNU General Public License
  - along with this program.  If not, see <https://www.gnu.org/licenses/>.
  -->

<template>
  <v-app id="inspire">
    <v-toolbar
        fixed
        app
        clipped-right
        v-if="showToolbar"
    >
      <v-toolbar-side-icon @click.stop="drawer = !drawer"/>
      <v-toolbar-title>{{ $route.meta.title }}</v-toolbar-title>
    </v-toolbar>
    <v-navigation-drawer
        fixed
        v-model="drawer"
        app
    >
      <v-list>
        <v-list-tile :to="{path: '/assets/'}">
          <v-list-tile-action>
            <v-icon>videocam</v-icon>
          </v-list-tile-action>
          <v-list-tile-content>
            Assets
          </v-list-tile-content>
        </v-list-tile>
        <v-list-tile :to="{path: '/uploads/'}">
          <v-list-tile-action>
            <v-icon>folder</v-icon>
          </v-list-tile-action>
          <v-list-tile-content>
            Uploads
          </v-list-tile-content>
        </v-list-tile>
      </v-list>
    </v-navigation-drawer>
    <v-content>
      <router-view/>
    </v-content>
    <v-footer app>
      <v-btn icon small :to="{path:'/encoders/'}"><v-icon small>storage</v-icon></v-btn>
      <span>Asset manager</span>
      <v-spacer/>
      <span>&copy; {{ year }}</span>
    </v-footer>
  </v-app>
</template>
<script>
  import moment from 'moment';
  import _ from 'lodash';

  export default {
    name: 'App',

    data: () => ({
      drawer: false,
      year: moment().format('YYYY')
    }),
    computed: {
      showToolbar() {
        return _.get(this, '$route.meta.showToolbar', true);
      }
    }
  }
</script>
