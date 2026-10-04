import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync('app/adventure-world-3d.tsx', 'utf8');
const ast = ts.createSourceFile(
  'world.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let loader, condition;
function visit(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(ast) === 'loadCharacter'
  )
    loader = node;
  if (
    ts.isIfStatement(node) &&
    node.expression.getText(ast) === 'desiredImage !== requestedImage'
  )
    condition = node;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(loader && condition);
const code = ts.transpileModule(
  `const ${loader.getText(ast)}; ({ loadCharacter, frame: (desiredImage: string) => { ${condition.getText(ast)} } });`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
function fixture() {
  const calls = [],
    installed = [];
  let failures = 0;
  const context = {
    textureRequest: 0,
    requestedImage: '',
    disposed: false,
    DEFAULT_CHARACTER_ASSET: 'fallback',
    THREE: {
      TextureLoader: class {
        loadAsync(source) {
          return new Promise((resolve, reject) =>
            calls.push({ source, resolve, reject }),
          );
        }
      },
    },
    installCharacterTexture: (texture) => installed.push(texture.source),
    failToFallback: () => failures++,
  };
  return {
    calls,
    installed,
    context,
    runtime: runInNewContext(code, context),
    failures: () => failures,
    texture: (source) => ({
      source,
      disposed: false,
      dispose() {
        this.disposed = true;
      },
    }),
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const first = fixture();
first.context.requestedImage = 'broken';
let ready = false;
const initial = first.runtime.loadCharacter('broken').then(() => {
  ready = true;
});
first.calls[0].reject(new Error('missing'));
await settle();
assert.deepEqual(
  first.calls.map((call) => call.source),
  ['broken', 'fallback'],
);
assert.equal(ready, false, 'Fallback must settle before ready');
for (let i = 0; i < 120; i++) first.runtime.frame('broken');
assert.equal(first.calls.length, 2, 'No per-frame failed-source reload');
first.calls[1].resolve(first.texture('fallback'));
await initial;
assert.deepEqual(first.installed, ['fallback']);
first.runtime.frame('new');
assert.equal(first.calls[2].source, 'new');
first.calls[2].resolve(first.texture('new'));
await settle();
first.runtime.frame('broken');
assert.equal(
  first.calls[3].source,
  'broken',
  'Explicit source change permits retry',
);
first.calls[3].resolve(first.texture('broken'));
await settle();
const race = fixture();
const a = race.runtime.loadCharacter('A'),
  b = race.runtime.loadCharacter('B');
race.calls[1].resolve(race.texture('B'));
await b;
race.calls[0].reject(new Error('late failure'));
await a;
assert.equal(race.calls.length, 2, 'Late A failure cannot replace B');
assert.deepEqual(race.installed, ['B']);
const stale = race.runtime.loadCharacter('C');
race.context.disposed = true;
const staleTexture = race.texture('C');
race.calls[2].resolve(staleTexture);
await stale;
assert.equal(staleTexture.disposed, true);
const disposed = fixture();
const pending = disposed.runtime.loadCharacter('A');
disposed.context.disposed = true;
disposed.calls[0].reject(new Error('late disposal'));
await pending;
assert.equal(disposed.calls.length, 1);
const failure = fixture();
const failed = failure.runtime.loadCharacter('A');
failure.calls[0].reject(new Error('original'));
await settle();
failure.calls[1].reject(new Error('fallback'));
await failed;
assert.equal(failure.failures(), 1);
assert.match(
  source,
  /requestedImage = latestProps.current.image \|\| DEFAULT_CHARACTER_ASSET;\s*await loadCharacter\(requestedImage\)/,
);
console.log(
  'PASS actual adventure texture loader: fallback/readiness/reload suppression/source replacement/stale/disposal/failure. No image requests.',
);
