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
  <v-layout row justify-center>
    <v-dialog v-model="dialog" max-width="290">
      <v-card>
        <v-card-title class="headline" v-if="title">{{ title }}</v-card-title>
        <v-card-text>{{ text }}</v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn color="primary" flat @click.native="cancel()" v-if="showCancelButton">Cancel</v-btn>
          <v-btn color="primary" flat @click.native="ok()">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-layout>
</template>
<script>
  export default {
    name: 'Alert',
    data: () => ({
      dialog: true
    }),
    watch: {
      dialog(val) {
        if (!val) {
          this.accept(false);
        }
      }
    },
    props: ['title', 'text', 'showCancelButton', 'accept'],
    methods: {
      ok() {
        this.dialog = false;
        this.accept(true);
      },
      cancel() {
        this.dialog = false;
        this.accept(false);
      }
    }
  };
</script>
