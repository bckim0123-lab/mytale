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
  if (expected.gate) await expected.gate;
  if (expected.tick) expected.tick();
  if (expected.throw) throw expected.throw;
  if (expected.status)
    return Response.json(
      { error: expected.error ?? 'private-provider-debug-do-not-expose' },
      { status: expected.status, headers: expected.headers },
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
  clientId,
  preferences = {},
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
  for (const [key, value] of Object.entries(preferences))
    form.append(key, value);
  if (reviewTicket)
    form.append(
      'reviewTicket',
      new Blob([Buffer.from(reviewTicket, 'base64')], {
        type: 'application/octet-stream',
      }),
      'review.bin',
    );
  const headers = { 'x-forwarded-for': clientId ?? `offline-${requestId++}` };
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

// Reject format errors before they can reach image generation or paid review.
for (const stream of [false, true]) {
  for (const providerError of [
    {
      status: 400,
      error: {
        code: 'invalid_value',
        param: 'background',
        type: 'image_generation_user_error',
      },
    },
    { status: 429, error: { code: 'insufficient_quota' } },
    { status: 400, error: { code: 'billing_hard_limit_reached' } },
  ]) {
    plan({ kind: 'image', ...providerError });
    const rejected = await request({ stream });
    assert.equal(rejected.data.code, 'provider_unavailable');
    assert.equal(
      rejected.data.retryable,
      false,
      'configuration/quota failures do not invite repeated charges or blame the drawing',
    );
    assert.equal(calls.length, 1);
    exhausted();
  }
  for (const contentType of [
    undefined,
    'application/json',
    'text/plain',
    'application/x-www-form-urlencoded',
  ]) {
    plan();
    const headers = {};
    if (contentType) headers['content-type'] = contentType;
    if (stream) headers.accept = 'application/x-ndjson';
    const response = await route.POST(
      new Request('http://local.test/api/character', {
        method: 'POST',
        headers,
        body: new TextEncoder().encode('{}'),
      }),
    );
    assert.equal(
      response.status,
      415,
      'Unsupported media is rejected before a stream opens.',
    );
    assert.match(response.headers.get('content-type'), /application\/json/);
    const data = await response.json();
    assert.equal(data.code, 'unsupported_media_type');
    assert.equal(data.retryable, false);
    assert.equal(data.image, undefined);
    assert.equal(data.reviewTicket, undefined);
    assert.equal(calls.length, 0);
    exhausted();
  }
  for (const [contentType, body] of [
    ['multipart/form-data', '{}'],
    [
      'multipart/form-data; boundary=broken-upload',
      '--broken-upload\r\nContent-Disposition: form-data; name="drawing"; filename="drawing.png"\r\nContent-Type: image/png\r\n\r\ntruncated',
    ],
    ['multipart/form-data; boundary=missing-body', ''],
  ]) {
    plan();
    const response = await route.POST(
      new Request('http://local.test/api/character', {
        method: 'POST',
        headers: {
          'content-type': contentType,
          ...(stream ? { accept: 'application/x-ndjson' } : {}),
        },
        body,
      }),
    );
    let data;
    if (stream) {
      const events = (await response.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.equal(events[0].type, 'accepted');
      assert.equal(events.at(-1).type, 'error');
      assert.equal(events.at(-1).status, 400);
      assert.equal(events.filter((event) => event.type === 'result').length, 0);
      data = events.at(-1).data;
    } else {
      assert.equal(response.status, 400);
      data = await response.json();
    }
    assert.equal(data.code, 'invalid_multipart');
    assert.equal(data.retryable, false);
    assert.equal(data.image, undefined);
    assert.equal(data.reviewTicket, undefined);
    assert.equal(calls.length, 0);
    exhausted();
  }
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
result = await request({
  stream: true,
  preferences: {
    characterMood: '활발하고 씩씩한',
    favoriteWorld: '로봇과 우주',
    favoriteColor: '민트',
    preserveFocus: '별 모양 배 무늬',
    characterWish: '발 없는 구름 고래, 작은 별 가방',
  },
});
assert.equal(result.response.status, 200);
assert.equal(result.data.quality.polished, true);
assert.deepEqual(
  result.events
    .filter((event) => event.type === 'stage')
    .map((event) => event.stage),
  ['preparing', 'generating', 'reviewing', 'refining', 'reviewing'],
);
assert.equal(
  result.data.image,
  `data:image/png;base64,${refined.toString('base64')}`,
);
assert.equal(calls.filter((call) => call.kind === 'image').length, 2);
for (const call of calls) {
  const prompt =
    call.kind === 'image'
      ? call.body.get('prompt')
      : JSON.parse(call.body).input[0].content[0].text;
  for (const wanted of [
    '활발하고 씩씩한',
    '로봇과 우주',
    '민트',
    '별 모양 배 무늬',
    '작은 별 가방',
  ]) {
    assert.ok(
      prompt.includes(wanted),
      `${call.kind} retains the child's ${wanted} brief, including correction`,
    );
  }
  assert.match(
    prompt,
    /차량·구름·네발동물·팔다리 없는 캐릭터/,
    'all stages preserve non-humanoid anatomy',
  );
}
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
assert.equal(result.data.code, 'quality_review_refused');
assert.equal(result.data.retryable, false);
assert.equal(result.response.status, 422);
assert.equal(
  result.data.reviewTicket,
  undefined,
  'Explicit reviewer refusal is not a provider outage',
);
assert.equal(calls.length, 2);
exhausted();

for (const stream of [false, true]) {
  for (const status of [400, 401, 403, 404, 415, 422]) {
    plan({ kind: 'image', status });
    const rejected = await request({ stream });
    const isConfiguration = [401, 403, 404].includes(status);
    assert.equal(
      rejected.data.code,
      isConfiguration ? 'provider_unavailable' : 'generation_request_rejected',
    );
    assert.equal(rejected.data.retryable, false);
    assert.equal(rejected.data.image, undefined);
    assert.equal(rejected.data.reviewTicket, undefined);
    assert.equal(
      JSON.stringify(rejected.data).includes('private-provider-debug'),
      false,
    );
    assert.equal(
      calls.length,
      1,
      'A rejected image request never purchases a review or correction.',
    );
    if (stream) {
      assert.equal(rejected.events.at(-1).type, 'error');
      assert.equal(rejected.events.at(-1).status, isConfiguration ? 503 : 422);
    } else assert.equal(rejected.response.status, isConfiguration ? 503 : 422);
    exhausted();
  }
  for (const status of [408, 429, 500, 503]) {
    plan({ kind: 'image', status, headers: { 'Retry-After': '7' } });
    const busy = await request({ stream });
    assert.equal(busy.data.code, 'upstream_busy');
    assert.equal(busy.data.retryable, true);
    assert.equal(busy.data.retryAfterMs, 7000);
    assert.equal(busy.data.image, undefined);
    assert.equal(
      JSON.stringify(busy.data).includes('private-provider-debug'),
      false,
    );
    assert.equal(calls.length, 1);
    exhausted();
  }
}

// A provider refusal/outage during the sole correction retains its real
// recovery meaning instead of masquerading as another poor-quality drawing.
for (const status of [403, 503]) {
  plan(
    { kind: 'image' },
    { kind: 'review', review: { ...passing, score: 70 } },
    { kind: 'image', status },
  );
  const failedCorrection = await request();
  assert.equal(
    failedCorrection.data.code,
    status === 403 ? 'provider_unavailable' : 'upstream_busy',
  );
  assert.equal(failedCorrection.data.retryable, status === 503);
  assert.equal(
    calls.length,
    3,
    'Correction failure cannot start another edit or review.',
  );
  assert.equal(failedCorrection.data.image, undefined);
  exhausted();
}

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

const sealedPreferences = {
  characterMood: '활발하고 씩씩한',
  favoriteWorld: '로봇과 우주',
  favoriteColor: '민트',
  preserveFocus: '별 모양 배 무늬',
  characterWish: '작은 별 가방',
};
plan({ kind: 'image' }, { kind: 'review', status: 503 });
result = await request({ stream: true, preferences: sealedPreferences });
assert.equal(result.events.at(-1).type, 'error');
assert.equal(result.data.retryMode, 'review-only');
assert.equal(result.data.image, undefined);
assert.ok(result.data.reviewTicket);
const resumeTicket = result.data.reviewTicket;
const expires = result.data.reviewTicketExpiresAt;
const openedPreferences = await quality.openReviewTicket(
  Buffer.from(resumeTicket, 'base64'),
  process.env.OPENAI_API_KEY,
);
assert.deepEqual(openedPreferences.metadata.preferences, {
  mood: sealedPreferences.characterMood,
  world: sealedPreferences.favoriteWorld,
  color: sealedPreferences.favoriteColor,
  focus: sealedPreferences.preserveFocus,
  wish: sealedPreferences.characterWish,
});
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
result = await request({
  reviewTicket: resumeTicket,
  stream: true,
  preferences: {
    characterWish: '변경된 요청 무시하기',
    favoriteColor: '보라색',
  },
});
assert.equal(result.response.status, 200);
assert.equal(
  result.data.image,
  `data:image/png;base64,${candidate.toString('base64')}`,
);
assert.equal(calls.length, 1);
assert.equal(calls[0].kind, 'review', 'Resume never generates another image');
const resumedPrompt = JSON.parse(calls[0].body).input[0].content[0].text;
for (const value of Object.values(sealedPreferences))
  assert.ok(
    resumedPrompt.includes(value),
    'Review uses the authenticated original preferences.',
  );
assert.ok(!resumedPrompt.includes('변경된 요청 무시하기'));
assert.deepEqual(
  result.events
    .filter((event) => event.type === 'stage')
    .map((event) => event.stage),
  ['preparing', 'reviewing'],
);
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

// Resume admission is independent from paid image-generation admission.
// Invalid/mismatched receipts do not consume either allowance.
const quotaClient = 'quota-boundary-client';
for (let index = 0; index < 10; index++) {
  plan();
  const invalid = await request({
    clientId: quotaClient,
    reviewTicket: Buffer.from('invalid-ticket').toString('base64'),
  });
  assert.equal(invalid.data.code, 'review_ticket_invalid');
  assert.equal(calls.length, 0);
  exhausted();
}
for (let index = 0; index < 8; index++) {
  plan({ kind: 'image' }, { kind: 'review' });
  assert.equal((await request({ clientId: quotaClient })).response.status, 200);
  exhausted();
}
plan({ kind: 'image' }, { kind: 'review', status: 503 });
const ninth = await request({ clientId: quotaClient });
assert.ok(
  ninth.data.reviewTicket,
  'The final allowed image can still receive a recovery ticket.',
);
exhausted();
plan();
const tenth = await request({ clientId: quotaClient });
assert.equal(
  tenth.data.code,
  'rate_limited',
  'The original nine-image allowance is unchanged.',
);
assert.equal(calls.length, 0);
exhausted();
const ninthTicket = ninth.data.reviewTicket;
for (const change of [{ drawing: png(111) }, { style: 1 }]) {
  plan();
  const invalid = await request({
    clientId: quotaClient,
    reviewTicket: ninthTicket,
    ...change,
  });
  assert.equal(invalid.data.code, 'review_ticket_invalid');
  assert.equal(calls.length, 0);
  exhausted();
}
for (let attempt = 0; attempt < 3; attempt++) {
  plan({ kind: 'review', ...(attempt > 0 ? { status: 503 } : {}) });
  const resumed = await request({
    clientId: quotaClient,
    reviewTicket: ninthTicket,
  });
  assert.equal(
    resumed.data.code,
    attempt > 0 ? 'quality_review_failed' : undefined,
  );
  if (attempt === 0) assert.equal(resumed.data.quality.passed, true);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].kind,
    'review',
    'A resume never generates a new image.',
  );
  exhausted();
}
for (const clientId of [quotaClient, 'different-client-same-ticket']) {
  plan();
  const exhaustedTicket = await request({
    clientId,
    reviewTicket: ninthTicket,
    stream: true,
  });
  assert.equal(exhaustedTicket.data.code, 'review_retry_exhausted');
  assert.equal(exhaustedTicket.data.retryable, false);
  assert.equal(exhaustedTicket.data.image, undefined);
  assert.equal(exhaustedTicket.data.reviewTicket, undefined);
  assert.equal(exhaustedTicket.events.at(-1).status, 429);
  assert.equal(
    calls.length,
    0,
    'Changing client IP cannot evade a ticket lifetime limit.',
  );
  exhausted();
}

const reviewClient = 'separate-review-quota-client';
const reviewTickets = [];
for (let index = 0; index < 4; index++) {
  plan({ kind: 'image' }, { kind: 'review', status: 503 });
  const generated = await request({ clientId: reviewClient });
  assert.ok(generated.data.reviewTicket);
  reviewTickets.push(generated.data.reviewTicket);
  exhausted();
}
for (const reviewTicket of reviewTickets.slice(0, 3))
  for (let attempt = 0; attempt < 3; attempt++) {
    plan({ kind: 'review' });
    assert.equal(
      (await request({ clientId: reviewClient, reviewTicket })).response.status,
      200,
    );
    exhausted();
  }
plan();
const exhaustedClient = await request({
  clientId: reviewClient,
  reviewTicket: reviewTickets[3],
});
assert.equal(exhaustedClient.data.code, 'review_retry_exhausted');
assert.equal(
  calls.length,
  0,
  'Using another valid ticket cannot evade the per-client review allowance.',
);
exhausted();
plan({ kind: 'image' }, { kind: 'review' });
assert.equal(
  (await request({ clientId: reviewClient })).response.status,
  200,
  'Review attempts never consume the separate image allowance.',
);
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

// Stages must reach the client before the corresponding provider work finishes.
{
  const releases = [];
  const gates = Array.from(
    { length: 4 },
    () => new Promise((resolve) => releases.push(resolve)),
  );
  plan(
    { kind: 'image', gate: gates[0] },
    { kind: 'review', gate: gates[1], review: { ...passing, score: 70 } },
    { kind: 'image', gate: gates[2], image: refined },
    { kind: 'review', gate: gates[3] },
  );
  const form = new FormData();
  form.append(
    'drawing',
    new Blob([source], { type: 'image/png' }),
    'drawing.png',
  );
  form.append('styleIndex', '0');
  const response = route.POST(
    new Request('http://local.test/api/character', {
      method: 'POST',
      body: form,
      headers: {
        accept: 'application/x-ndjson',
        'x-forwarded-for': 'pending-stage-proof',
      },
    }),
  );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  async function readUntil(type, stage) {
    for (;;) {
      let timer;
      const chunk = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error('Stage was not streamed before provider completion'),
              ),
            1000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      assert.equal(chunk.done, false);
      const event = JSON.parse(decoder.decode(chunk.value).trim());
      if (event.type === type && (!stage || event.stage === stage)) {
        if (type === 'stage')
          assert.deepEqual(
            Object.keys(event).sort(),
            ['stage', 'type'],
            'Progress never leaks prompt, image or receipt data.',
          );
        return event;
      }
    }
  }
  await readUntil('stage', 'generating');
  releases[0]();
  await readUntil('stage', 'reviewing');
  releases[1]();
  await readUntil('stage', 'refining');
  releases[2]();
  await readUntil('stage', 'reviewing');
  releases[3]();
  assert.equal((await readUntil('result')).data.quality.polished, true);
  reader.releaseLock();
  exhausted();
}

console.log(
  'character-quality smoke passed: strict numeric/boolean gates, bounded correction + re-review, encrypted expiring source-bound review-only retries, separate bounded image/review allowances, safe permanent/transient provider errors, no unreviewed image exposure, payload caps; all provider calls mocked.',
);
