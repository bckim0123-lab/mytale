import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  imageInputLimitError,
  readImageDimensions,
} from '../app/image-input-limits.ts';

function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
function jpeg(width, height, progressive = false) {
  return Buffer.from([
    255,
    216,
    255,
    224,
    0,
    4,
    0,
    0,
    255,
    progressive ? 194 : 192,
    0,
    8,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    0,
  ]);
}
function webp(kind, width, height) {
  const payload = Buffer.alloc(kind === 'VP8L' ? 5 : 10);
  if (kind === 'VP8X') {
    payload.writeUIntLE(width - 1, 4, 3);
    payload.writeUIntLE(height - 1, 7, 3);
  } else if (kind === 'VP8L') {
    payload[0] = 47;
    payload.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 1);
  } else {
    payload[3] = 157;
    payload[4] = 1;
    payload[5] = 42;
    payload.writeUInt16LE(width, 6);
    payload.writeUInt16LE(height, 8);
  }
  const header = Buffer.alloc(20);
  header.write('RIFF');
  header.writeUInt32LE(12 + payload.length, 4);
  header.write('WEBP', 8);
  header.write(kind, 12);
  header.writeUInt32LE(payload.length, 16);
  return Buffer.concat([header, payload]);
}
const url = (bytes) =>
  `data:application/octet-stream;base64,${bytes.toString('base64')}`;
for (const fixture of [
  png(1600, 1200),
  jpeg(1600, 1200),
  jpeg(1600, 1200, true),
  ...['VP8X', 'VP8L', 'VP8 '].map((kind) => webp(kind, 1600, 1200)),
]) {
  assert.deepEqual(readImageDimensions(fixture), { width: 1600, height: 1200 });
  assert.equal(imageInputLimitError(url(fixture)), null);
}
for (const fixture of [
  png(16001, 100),
  png(9000, 9000),
  png(0, 4),
  png(0xffffffff, 0xffffffff),
  jpeg(60000, 100),
  webp('VP8X', 16001, 1),
  webp('VP8L', 9000, 9000),
])
  assert.ok(imageInputLimitError(url(fixture)));
assert.equal(imageInputLimitError(url(png(8000, 8000))), null);
assert.equal(
  imageInputLimitError(url(jpeg(8000, 6000))),
  null,
  '48MP camera images remain supported.',
);
assert.equal(imageInputLimitError(url(png(16000, 4000))), null);
for (const fixture of [
  Buffer.alloc(0),
  Buffer.from('not an image'),
  png(2, 2).subarray(0, 23),
  jpeg(2, 2).subarray(0, 16),
  webp('VP8X', 2, 2).subarray(0, 26),
])
  assert.ok(imageInputLimitError(url(fixture)));
for (const invalid of [
  'https://example.com/a.png',
  'data:image/png,hello',
  'data:image/png;base64,???',
])
  assert.ok(imageInputLimitError(invalid));
const malformedJpeg = jpeg(2, 2);
malformedJpeg[5] = 0;
assert.equal(readImageDimensions(malformedJpeg), null);
const malformedWebp = webp('VP8X', 2, 2);
malformedWebp.writeUInt32LE(0xffffffff, 16);
assert.equal(readImageDimensions(malformedWebp), null);
for (const file of [
  'public/practice-whale-drawing-v1.webp',
  'public/practice-whale-result-v1.webp',
  'public/style-plush-3d-v2.png',
]) {
  const bytes = readFileSync(file);
  assert.ok(readImageDimensions(bytes));
  assert.equal(
    imageInputLimitError(url(bytes)),
    null,
    `${file} remains usable`,
  );
}
console.log(
  'Input header limits passed: PNG, baseline/progressive JPEG, all WebP headers, actual sample assets, 48MP acceptance, oversized/truncated/malformed rejection before pixel decoding.',
);
