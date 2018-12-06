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
  <v-container fluid @drop.stop.prevent="upload" @dragover.prevent="dragover">
    <items :actions="actions" ref="items" :headers="headers" uri="items" sort-by="name" :loading="loading">
      <template slot="items" slot-scope="{props}">
        <td>{{ props.item.name }}</td>
        <td>{{ props.item.createdAt | dateFormat }}</td>
        <td>{{ props.item.size | bytes }}</td>
        <td>{{ props.item.type }}</td>
        <td>
          <v-progress-circular v-if="props.item.state==='uploading'" indeterminate size="30"/>
          {{ props.item.state!=='uploading' ? props.item.state : '' }}
        </td>
        <td>
          <v-progress-linear :value="props.item.uploaded / props.item.size * 100"
                             :color="props.item.state==='complete' ? 'success' : 'primary'"/>
        </td>
      </template>
    </items>
    <v-dialog v-model="streamsDialog" max-width="800px">
      <v-card>
        <v-card-title>
          <span>Streams for <em>{{streams.title }}</em></span>
        </v-card-title>
        <v-card-text>
          <v-data-table :headers="['Index', 'Use as', 'Type', 'Codec', 'Channel'].map(text => ({text, sortable:false}))"
                        :items="streams.streams.streams"
                        hide-actions
                        v-model="selectedStreams"
                        item-key="index"
          >
            <template slot="items" slot-scope="props">
              <tr>
                <td>{{ props.item.index }}</td>
                <td>
                  <v-select v-if="props.item.codec_type === 'audio'" :items="getAudioOptions(props.item)" flat
                            :value="getChannel(props.item)" @change="setChannel($event, props.item)"/>
                </td>
                <td>{{ props.item.codec_type }}</td>
                <td>{{ props.item.codec_long_name }}</td>
                <td>{{ props.item.channel_layout }}</td>
              </tr>
            </template>
          </v-data-table>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="streamsDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="selectAudioStreams">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="assignToAssetDialog" max-width="500px">
      <v-card>
        <v-card-title>
          <span>Assign <strong>{{ assignToAssetFile.name | basename }}</strong> to asset.</span>
        </v-card-title>
        <v-form @submit.prevent="assignToAsset">
          <v-card-text>
            <v-autocomplete
                label="Asset"
                v-model="assignToAssetAsset"
                :items="assignToAssetAssets"
                ref="assignToAssetAsset"
                item-text="title"
                item-value="_id"
            />
            <v-select
                label="Language"
                v-model="assignToAssetLanguage"
                :items="languages"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer/>
            <v-btn @click="assignToAssetDialog = false">Cancel</v-btn>
            <v-btn type="submit" color="primary" :loading="assignToAssetLoading">OK</v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
    <v-dialog v-model="advancedAddToQueueDialog" max-width="500px">
      <v-card>
        <v-card-title>
          <span>Advanced add to queue</span>
        </v-card-title>
        <v-form @submit.prevent="advancedAddToQueue">
          <v-card-text>
            <v-text-field v-model="advancedAddToQueueSkip" label="Skip"/>
            <v-text-field v-model="advancedAddToQueueVideoFilter" label="Video filter"/>
            <v-text-field v-model="advancedAddToQueueAudio" label="Separate audio"/>
          </v-card-text>
          <v-card-actions>
            <v-spacer/>
            <v-btn color="primary" type="submit">OK</v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
    <v-snackbar v-model="snackbar" :timeout="4000" color="success">
      {{ snackbarText }}
    </v-snackbar>
  </v-container>
</template>
<script>
  import {
    map as _map,
    every as _every,
    get as _get,
    pick as _pick,
    keyBy as _keyBy,
    findIndex as _findIndex,
    filter as _filter
  } from 'lodash';
  import io from 'socket.io-client';
  import bytes from 'bytes';
  import {basename} from 'path';

  import api from '@/util/api';
  import Items from './ui/items';
  import moment from 'moment';
  import alert from '@/util/alert';
  import {languages} from '@/defaults';

  const channels = {
    'stereo': ['Stereo left', 'Stereo right'],
    'surround': ['Front left', 'Front right', 'Center', 'LFE', 'Surround left', 'Surround right']
  };

  export default {
    name: 'Uploads',
    components: {Items},
    filters: {
      dateFormat: value => moment(value).format('LLL'),
      bytes,
      basename
    },
    data() {
      return {
        actions: [
          {
            text: 'Upload',
            file: true,
            multiple: true,
            action: this.upload,
            enabled: () => true
          },
          {
            text: 'Download',
            action: this.download
          },
          {
            text: 'Add to queue',
            action: this.addToQueue,
            enabled: this.allOf('video')
          },
          {
            text: 'Add to queue (advanced)',
            action: this.advancedAddToQueue,
            enabled: this.oneOf('video'),
            contextOnly: true
          },
          {
            text: 'Assign to asset',
            action: async () => {
              this.assignToAssetAsset = null;
              this.assignToAssetAssets = await api.get('assets');
              this.assignToAssetFile = this.$refs.items.selected[0];
              this.assignToAssetDialog = true;
            },
            enabled: this.oneOf('subtitle')
          },
          {
            text: 'Select audio streams',
            action: this.showStreams,
            enabled: this.oneOf('video')
          },
          {
            text: 'Archive',
            action: this.archive,
            multiple: true
          },
          {
            text: 'Remove',
            action: this.remove,
            multiple: true,
            contextOnly: true
          }
        ],
        headers: [
          {
            text: 'Name',
            value: 'name'
          },
          {
            text: 'Created at',
            value: 'createdAt'
          },
          {
            text: 'Size',
            value: 'size'
          },
          {
            text: 'Type',
            value: 'type'
          },
          {
            text: 'State',
            value: 'state'
          },
          {
            text: 'Uploaded',
            value: 'uploaded'
          }
        ],

        socket: null,
        streamsDialog: false,
        streams: {
          streams: {}
        },
        selectedStreams: [],
        snackbar: false,
        snackbarText: '',
        assignToAssetDialog: false,
        assignToAssetFile: {},
        assignToAssetAssets: [],
        assignToAssetAsset: null,
        assignToAssetLoading: false,
        assignToAssetLanguage: 'nl',
        loading: false,
        advancedAddToQueueDialog: false,
        advancedAddToQueueAudio: '',
        advancedAddToQueueVideoFilter: '',
        advancedAddToQueueSkip: '',
        languages
      }
    },

    methods: {
      async upload(event) {
        const files = _get(event, 'dataTransfer.files', _get(event, 'target.files', []));

        const items = _keyBy(await api.post('prepare', _map(files,
          file => _pick(file, ['size', 'name'])
        )), 'name');

        for (let file of files) {
          await api.uploadFile('.', file, items[file.name].uploaded);
        }
      },

      download() {
        location.href = `items/${this.$refs.items.selected[0]._id}/download`;
      },

      async remove() {
        if (!(await alert({text: 'Are you sure you want to remove these files?', showCancelButton: true}))) {
          return;
        }

        this.loading = true;

        await api.post('remove', _map(this.$refs.items.selected, '_id'));
        this.loading = false;

        await this.$refs.items.refresh();
      },

      async archive() {
        await api.post('archive', _map(this.$refs.items.selected, '_id'));
        await this.$refs.items.refresh();
      },

      async addToQueue() {
        for (let upload of this.$refs.items.selected) {
          await api.post('/encoders/start-job', {fileId: upload._id});
        }
        this.snackbarText = 'Jobs successfully added';
        this.snackbar = true;
      },

      dragover(event) {
        event.dataTransfer.dropEffect = 'copy';
      },

      async showStreams() {
        const item = this.$refs.items.selected[0];
        this.streams = {
          title: item.name,
          streams: await api.get(`items/${item._id}/streams`)
        };
        this.streamsDialog = true;
      },

      async assignToAsset() {
        if (!this.assignToAssetAsset) {
          return;
        }

        this.assignToAssetLoading = true;
        try {
          await api.post(`items/${this.$refs.items.selected[0]._id}/assign-to/${this.assignToAssetLanguage}/${this.assignToAssetAsset}`);
          this.assignToAssetLoading = false;
          this.assignToAssetDialog = false;
        }
        catch (e) {
          console.error(e);
          this.assignToAssetLoading = false;
        }
      },

      async selectAudioStreams() {
        await api.post(
          `items/${this.$refs.items.selected[0]._id}/audio-streams`,
          this.streams.streams.audioStreams
        );

        this.streamsDialog = false;
      },

      allOf(type) {
        return () => this.$refs.items &&
          this.$refs.items.selected.length > 0 &&
          _every(this.$refs.items.selected, item => item.type === type);
      },

      oneOf(type) {
        return () =>
          _get(this, '$refs.items.selected.length', 0) === 1 &&
          this.$refs.items.selected[0].type === type;
      },

      async advancedAddToQueue() {
        if (!this.advancedAddToQueueDialog) {
          this.advancedAddToQueueDialog = true;
        }
        else {
          this.advancedAddToQueueDialog = false;

          await api.post('/encoders/start-job', {
            fileId: this.$refs.items.selected[0]._id,
            audio: this.advancedAddToQueueAudio,
            vf: this.advancedAddToQueueVideoFilter,
            ss: this.advancedAddToQueueSkip
          });
          this.snackbarText = 'Jobs successfully added';
          this.snackbar = true;
        }
      },

      getAudioOptions(item) {
        switch (item.channels) {
          case 1:
            return [...channels.stereo, ...channels.surround];
          case 2:
            return ['Stereo'];
          case 6:
            return ['Surround'];

          default:
            return [];
        }
      },

      getChannel(item) {
        switch (item.channels) {
          case 1:
            let result = null;
            _.each(channels, (channelNames, key) => {
              const channelIndex = _.get(this.streams, ['streams', 'audioStreams', key], []).indexOf(item.index);
              if (channelIndex !== -1) {
                result = channelNames[channelIndex];
              }
            });

            return result;

          case 2:
            return _.get(this.streams, 'streams.audioStreams.stereo[0]') === item.index ? 'Stereo' : '';

          case 6:
            return _.get(this.streams, 'streams.audioStreams.surround[0]') === item.index ? 'Surround' : '';
        }

        return null;
      },

      setChannel(selected, item) {
        switch (item.channels) {
          case 1:
            _.each(channels, (channelNames, key) => {
              const channelIndex = channelNames.indexOf(selected);
              _.set(this.streams, ['streams', 'audioStreams', key, channelIndex], item.index);
            });
            return;

          case 2:
            _.set(this.streams, 'streams.audioStreams.stereo', [item.index]);
            return;

          case 6:
            _.set(this.streams, 'streams.audioStreams.surround', [item.index]);
            return;
        }
      }
    },

    mounted() {
      this.socket = io('/uploads');

      this.socket.on('progress', data => {
        const index = _findIndex(this.$refs.items.items, {_id: data._id});
        if (index !== -1) {
          this.$set(this.$refs.items.items, index, data);
        }
      });
      this.socket.on('created', () => this.$refs.items.refresh());
      this.socket.on('created', () => this.$refs.items.refresh());
    },

    destroyed() {
      this.socket.close();
      this.socket = null;
    }
  };
</script>
