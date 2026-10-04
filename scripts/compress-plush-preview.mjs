import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import sharp from 'sharp';

// Format-only optimization of the existing approved artwork. No generation,
// crop, resize, retouch, colour change or quality reduction is performed.
const source = 'public/style-plush-3d-v2.png';
const destination = 'public/style-plush-3d-v2.webp';
if (
  await access(destination).then(
    () => true,
    () => false,
  )
)
  throw new Error('The versioned output already exists; preserve it.');
const result = await sharp(source)
  .webp({ lossless: true, effort: 6 })
  .toFile(destination);
const original = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const encoded = await sharp(destination)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
assert.equal(original.info.width, encoded.info.width);
assert.equal(original.info.height, encoded.info.height);
assert.equal(original.info.channels, 4);
assert.equal(encoded.info.channels, 4);
for (let i = 0; i < original.data.length; i += 4) {
  assert.equal(
    encoded.data[i + 3],
    original.data[i + 3],
    'all alpha values are identical',
  );
  if (!original.data[i + 3]) continue; // Fully transparent RGB is not visible.
  for (let channel = 0; channel < 3; channel++)
    assert.equal(
      encoded.data[i + channel],
      original.data[i + channel],
      'every visible colour channel is identical',
    );
}
console.log(
  JSON.stringify({
    destination,
    width: result.width,
    height: result.height,
    bytes: result.size,
    visiblePixelsIdentical: true,
  }),
);
