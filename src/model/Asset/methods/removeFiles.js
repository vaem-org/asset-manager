import { config } from '#~/config';

export default schema => {
  schema.methods.removeFiles = function() {
    config.storage.remove(this._id.toString() + '/')
    .catch(e => {
      console.warn(`Unable to remove files for ${this._id}: ${e.toString()}`);
    });
  }
}
