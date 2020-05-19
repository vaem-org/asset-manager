import fse from 'fs-extra';
import { join } from 'path';

export async function removeEmptyDirectories(root) {
  const stat = await fse.lstat(root);
  if (!stat.isDirectory()) {
    return false;
  }

  const entries = await fse.readdir(root);
  let removed = 0;
  for(let entry of entries) {
    if (await removeEmptyDirectories(join(root, entry))) {
      removed++;
    }
  }

  if (entries.length - removed === 0) {
    console.log(`Removing ${root}`);
    await fse.rmdir(root);
    return true;
  }

  return false;
}
