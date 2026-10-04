import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync('app/character-review-image.ts', 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const api = {};
runInThisContext(`(function(exports) {${code}\n})`)(api);
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4);
  data.copy(bytes, 8);
  bytes.writeUInt32BE(crc(bytes.subarray(4, -4)), bytes.length - 4);
  return bytes;
}
function paeth(a, b, c) {
  const p = a + b - c,
    x = Math.abs(p - a),
    y = Math.abs(p - b),
    z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
}
function png(
  pixels,
  { channels = 4, width = 2, height = 2, filter = 0, extra = 0 } = {},
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height + extra);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const above = y ? pixels[(y - 1) * stride + x] : 0;
      const corner =
        y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor =
        filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : filter === 4
                ? paeth(left, above, corner)
                : 0;
      raw[y * (stride + 1) + 1 + x] =
        (pixels[y * stride + x] - predictor + 256) & 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function rgbPixels(bytes) {
  const png = Buffer.from(bytes),
    payloads = [];
  assert.equal(png[25], 2, 'Review copy is opaque RGB, not alpha-dependent');
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset),
      type = png.toString('ascii', offset + 4, offset + 8);
    assert.equal(
      png.readUInt32BE(offset + 8 + length),
      crc(png.subarray(offset + 4, offset + 8 + length)),
      'Output CRC valid',
    );
    if (type === 'IDAT')
      payloads.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(payloads));
  return [...raw.subarray(1, 7), ...raw.subarray(8, 14)];
}
const pixels = [
  47, 137, 220, 0, 255, 255, 255, 255, 255, 0, 0, 128, 20, 30, 40, 255,
];
const expected = [236, 236, 236, 255, 255, 255, 246, 118, 118, 20, 30, 40];
let baseline;
for (let filter = 0; filter <= 4; filter++) {
  const input = png(pixels, { filter }),
    preserved = Buffer.from(input);
  const output = await api.compositeCharacterReviewPng(input);
  assert.deepEqual(rgbPixels(output), expected);
  assert.deepEqual(
    input,
    preserved,
    'Original transparent PNG is never mutated',
  );
  baseline ??= output;
}
assert.deepEqual(
  await api.compositeCharacterReviewPng(
    png([255, 0, 255, 0, ...pixels.slice(4)]),
  ),
  baseline,
  'Different invisible RGB values produce identical review pixels',
);
assert.deepEqual(
  rgbPixels(
    await api.compositeCharacterReviewPng(
      png([0, 0, 255, 255, 0, 128, 40, 255], { channels: 2, filter: 4 }),
    ),
  ),
  [236, 236, 236, 255, 255, 255, 118, 118, 118, 40, 40, 40],
  'Grayscale-alpha is composited correctly',
);
await assert.rejects(() =>
  api.compositeCharacterReviewPng(png(pixels, { filter: 5 })),
);
await assert.rejects(
  () => api.compositeCharacterReviewPng(png(pixels, { extra: 1 })),
  /decoded size/,
);
await assert.rejects(
  () => api.compositeCharacterReviewPng(png(pixels).subarray(0, -12)),
  /Incomplete/,
);
const tooLarge = png(pixels);
tooLarge.writeUInt32BE(100000, 16);
await assert.rejects(
  () => api.compositeCharacterReviewPng(tooLarge),
  /Unsupported/,
);
await assert.rejects(() =>
  api.compositeCharacterReviewPng(Buffer.from('not png')),
);
console.log(
  'review-image passed: all PNG filters, RGBA/gray-alpha, hidden-RGB invariance, honest partial alpha, opaque artifact retention, immutable source, bounded decoding and valid output CRC; no network',
);
