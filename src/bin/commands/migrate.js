import { Asset } from '#~/model/Asset/index';

export async function run() {
  // assume all processed assets are verified
  await Asset.updateMany({
    state: 'processed'
  }, {
    $set: {
      state: 'verified'
    }
  });

  // assign ffprobe to videoParameters.ffprobe
  await Asset.updateMany({
    ffprobe: {
      $exists: false
    }
  }, [
    {
      $set: {
        ffprobe: '$videoParameters.ffprobe'
      }
    }
  ]);

  await Asset.updateMany({},
    {
      $rename: {
        bitrates: 'variants'
      }
    }, {
      strict: false
    })

  await Asset.updateMany({}, {
    $unset: Object.fromEntries(
      ['audio', 'audioStreams', 'basename', 'videoParameters', 'numStreams', 'streams'].map(key => [key, 1])
    )
  }, {
    strict: false
  })
}
