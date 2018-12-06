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
  <div>
    <v-menu
        v-model="contextMenu"
        :position-x="contextMenuX"
        :position-y="contextMenuY"
    >
      <v-list>
        <template v-for="action in actions">
          <v-list-tile @click="action.action" v-if="!action.file && getEnabled(action, true)">
            <v-list-tile-title>{{ action.text }}</v-list-tile-title>
          </v-list-tile>
          <v-list-tile v-else-if="getEnabled(action, true)">
            <v-list-tile-title class="file">
              {{ action.text }}
              <input type="file" @change="action.action" :multiple="action.multiple">
            </v-list-tile-title>
          </v-list-tile>
        </template>
      </v-list>
    </v-menu>
    <div class="elevation-1">
      <v-layout class="white" row wrap>
        <v-flex class="sm12 md3 px-1 order-md2">
          <v-layout row align-center>
            <v-flex>
              <v-text-field type="search" label="Search" prepend-icon="search" v-model="search" clearable/>
            </v-flex>
            <v-flex v-if="$slots.filters">
              <slot name="filters"/>
            </v-flex>
          </v-layout>
        </v-flex>
        <v-flex class="sm12 md9">
          <template v-for="action in actions" v-if="!action.contextOnly">
            <v-btn v-if="!action.file" class="mx-1" flat color="primary" :disabled="!getEnabled(action)"
                   @click="action.action">{{ action.text }}
            </v-btn>
            <v-btn v-else class="mx-1 file" flat color="primary" :disabled="!getEnabled(action)" tag="div">
              {{ action.text }}
              <input type="file" @change="action.action" :multiple="action.multiple">
            </v-btn>
          </template>
        </v-flex>
      </v-layout>
      <v-data-table
          :headers="[{value: '_id', sortable: false}, ...headers]"
          :items="items"
          :pagination.sync="pagination"
          :total-items="totalItems"
          :loading="loadingInternal"
          item-key="_id"
          select-all
          :selected="selected"
          v-model="selected"
          :rows-per-page-items="[10,20,50,100]"
          must-sort
          class="table"
      >
        <template slot="items" slot-scope="props">
          <tr @click="selectItem($event, props)">
            <th>
              <v-checkbox
                  primary
                  hide-details
                  v-model="props.selected"
              />
            </th>
            <th class="px-0">
              <v-btn icon @click="showContextMenu($event, props.item)" class="mx-0"><v-icon>more_vert</v-icon></v-btn>
            </th>
            <slot name="items" v-bind:props="props"/>
          </tr>
        </template>
      </v-data-table>
    </div>
  </div>
</template>
<script>
  import {debounce as _debounce, map as _map, isEqual as _isEqual, clone as _clone} from 'lodash';
  import api from '@/util/api';

  export default {
    name: 'Items',
    props: [
      'actions',
      'uri',
      'headers',
      'sortBy',
      'descending',
      'loading',
      'filters'
    ],
    data() {
      return {
        contextMenuX: 0,
        contextMenuY: 0,
        contextMenu: false,
        search: '',
        items: [],
        totalItems: 0,
        selected: [],
        pagination: {sortBy: this.sortBy, descending: this.descending},
        refreshing: false
      };
    },
    watch: {
      pagination: {
        handler() {
          this.refresh(false);
        },
        deep: true
      },
      filters: {
        handler() {
          this.refresh(false)
        },
        deep: true
      }
      ,

      search() {
        this.refresh(false);
      }
    },
    computed: {
      loadingInternal() {
        return this.refreshing || this.loading;
      }
    },
    methods: {
      showContextMenu(e, item) {
        if (this.selected.indexOf(item) === -1) {
          this.selected = [item];
        }
        this.contextMenuX = e.clientX;
        this.contextMenuY = e.clientY;
        this.$nextTick(() => this.contextMenu = true);
      },

      refresh: _debounce(async function (force = true) {
        if (this.refreshing) {
          return;
        }

        const params = {
          query: this.search,
          rowsPerPage: this.pagination.rowsPerPage,
          page: this.pagination.page,
          sortBy: this.pagination.sortBy,
          descending: this.pagination.descending,
          filters: _clone(this.filters)
        };

        if (!force && _isEqual(this.prevParams, params)) {
          return;
        }

        this.prevParams = params;

        this.refreshing = true;
        const result = await api.post('items', params);
        this.items = result.items;
        // filter out selected items that are not available anymore
        const current = _map(result.items, '_id');
        this.selected = this.selected.filter(item => current.indexOf(item._id) !== -1);
        this.totalItems = result.totalItems;
        this.refreshing = false;
      }, 250, {leading: true}),

      getEnabled(action, contextMenu) {
        if (action.enabled) {
          return action.enabled(this.selected, contextMenu);
        }

        return action.multiple ? (this.selected.length !== 0) : (this.selected.length === 1);
      },

      selectItem(event, {item}) {
        if (event.target.matches('th,th *')) {
          return;
        }

        this.selected = [item];
      }
    }
  }
</script>
<style lang="scss" scoped>
  @import "~compass-mixins";

  .file {
    overflow: hidden;

    [type=file] {
      opacity: 0;
      left: -140px;
      right: 0;
      top: 0;
      bottom: 0;
      width: calc(100% + 140px);
      position: absolute;
      cursor: pointer;
    }
  }

  .table {
    @include user-select(none);
  }
</style>
