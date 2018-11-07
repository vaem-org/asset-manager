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
  <v-layout row class="align-baseline">
    <v-select v-model="selected"
              :items="distributors"
              label="Distributor"
              autocomplete
              item-text="name"
              item-value="_id"
              clearable
    />
    <v-menu offset-y>
      <v-btn class="mr-0" slot="activator" icon>
        <v-icon>more_vert</v-icon>
      </v-btn>
      <v-list>
        <v-list-tile @click="add">
          <v-list-tile-title>Add</v-list-tile-title>
        </v-list-tile>
        <v-list-tile @click="rename" :disabled="!selected">
          <v-list-tile-title>Rename</v-list-tile-title>
        </v-list-tile>
        <v-list-tile @click="remove" :disabled="!selected">
          <v-list-tile-title>Remove</v-list-tile-title>
        </v-list-tile>
      </v-list>
    </v-menu>

    <v-dialog v-model="dialog" max-width="400px">
      <v-card>
        <v-card-title>
          <span>{{ dialogTitle }}</span>
        </v-card-title>
        <v-form @submit.prevent="dialogAction">
          <v-card-text>
            <v-text-field label="Name" v-model="newDistributorName" ref="input"/>
          </v-card-text>
          <v-card-actions>
            <v-spacer/>
            <v-btn @click="dialog=false">Cancel</v-btn>
            <v-btn type="submit" color="primary">OK</v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
  </v-layout>
</template>
<script>
  import api from '@/util/api';

  export default {
    name: 'DistributorSelector',

    props: {'value': String, 'uri': {type: String, default: '/distributors'}},

    data() {
      return {
        distributors: [],
        dialog: false,
        newDistributorName: '',
        selected: '',
        dialogAction: this.add,
        dialogTitle: 'Add distributor'
      }
    },
    watch: {
      selected(value) {
        this.$emit('input', value);
      },

      value(value) {
        this.selected = value;
      }
    },
    methods: {
      async refresh() {
        this.distributors = await api.get(this.uri)
      },

      async add() {
        if (this.dialog) {
          const result = await api.post(this.uri, {name: this.newDistributorName});
          await this.refresh();
          this.selected = result._id;
          this.dialog = false;
        }
        else {
          this.dialogAction = this.add;
          this.dialogTitle = 'Add distributor';
          this.dialog = true;
          this.$nextTick(() => this.$refs.input.focus());
        }
      },

      async remove() {
        await api.delete(`${this.uri}/${this.selected}`);
        await this.refresh();
      },

      async rename() {
        if (this.dialog) {
          await api.post(`${this.uri}/${this.selected}`, {name: this.newDistributorName});
          await this.refresh();
          this.dialog = false;
        }
        else {
          this.dialogAction = this.rename;
          this.dialogTitle = 'Rename distributor';
          this.dialog = true;
          this.$nextTick(() => this.$refs.input.focus());
        }
      }
    },

    async mounted() {
      this.refresh()
        .catch(e => console.error(e));
    }
  }
</script>
