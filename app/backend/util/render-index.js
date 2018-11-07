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

import fs from 'fs';
import ejs from 'ejs';
import config from '../../../config/config';
import _ from 'lodash';

const webpackConfig = require(`${config.root}/config/webpack.config.js`);

const _manifest = process.env.NODE_ENV === 'production' ? require(`${config.root}/public/build/manifest.json`) : {};
const manifest = key => _manifest[key] || key;

const html = _.mapValues(webpackConfig.entry, (value, entry) => ejs.render(fs.readFileSync(`${config.root}/app/backend/views/index.ejs`).toString(), {
	manifest,
	stylesheet: manifest(`/build/${entry}.css`),
	script: manifest(`/build/${entry}.js`)
}, {
	rmWhitespace: true,
	root: `${__dirname}/app/views`
}));

/**
 * Render the main html
 */
const renderIndex = entry => (req, res) => res.end(html[entry]);

export {renderIndex};