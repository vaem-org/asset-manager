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
    <v-dialog v-model="dialog" max-width="600px" v-if="useDialog">
      <v-card>
        <v-responsive>
          <div class="player-container">
            <video controls class="video-js vjs-default-skin" preload="none" ref="video" autoplay>
            </video>
          </div>
        </v-responsive>
      </v-card>
    </v-dialog>
    <div :class="playerClass" v-if="!useDialog">
      <video controls class="video-js vjs-default-skin" preload="none" ref="videoFullscreen" autoplay>
      </video>
    </div>
  </div>
</template>
<script>
  import videojs from 'video.js';
  import 'video.js/dist/video-js.css';

  import api from '@/util/api';

  export default {
    name: 'Player',
    props: {
      value: Boolean,
      item: Object,
      useDialog: {type: Boolean, default: true},
      assetId: String,
      fullscreen: {type: Boolean, default: false}
    },
    computed: {
      playerClass() {
        return this.fullscreen ? 'player-fullscreen' : 'player-container'
      }
    },
    data: () => ({
      dialog: false,
      player: null
    }),
    watch: {
      value(val) {
        this.dialog = val;
      },
      async dialog(val) {
        this.$emit('input', val);
        if (!val) {
          this.player.reset();
        }
        else {
          if (this.item) {
            this.load();
          }
        }
      },
      assetId() {
        if (this.player) {
          this.load();
        }
      }
    },

    methods:
      {
        async load() {
          // remove any text tracks
          for (let track of Array.from(this.player.remoteTextTracks())) {
            this.player.removeRemoteTextTrack(track);
          }

          const item = this.assetId ? await api.get(`/player/${this.assetId}/item`) : null;

          this.player.src({
            type: 'application/x-mpegURL',
            src: item ? item.streamUrl : await api.get(`/assets/items/${this.item._id}/stream-url`)
          });

          const subtitles = (item || this.item || {}).subtitles;
          if (subtitles) {
            const first = Object.keys(subtitles)[0];
            this.player.addRemoteTextTrack({
              kind: 'subtitles',
              srclang: first,
              label: 'Dutch',
              src: `/player/subtitles/${this.assetId || this.item._id}.${first}.vtt`,
              default: true
            });
          }
        }
      },
    mounted() {
      this.player = videojs(this.$refs[this.useDialog ? 'video' : 'videoFullscreen'], null, () => {
        if (this.assetId) {
          this.load();
        }
      });
    }
  }
</script>
<style scoped lang="scss">
  .player-container, .player-fullscreen {
    width: 100%;
    padding-top: 9/16*100%;
    position: relative;

    video, .video-js {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      background: black;
    }
  }

  .player-fullscreen {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }
</style>
