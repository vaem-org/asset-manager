/*
 * VAEM - Asset manager
 * Copyright (C) 2022  Wouter van de Molengraft
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

export default schema => {
  /**
   * Set variant as uploaded
   * @param {string} variant
   * @returns {Promise<boolean>}
   */
  schema.methods.setUploadedVariant = async function(variant) {
    this.uploadedVariants = [...new Set([
      ...this.uploadedVariants,
      variant
    ])];

    await this.save();

    const complete = this.variants.every(variant => this.uploadedVariants.includes(variant));
    if (complete) {
      await this.finish();
    }

    return complete;
  }
}
