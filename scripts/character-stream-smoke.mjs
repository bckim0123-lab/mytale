import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

// Exercise the actual browser stream/request helpers without React, network or an API key.
const source = ts.createSourceFile(
  'app/page.tsx',
  readFileSync('app/page.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const names = new Set([
  'CharacterRequestError',
  'readCharacterStream',
  'readJson',
  'apiErrorMessage',
  'characterFailureMessage',
]);
const declarations = source.statements
  .filter((node) => node.name && names.has(node.name.text))
  .map((node) => node.getText(source));
assert.equal(declarations.length, names.size);
let requestDefinition = '';
function visit(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === 'requestVariant'
  )
    requestDefinition = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
if (!requestDefinition.length)
  throw new TypeError('Missing actual requestVariant definition');
const helpers =
  declarations.join('\n') +
  `
export function createVariantRequester(bindings) {
  const { generationRun, reviewTickets, favoriteColor, preserveFocus, characterWish, age, childGender,
    characterMood, favoriteWorld, styleReferenceBlob, plushReferenceVersion, setGenerationLastActivityAt } = bindings;
  const ${requestDefinition};
  return requestVariant;
}
export { CharacterRequestError, readCharacterStream, characterFailureMessage };
`;
const compiled = ts.transpileModule(helpers, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const api = {};
runInThisContext(`(function(exports) {\n${compiled}\n})`, {
  filename: 'actual-character-stream-helpers.test.cjs',
})(api);
const ticket = Buffer.from(
  'authenticated-ciphertext-placeholder'.repeat(3),
).toString('base64');
const ticketError = {
  error: '마지막 검사가 잠시 멈췄어요.',
  code: 'quality_review_failed',
  retryable: true,
  retryAfterMs: 5000,
  retryMode: 'review-only',
  reviewTicket: ticket,
  reviewTicketExpiresAt: Date.now() + 300_000,
};
const events = [
  { type: 'accepted' },
  { type: 'heartbeat' },
  { type: 'error', status: 502, data: ticketError },
];
function stream(items) {
  const bytes = new TextEncoder().encode(
    items.map((item) => JSON.stringify(item)).join('\n') + '\n',
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 7)
          controller.enqueue(bytes.slice(offset, offset + 7));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } },
  );
}
let activity = 0;
const response = stream(events);
await assert.rejects(
  api.readCharacterStream(response, () => activity++),
  (error) => {
    assert.ok(error instanceof api.CharacterRequestError);
    assert.equal(error.reviewTicket, ticket);
    assert.equal(
      error.reviewTicketExpiresAt,
      ticketError.reviewTicketExpiresAt,
    );
    assert.equal(error.retryMode, 'review-only');
    assert.match(api.characterFailureMessage(error), /검사만 이어가요/);
    assert.doesNotMatch(api.characterFailureMessage(error), /새로 만들어/);
    return true;
  },
);
assert.equal(activity, 2);
assert.equal(
  response.body.locked,
  false,
  'Terminal error releases reader lock',
);

for (const patch of [
  { reviewTicketExpiresAt: Date.now() - 1 },
  { retryMode: undefined },
  { reviewTicket: 'data:image/png;base64,not-a-ticket' },
  { reviewTicket: 'A'.repeat(3_800_001) },
]) {
  const error = new api.CharacterRequestError(
    'failure',
    'quality_review_failed',
    true,
    5000,
    { ...ticketError, ...patch },
  );
  assert.equal(
    error.reviewTicket,
    undefined,
    'Invalid or expired receipt is not retained',
  );
}
function bindings() {
  return {
    generationRun: { current: 1 },
    reviewTickets: { current: {} },
    favoriteColor: '원본 색',
    preserveFocus: '',
    characterWish: '',
    age: '7–9세',
    childGender: '선택하지 않음',
    characterMood: '포근하고 다정한',
    favoriteWorld: '동물과 자연',
    styleReferenceBlob: { current: null },
    plushReferenceVersion: 'test',
    setGenerationLastActivityAt: () => {},
  };
}
const originalFetch = globalThis.fetch;
const drawing = new Blob(['exact source bytes'], { type: 'image/png' });
const calls = [];
let reply;
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/character', 'No real provider/network call');
    calls.push(options.body);
    return reply();
  };
  const current = bindings();
  const request = api.createVariantRequester(current);
  reply = () => stream(events);
  await assert.rejects(request(drawing, 0), api.CharacterRequestError);
  assert.equal(
    current.reviewTickets.current[0],
    ticket,
    'Actual NDJSON error stores its receipt',
  );
  assert.equal(
    calls.length,
    1,
    'Error never triggers an automatic second request',
  );

  reply = () =>
    stream([
      { type: 'accepted' },
      {
        type: 'result',
        data: {
          image: 'data:image/png;base64,approved',
          quality: { passed: true },
        },
      },
    ]);
  const result = await request(drawing, 0);
  assert.equal(result.image, 'data:image/png;base64,approved');
  assert.equal(
    current.reviewTickets.current[0],
    undefined,
    'Success removes consumed receipt',
  );
  assert.deepEqual(
    new Uint8Array(await calls[1].get('reviewTicket').arrayBuffer()),
    new Uint8Array(Buffer.from(ticket, 'base64')),
    'Retry sends binary ciphertext',
  );
  assert.equal(
    await calls[1].get('drawing').text(),
    await drawing.text(),
    'Retry retains exact original source',
  );

  current.reviewTickets.current[0] = ticket;
  reply = () =>
    stream([
      {
        type: 'error',
        status: 400,
        data: {
          error: 'expired',
          code: 'review_ticket_invalid',
          retryable: false,
        },
      },
    ]);
  await assert.rejects(request(drawing, 0), api.CharacterRequestError);
  assert.equal(
    current.reviewTickets.current[0],
    undefined,
    'Invalid receipt is cleared',
  );

  for (const invalidate of ['run', 'source', 'abort']) {
    const ctx = bindings();
    const controller = new AbortController();
    const invoke = api.createVariantRequester(ctx);
    let resolve;
    reply = () =>
      new Promise((done) => {
        resolve = done;
      });
    const pending = invoke(drawing, 0, controller.signal);
    if (invalidate === 'run') ctx.generationRun.current += 1;
    if (invalidate === 'source')
      ctx.reviewTickets.current = { 0: 'new-source-receipt' };
    if (invalidate === 'abort') controller.abort();
    resolve(stream(events));
    await assert.rejects(pending, (error) => error.name === 'AbortError');
    assert.equal(
      ctx.reviewTickets.current[0],
      invalidate === 'source' ? 'new-source-receipt' : undefined,
      `${invalidate}: old terminal error cannot contaminate a newer source/run`,
    );
  }

  const ctx = bindings();
  const invoke = api.createVariantRequester(ctx);
  reply = () => Response.json(ticketError, { status: 502 });
  await assert.rejects(invoke(drawing, 0), api.CharacterRequestError);
  assert.equal(
    ctx.reviewTickets.current[0],
    ticket,
    'Nonstream JSON errors have the identical receipt contract',
  );
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  'character-stream smoke passed: real fragmented NDJSON errors preserve encrypted receipt, one request, binary review retry, success/invalid cleanup, old-run/source/abort guards and JSON parity; offline only.',
);
