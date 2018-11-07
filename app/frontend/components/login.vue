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
    <v-layout class="justify-center align-content-center">
      <v-flex class="xs12 sm6 md5">
        <v-card>
          <v-card-title><span class="title">Log in</span></v-card-title>
          <v-card-text>
            <v-alert v-model="error" type="error" dismissible transition="slide-y-transition">
              {{ errorText }}
            </v-alert>
            <v-form @submit.prevent="login">
              <v-text-field v-model="username" v-if="showUsername" label="Username" type="email" required
                            :autofocus="showUsername"/>
              <v-text-field v-model="password" label="Password" type="password" ref="password" required
                            :autofocus="!showUsername"/>
              <v-btn type="submit" :loading="loading" color="primary" class="ml-0">Log in</v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-flex>
    </v-layout>
  </v-container>
</template>
<script>
  import api from '@/util/api';
  import {parse as qsParse} from 'querystring';

  const query = qsParse(location.search.substr(1));

  export default {
    name: 'Login',
    data: () => ({
      password: '',
      error: false,
      loading: false,
      errorText: 'An error occurred',
      username: ''
    }),
    props: {
      showUsername: {
        type: Boolean,
        default: false
      }
    },
    methods: {
      async login() {
        this.loading = true;
        try {
          location.href = await api.post('.', {
            password: this.password,
            auth: query.auth,
            username: this.username
          });
        }
        catch (e) {
          this.password = '';
          this.errorText = e;
          this.error = true;
          this.loading = false;
        }
      }
    }
  };
</script>
