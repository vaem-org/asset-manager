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

const webpack = require('webpack');
const config = require('./config');

const env = process.env.NODE_ENV || 'development';

const ManifestPlugin = require('webpack-manifest-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const VueLoaderPlugin = require('vue-loader/lib/plugin');

const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const sassLoader = {
  loader: 'sass-loader',
  options: {
    includePaths: [
      `${config.root}/node_modules/`
    ],
    sourceMap: true
  }
};

const babelOptions = {
  plugins: ['@babel/plugin-transform-runtime'],
  presets: ['@babel/preset-env'],
  babelrc: false,
  cacheDirectory: true
};
const outputPath = `${__dirname}/../public/build/`;
module.exports = {
  entry: {
    main: [
      '@babel/polyfill',
      `${__dirname}/../app/frontend/app.js`
    ],
    player: [
      '@babel/polyfill',
      `${__dirname}/../app/frontend/app-player.js`
    ]
  },
  resolve: {
    alias: {
      'vue$': 'vue/dist/vue.common.js',
      '@': `${__dirname}/../app/frontend`,
      'video.js': `${config.root}/node_modules/video.js`
    },
    extensions: ['.js', '.vue', '.json']
  },
  output: {
    filename: env === 'production' ? '[name].[hash].js' : '[name].js',
    path: outputPath,
    publicPath: '/build/'
  },
  module: {
    rules: [
      {
        test: /\.scss$/, use: [...(process.env.NODE_ENV === 'production' ? [MiniCssExtractPlugin.loader] : ['style-loader']), 'css-loader', 'resolve-url-loader', sassLoader]
      },
      {
        test: /\.css$/,
        use: [...(process.env.NODE_ENV === 'production' ? [MiniCssExtractPlugin.loader] : ['style-loader']), 'css-loader', 'resolve-url-loader']
      },
      {
        test: /\.woff2?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
        use: 'url-loader?limit=10000'
      },
      {
        test: /\.(ttf|eot|svg|png|gif)(\?[\s\S]+)?$/,
        use: 'file-loader'
      },
      {
        test: /\.ejs$/, use: {
          loader: 'ejs-compiled-loader?htmlmin'
        }
      },
      {
        test: /\.html$/,
        use:
          {
            loader: 'html-loader',
            options: {
              minimize: true
            }
          }
      },
      {
        test: /(app\/frontend).*\.js$/,
        loader: 'babel-loader',
        options: babelOptions
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader',
        options: {
          loaders: {
            js: {loader: 'babel-loader', options: babelOptions}
          }
        }
      }
    ]
  },

  plugins: (env === 'production' ? [
    new VueLoaderPlugin(),
    new CleanWebpackPlugin([outputPath], {root: config.root}),
    new MiniCssExtractPlugin(),
    new UglifyJsPlugin({
      uglifyOptions:
        {
          output: {
            comments: false
          },
        },
      parallel: true,
      cache: true
    }),
    new ManifestPlugin({
      writeToFileEmit: true,
      basePath: '/build/'
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: '"production"'
      }
    })
  ] : [
    new VueLoaderPlugin(),
    new webpack.NoEmitOnErrorsPlugin()
  ]),

  devtool: env === 'production' ? false : 'source-map',

  devServer: {
    port: config.port + 1,
    host: '0.0.0.0',
    proxy: {
      '/': {
        target: `http://127.0.0.1:${config.port}/`
      }
    },
    compress: true,
    hot: true,
    disableHostCheck: true,
    inline: true,
    stats: {
      colors: true
    },
    before: app => {
      app.get(['/build/player.css', '/build/main.css'], (req, res) => {
        res.setHeader('content-type', 'text/css');
        res.end('');
      })
    }
  },

  mode: env
};