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
  <v-container fluid>
    <v-navigation-drawer right fixed clipped app v-model="filtersVisible">
      <div class="px-3 py-3">
        <h2>Filters</h2>
        <v-autocomplete :items="filterLabels" label="Label" clearable v-model="filtersForm.labels"/>
      </div>
    </v-navigation-drawer>

    <items ref="items" :headers="headers" uri="items" :actions="actions" sort-by="createdAt" :descending="true"
           :loading="loading" :filters="filtersForm">
      <template slot="items" slot-scope="{props}">
        <td>{{ props.item.title }}</td>
        <td>
          <v-chip v-for="label in props.item.labels" :key="label">{{ label }}</v-chip>
        </td>
        <td>{{ props.item.state }}</td>
        <td>{{ props.item.bitrates.length }}/{{ props.item.jobs.length }}</td>
        <td class="no-wrap">{{ props.item.createdAt | dateFormat }}</td>
        <td>{{ props | get('item.videoParameters.duration') | durationFormat }}</td>
        <td>{{ props.item.subtitles ? 'Yes' : 'No'}}</td>
      </template>
      <template slot="filters">
        <v-tooltip bottom>
          <v-btn
              slot="activator"
              flat
              icon
              :color="filtersVisible ? 'primary' : 'secondary'"
              @click="filtersVisible=!filtersVisible"
              class="mr-0"
          >
            <v-icon>filter_list</v-icon>
          </v-btn>
          <span>{{ filtersVisible ? 'Hide' : 'Show'}} filters</span>
        </v-tooltip>
      </template>
    </items>
    <v-dialog v-model="editDialog" max-width="600px">
      <v-card>
        <v-form @submit.prevent="saveItem">
          <v-card-title>
            <span>Edit asset</span>
          </v-card-title>
          <v-card-text>
            <v-text-field label="Title" v-model="editItem.title"/>
            <v-combobox label="Labels" v-model="editItem.labels" multiple chips deletable-chips :items="labels"/>
          </v-card-text>
          <v-card-actions>
            <v-spacer/>
            <v-btn @click="editDialog=false">Cancel</v-btn>
            <v-btn type="submit" color="primary">Save</v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
    <v-dialog v-model="shareDialog" max-width="500px">
      <v-card>
        <v-card-title>
          <span>Share <em>{{ editItem.title }}</em></span>
        </v-card-title>
        <v-form @submit.prevent="shareItem" v-if="!shareUrl">
          <v-card-text>
            <v-text-field label="Choose a password" v-model="share.password" ref="sharePassword"/>
            <v-text-field label="Number of weeks valid" v-model="share.weeksValid" type="number"/>
          </v-card-text>
          <v-card-actions>
            <v-spacer/>
            <v-btn @click="shareDialog=false">Cancel</v-btn>
            <v-btn type="submit" color="primary">Get url</v-btn>
          </v-card-actions>
        </v-form>
        <div v-if="shareUrl">
          <v-card-text>
            <v-layout row justify-center align-content-center>
              <pre class="ellipsis">{{ shareUrl }}</pre>
              <v-flex>
                <v-btn small round icon @click="copyShareUrl">
                  <v-icon>content_copy</v-icon>
                </v-btn>
              </v-flex>
            </v-layout>
          </v-card-text>
          <v-card-actions>
            <v-spacer/>
            <v-btn color="primary" @click="shareDialog = false">Close</v-btn>
          </v-card-actions>
        </div>
      </v-card>
    </v-dialog>
    <v-dialog v-model="infoDialog" max-width="80%">
      <v-card>
        <v-card-text>
          <tree-view :data="contextItem"/>
        </v-card-text>
      </v-card>
    </v-dialog>
    <player :item="playerItem" v-model="player"/>
    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="6000">
      {{ snackbarText }}
    </v-snackbar>
  </v-container>
</template>
<script>
  import api from '@/util/api';
  import _ from 'lodash';
  import setClipboard from '@/util/set-clipboard';
  import alert from '@/util/alert';

  import Items from './ui/items';
  import Player from './player';
  import {languages} from '@/defaults';

  export default {
    name: 'Assets',
    components: {Player, Items},
    computed: {
      filterLabels() {
        return this.labels.map(label => ({text: label, value: label}))
          .concat([{text: 'No label', value: []}])
      }
    },
    data() {
      const atMostOneAndProcessed = () =>
        _.get(this, '$refs.items.selected.length') === 1 &&
        _.get(this, '$refs.items.selected[0].state') === 'processed';

      return {
        actions: [
          {text: 'Show info', action: this.showInfo, contextOnly: true},
          {
            text: 'Preview',
            action: this.preview,
            enabled: atMostOneAndProcessed
          },
          {text: 'Edit', action: this.edit},
          {
            text: 'Share',
            action: this.shareItem,
            enabled: atMostOneAndProcessed
          },
          {text: 'Queue missing bitrates', action: this.addMissingBitrates, contextOnly: true},
          ...languages.map(language => ({
            text: `Upload subtitles (${language})`,
            action: this.uploadSubtitles(language),
            file: true,
            contextOnly: true,
            enabled: atMostOneAndProcessed
          })),
          ...languages.map(language => ({
            text: `Download subtitles (${language})`,
            action: this.downloadSubtitles(language),
            contextOnly: true,
            enabled: () =>
              _.get(this, `$refs.items.selected[0].subtitles.${language}`)
          })),
          ...(process.env.PUBLIC_STREAMS ? [{
            text: 'Copy URL', action: this.copyUrl, contextOnly: true
          }] : []),
          {text: 'Copy id', action: this.copyId, contextOnly: true},
          {text: 'Remove', action: this.remove, contextOnly: true, multiple: true}
        ],
        headers: [
          {text: 'Title', value: 'title'},
          {text: 'Labels', value: 'labels'},
          {text: 'State', value: 'state'},
          {text: 'Completed', value: '', sortable: false},
          {text: 'Date', value: 'createdAt'},
          {text: 'Duration', value: 'videoParameters.duration'},
          {text: 'Subtitles', value: 'subtitles'}
        ],
        playerItem: {},
        player: false,
        editDialog: false,
        editItem: {},
        searchDistributor: '',
        labels: [],
        shareDialog: false,
        share: {
          weeksValid: 2
        },
        shareUrl: false,
        selectedDistributor: null,

        contextItem: null,

        infoDialog: false,
        snackbar: false,
        snackbarColor: 'success',
        snackbarText: '',
        loading: false,
        filtersVisible: false,
        filtersForm: {labels: null}
      }
    },

    methods: {
      async refresh() {
        this.$refs.items.refresh();
      },

      preview() {
        this.playerItem = this.$refs.items.selected[0];
        this.player = true;
      },

      async edit() {
        this.labels = await api.get('labels');
        this.editItem = _.clone(this.$refs.items.selected[0]);
        this.editDialog = true;
      },

      async saveItem() {
        await api.post(`items/${this.editItem._id}`, this.editItem);
        this.editDialog = false;
        this.refresh();
      },

      async shareItem() {
        if (this.shareDialog) {
          this.shareUrl = await api.post(`items/${this.editItem._id}/share-url`, this.share);
        }
        else {
          this.editItem = _.clone(this.$refs.items.selected[0]);
          this.share = {
            weeksValid: 2
          };
          this.shareUrl = false;
          this.shareDialog = true;
          this.$nextTick(() => this.$refs.sharePassword.focus());
        }
      },
      copyShareUrl() {
        setClipboard(this.shareUrl);
      },

      showInfo() {
        this.contextItem = this.$refs.items.selected[0];
        this.infoDialog = true;
      },

      copyId() {
        setClipboard(this.$refs.items.selected[0]._id);
      },

      copyUrl() {
        setClipboard(
          `${location.origin}/player/streams/-/-/${this.$refs.items.selected[0]._id}.m3u8`
        );
      },

      uploadSubtitles(language) {
        return async e => {
          this.loading = true;
          await api.uploadFile(`items/${this.$refs.items.selected[0]._id}/subtitles/${language}`, e.target.files[0]);
          await this.refresh();
          this.loading = false;
          this.snackbarText = 'Subtitles added successfully';
          this.snackbar = true;
        };
      },

      downloadSubtitles(language) {
        return () => window.location.href = `items/${this.$refs.items.selected[0]._id}/subtitles/${language}`;
      },

      async remove() {
        if (!await alert({text: 'Are you sure you want to remove these assets?', showCancelButton: true})) {
          return;
        }

        await api.post('remove', _.map(this.$refs.items.selected, '_id'));
        setTimeout(() => this.$refs.items.refresh(), 250);
      },

      async addMissingBitrates() {
        await api.post('/encoders/start-job', {assetId: this.$refs.items.selected[0]._id});
      }
    },

    async mounted() {
      this.labels = await api.get('labels');
    }
  };
</script>
