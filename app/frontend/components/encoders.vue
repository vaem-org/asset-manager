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
  <v-container>
    <div class="elevation-1">
      <div class="white">
        <v-badge right overlap :value="queue.length !== 0">
          <span slot="badge">{{ queue.length }}</span>
          <v-btn outline color="primary" @click="queueDialog = true">
            Queue
          </v-btn>
        </v-badge>
        <v-btn outline color="primary" @click="copyDockerCommand">Copy docker command</v-btn>
      </div>
      <v-data-table :headers="headers" hide-actions :items="items" :loading="loading">
        <template slot="items" slot-scope="props">
          <tr>
            <td>
              <v-progress-linear :value="calcProgress(props.item)"
                                 v-if="props.item.state.status!=='idle'"/>
            </td>
            <td>{{ calcEta(props.item) | durationFormat }}</td>
            <td>{{ props | get('item.currentlyProcessing.source', '') | basename }}</td>
            <td>{{ props | get('item.currentlyProcessing.bitrate') }}</td>
            <td>
              <v-edit-dialog
                  :return-value.sync="props.item.info.priority"
                  lazy
              >
                {{ props | get('item.info.priority') || 0 }}
                <v-text-field slot="input" label="Priority" v-model="props.item.info.priority"
                              @change="updatePriority(props.item)"/>
              </v-edit-dialog>
            </td>
            <td>{{ props | get('item.info.commit') }}</td>
            <td>
              <v-tooltip bottom>
                <span>{{ props | get('item.info.cpus[0].model')}}</span>
                <div slot="activator">{{ props | get('item.info.cpus.length') }}</div>
              </v-tooltip>
            </td>
            <td>{{ props | get('item.state.status') }}</td>
          </tr>
        </template>
      </v-data-table>
    </div>
    <v-dialog v-model="queueDialog">
      <v-card>
        <v-card-title class="headline">Queue</v-card-title>
        <v-card-text>
          <v-data-table :headers="queueHeaders" hide-actions :items="queue">
            <template slot="items" slot-scope="props">
              <td>
                {{ props.item.source | basename }}
              </td>
              <td>
                {{ props.item.options.maxrate || props.item.bitrate }}
              </td>
              <td>
                <v-btn flat icon @click="remove(props.index)">
                  <v-icon>delete</v-icon>
                </v-btn>
              </td>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>
<script>
  import io from 'socket.io-client';
  import {basename} from 'path';
  import {camelCase as _camelCase, values as _values, get as _get} from 'lodash';
  import {stringify} from 'querystring';

  import api from '@/util/api';
  import setClipboard from '@/util/set-clipboard';

  export default {
    name: 'Encoders',
    data: () => ({
      encoders: {},
      queue: [],
      socket: null,
      headers: ['Progress', 'ETA', 'Source', 'Bitrate', 'Priority', 'Commit hash', 'CPUs', 'Status'].map(text => ({
        text,
        sortable: false
      })),
      queueDialog: false,
      queueHeaders: ['Source', 'Bitrate', 'Actions'].map(text => ({text, sortable: false})),
      loading: false
    }),
    filters: {
      basename
    },
    computed: {
      items() {
        return _values(this.encoders)
      }
    },

    methods: {
      calcProgress(item) {
        let duration = parseFloat(_get(item, 'currentlyProcessing.parameters.duration', 0));
        if (duration === 0) {
          return 0;
        }

        return _get(item, 'progress.current') / duration * 100;
      },
      calcEta(item) {
        if (!item) {
          return 0;
        }

        const progress = this.calcProgress(item);

        return Math.max(0, ((item.progress.time - item.currentlyProcessing.time)) / progress * (100 - progress) / 1000 * 60);
      },

      async remove(index) {
        await api.delete(`jobs/${index}`);
      },

      async updatePriority(encoder) {
        await api.post(`encoders/${encoder.id}/priority`, {priority: encoder.info.priority});
      },

      async copyDockerCommand() {
        setClipboard(await api.get(`docker?${stringify({
          origin: location.origin
        })}`));
      }
    },

    async mounted() {
      this.loading = true;
      this.encoders = await api.get('items');
      this.queue = await api.get('queue');
      this.loading = false;

      const socket = io('/encoders');
      this.socket = socket;

      // socket.on('connect', () => {});

      ['info', 'currently-processing', 'state', 'progress'].forEach(event => {
        socket.on(event, data => {
          this.$set(this.encoders, data.id, Object.assign({}, this.encoders[data.id], {
            [_camelCase(event)]: data.data
          }));
        });
      });

      socket.on('new', data => {
        this.$set(this.encoders, data.id, data.data);
      });

      socket.on('removed', data => {
        this.$delete(this.encoders, data.id);
      });

      socket.on('source-done', data => {
        console.log(`Source done "${data.filename}"`);
      });

      socket.on('queue-update', async () => {
        this.queue = await api.get('queue');
      });
    },

    destroyed() {
      this.socket.close();
    }
  };
</script>
