import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

// No Vite/env loading, no real API key and no network. Compile the real handlers in memory.
const nativeRequire = createRequire(import.meta.url);
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  runInThisContext(`(function(exports, require) {\n${code}\n})`, { filename })(
    exports,
    (specifier) =>
      specifier.startsWith('.')
        ? load(path.resolve(path.dirname(filename), `${specifier}.ts`))
        : nativeRequire(specifier),
  );
  return exports;
}

const quality = load(path.resolve('app/character-quality.ts'));
const route = load(path.resolve('app/api/character/route.ts'));
process.env.OPENAI_API_KEY = 'offline-test-key-never-sent';
const passing = {
  ...quality.CHARACTER_QUALITY_THRESHOLDS,
  singleCharacter: true,
  scaryOrUncanny: false,
  backgroundArtifact: false,
  passed: true,
  issue: '',
};
assert.equal(quality.passesCharacterQuality(passing), true);
for (const [key, minimum] of Object.entries(
  quality.CHARACTER_QUALITY_THRESHOLDS,
)) {
  assert.equal(
    quality.passesCharacterQuality({ ...passing, [key]: minimum - 0.01 }),
    false,
    `${key} is a strict threshold; no rounding upward`,
  );
  assert.equal(quality.parseCharacterReview({ ...passing, [key]: '99' }), null);
  assert.equal(
    quality.parseCharacterReview({ ...passing, [key]: Infinity }),
    null,
  );
  assert.equal(quality.parseCharacterReview({ ...passing, [key]: NaN }), null);
}
assert.equal(
  quality.parseCharacterReview({ ...passing, passed: false }).passed,
  true,
  'Server criteria own pass/fail',
);
assert.equal(
  quality.parseCharacterReview({ ...passing, score: 30, passed: true }).passed,
  false,
);
assert.equal(
  quality.parseCharacterReview({ ...passing, scaryOrUncanny: undefined }),
  null,
  'Missing safety booleans never default to safe',
);
for (const [key, value] of [
  ['singleCharacter', false],
  ['scaryOrUncanny', true],
  ['backgroundArtifact', true],
]) {
  assert.equal(
    quality.passesCharacterQuality({ ...passing, [key]: value }),
    false,
  );
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type), data]);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  typed.copy(result, 4);
  result.writeUInt32BE(crc32(typed), result.length - 4);
  return result;
}
function png(red = 230) {
  const width = 64,
    height = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      pixels[offset] = red;
      pixels[offset + 1] = 190;
      pixels[offset + 2] = 150;
      pixels[offset + 3] = (x - 32) ** 2 + (y - 32) ** 2 < 22 ** 2 ? 255 : 0;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const source = png(190);
const candidate = png(230);
const refined = png(235);
const now = Date.now();
const metadata = {
  sourceHash: await quality.sourceDigest(source),
  styleIndex: 0,
  age: '7–9세',
  highQuality: true,
  corrected: false,
  expiresAt: now + quality.REVIEW_TICKET_TTL_MS,
};
const secret = 'offline-ticket-test-secret';
const ticket = await quality.sealReviewTicket(candidate, metadata, secret);
assert.deepEqual(
  (await quality.openReviewTicket(ticket, secret, now)).candidate,
  new Uint8Array(candidate),
);
assert.equal(await quality.openReviewTicket(ticket, 'wrong-key', now), null);
assert.equal(
  await quality.openReviewTicket(ticket, secret, metadata.expiresAt),
  null,
);
for (const index of [0, 1, 16, ticket.length - 1]) {
  const altered = ticket.slice();
  altered[index] ^= 1;
  assert.equal(
    await quality.openReviewTicket(altered, secret, now),
    null,
    'Authenticated ticket rejects tampering',
  );
}
assert.equal(
  Buffer.from(ticket).includes(candidate),
  false,
  'Unreviewed PNG is not readable inside the ticket',
);
await assert.rejects(() =>
  quality.sealReviewTicket(
    new Uint8Array(quality.MAX_CANDIDATE_BYTES + 1),
    metadata,
    secret,
  ),
);

let planned = [],
  calls = [],
  requestId = 0;
globalThis.fetch = async (url, init) => {
  const href =
    typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  const kind = href.endsWith('/images/edits')
    ? 'image'
    : href.endsWith('/responses')
      ? 'review'
      : 'unexpected';
  calls.push({ kind, body: init.body });
  const expected = planned.shift();
  assert.ok(expected, `Unplanned external call blocked: ${kind}`);
  assert.equal(kind, expected.kind);
  if (expected.tick) expected.tick();
  if (expected.throw) throw expected.throw;
  if (expected.status)
    return Response.json(
      { error: 'offline provider outage' },
      { status: expected.status },
    );
  if (expected.refusal)
    return Response.json({
      output: [
        {
          content: [
            { type: 'refusal', refusal: 'Cannot review this content.' },
          ],
        },
      ],
    });
  return Response.json(
    kind === 'image'
      ? {
          data: [
            { b64_json: (expected.image ?? candidate).toString('base64') },
          ],
        }
      : {
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify(expected.review ?? passing),
                },
              ],
            },
          ],
        },
  );
};
async function request({
  reviewTicket,
  drawing = source,
  style = 0,
  contentLength,
  stream = false,
} = {}) {
  const form = new FormData();
  form.append(
    'drawing',
    new Blob([drawing], { type: 'image/png' }),
    'drawing.png',
  );
  form.append('styleIndex', String(style));
  form.append('age', '7–9세');
  form.append('qualityTier', 'high');
  if (reviewTicket)
    form.append(
      'reviewTicket',
      new Blob([Buffer.from(reviewTicket, 'base64')], {
        type: 'application/octet-stream',
      }),
      'review.bin',
    );
  const headers = { 'x-forwarded-for': `offline-${requestId++}` };
  if (contentLength) headers['content-length'] = String(contentLength);
  if (stream) headers.accept = 'application/x-ndjson';
  const response = await route.POST(
    new Request('http://local.test/api/character', {
      method: 'POST',
      body: form,
      headers,
    }),
  );
  if (stream) {
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(events[0].type, 'accepted');
    return { response, data: events.at(-1).data, events };
  }
  return { response, data: await response.json() };
}
function plan(...items) {
  planned = items;
  calls = [];
}
function exhausted() {
  assert.equal(planned.length, 0, 'Every planned call occurred');
}

plan({ kind: 'image' }, { kind: 'review' });
let result = await request();
assert.equal(result.response.status, 200);
assert.equal(result.data.quality.passed, true);
assert.equal(result.data.quality.polished, false);
assert.equal(calls.length, 2);
exhausted();

plan(
  { kind: 'image' },
  { kind: 'review', review: { ...passing, score: 70 } },
  { kind: 'image', image: refined },
  { kind: 'review' },
);
result = await request();
assert.equal(result.response.status, 200);
assert.equal(result.data.quality.polished, true);
assert.equal(
  result.data.image,
  `data:image/png;base64,${refined.toString('base64')}`,
);
assert.equal(calls.filter((call) => call.kind === 'image').length, 2);
exhausted();

plan(
  { kind: 'image' },
  { kind: 'review', review: { ...passing, sourceFidelity: 50 } },
  { kind: 'image', image: refined },
  { kind: 'review', review: { ...passing, sourceFidelity: 60 } },
);
result = await request();
assert.equal(result.data.code, 'quality_failed');
assert.equal(result.data.retryable, false);
assert.equal(result.data.image, undefined);
assert.equal(result.data.reviewTicket, undefined);
exhausted();

plan(
  { kind: 'image' },
  { kind: 'review', review: { ...passing, scaryOrUncanny: true } },
);
result = await request();
assert.equal(result.data.code, 'quality_failed');
assert.equal(calls.length, 2, 'Hard failure never buys a correction');
exhausted();

plan({ kind: 'image' }, { kind: 'review', refusal: true });
result = await request();
assert.equal(result.data.code, 'quality_failed');
assert.equal(
  result.data.reviewTicket,
  undefined,
  'Explicit reviewer refusal is not a provider outage',
);
assert.equal(calls.length, 2);
exhausted();

const realNow = Date.now;
try {
  const started = realNow();
  let elapsed = 0;
  Date.now = () => started + elapsed;
  plan(
    {
      kind: 'image',
      tick: () => {
        elapsed = 170_000;
      },
    },
    { kind: 'review', review: { ...passing, styleMatch: 65 } },
  );
  result = await request();
  assert.equal(result.data.code, 'quality_failed');
  assert.equal(
    calls.length,
    2,
    'Insufficient remaining budget never starts correction',
  );
  exhausted();
} finally {
  Date.now = realNow;
}

plan({ kind: 'image' }, { kind: 'review', status: 503 });
result = await request({ stream: true });
assert.equal(result.events.at(-1).type, 'error');
assert.equal(result.data.retryMode, 'review-only');
assert.equal(result.data.image, undefined);
assert.ok(result.data.reviewTicket);
const resumeTicket = result.data.reviewTicket;
const expires = result.data.reviewTicketExpiresAt;
exhausted();

plan({ kind: 'review', status: 503 });
result = await request({ reviewTicket: resumeTicket });
assert.equal(
  result.data.reviewTicket,
  resumeTicket,
  'Further provider failure preserves ticket, image and original expiry',
);
assert.equal(result.data.reviewTicketExpiresAt, expires);
assert.equal(calls.length, 1);
exhausted();

plan({ kind: 'review' });
result = await request({ reviewTicket: resumeTicket });
assert.equal(result.response.status, 200);
assert.equal(
  result.data.image,
  `data:image/png;base64,${candidate.toString('base64')}`,
);
assert.equal(calls.length, 1);
assert.equal(calls[0].kind, 'review', 'Resume never generates another image');
exhausted();

plan({ kind: 'review', review: { ...passing, fullBody: 87 } });
result = await request({ reviewTicket: resumeTicket });
assert.equal(result.data.code, 'quality_failed');
assert.equal(
  calls.length,
  1,
  'Review-only score failure never buys a correction',
);
exhausted();

plan();
result = await request({ reviewTicket: resumeTicket, drawing: png(111) });
assert.equal(result.data.code, 'review_ticket_invalid');
assert.equal(calls.length, 0);
result = await request({ reviewTicket: resumeTicket, style: 1 });
assert.equal(result.data.code, 'review_ticket_invalid');
assert.equal(calls.length, 0);
try {
  Date.now = () => expires;
  result = await request({ reviewTicket: resumeTicket });
  assert.equal(result.data.code, 'review_ticket_invalid');
  assert.equal(calls.length, 0);
} finally {
  Date.now = realNow;
}

plan(
  { kind: 'image' },
  { kind: 'review', review: { ...passing, score: 70 } },
  { kind: 'image', image: refined },
  { kind: 'review', status: 503 },
);
result = await request();
const correctedTicket = result.data.reviewTicket;
assert.ok(correctedTicket);
exhausted();
plan({ kind: 'review' });
result = await request({ reviewTicket: correctedTicket });
assert.equal(result.data.quality.polished, true);
assert.equal(
  result.data.image,
  `data:image/png;base64,${refined.toString('base64')}`,
);
exhausted();

plan();
result = await request({ contentLength: quality.MAX_CHARACTER_BODY_BYTES + 1 });
assert.equal(result.response.status, 413);
assert.equal(calls.length, 0);
const largerSource = Buffer.concat([source, Buffer.alloc(3_000_000)]);
const largerCandidate = Buffer.concat([candidate, Buffer.alloc(1_100_000)]);
plan(
  { kind: 'image', image: largerCandidate },
  { kind: 'review', status: 503 },
);
result = await request({ drawing: largerSource });
assert.equal(result.data.code, 'quality_review_payload_too_large');
assert.equal(result.data.reviewTicket, undefined);
assert.equal(result.data.image, undefined);
exhausted();

console.log(
  'character-quality smoke passed: strict numeric/boolean gates, bounded correction + re-review, encrypted expiring source-bound review-only retries, no unreviewed image exposure, payload caps; all provider calls mocked.',
);
