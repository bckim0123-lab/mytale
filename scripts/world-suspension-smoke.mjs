import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const runtime = readFileSync('app/companion-world-runtime.ts', 'utf8');
const ast = ts.createSourceFile(
  'runtime.ts',
  runtime,
  ts.ScriptTarget.Latest,
  true,
);
function findAll(root, predicate) {
  const result = [];
  function visit(node) {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return result;
}
function actualFunction(name) {
  const node = findAll(
    ast,
    (item) => ts.isFunctionDeclaration(item) && item.name?.text === name,
  )[0];
  assert.ok(node, `Actual runtime function ${name} exists`);
  return node.getText(ast);
}
const code = ts.transpileModule(
  `
let paused = true, disposed = false, frame = 0, last = 1000, elapsed = 7;
let visible = true, home = false, destination = null;
let scheduled = 0, stopped = 0;
const document = { hidden: false };
const keys = new Set();
const joystick = { lengthSq: () => 0 };
const moveVector = { set: () => { throw new Error('scene-work-reached'); } };
const requestAnimationFrame = () => ++scheduled;
const stop = () => stopped++;
${actualFunction('animate')}
${actualFunction('setPaused')}
({ animate, setPaused, snapshot: () => ({ paused, frame, last, elapsed, scheduled, stopped }),
   hidden: value => document.hidden = value, visible: value => visible = value,
   disposed: value => disposed = value });
`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const world = runInNewContext(code);
world.animate(1060);
assert.equal(
  world.snapshot().elapsed,
  7,
  'covered world does not advance animations or simulation',
);
assert.equal(
  world.snapshot().last,
  1060,
  'paused frame updates clock so resume cannot jump',
);
assert.equal(
  world.snapshot().scheduled,
  1,
  'only one lightweight next frame remains scheduled',
);
world.setPaused(true);
assert.equal(
  world.snapshot().stopped,
  1,
  'opening a covering dialog cancels travel/input',
);
world.setPaused(false);
assert.equal(world.snapshot().paused, false);
assert.equal(
  world.snapshot().stopped,
  1,
  'resuming does not reconstruct or restart the scene',
);
world.hidden(true);
world.animate(1110);
assert.equal(
  world.snapshot().elapsed,
  7,
  'background-tab suspension remains effective',
);
world.hidden(false);
world.visible(false);
world.animate(1160);
assert.equal(
  world.snapshot().elapsed,
  7,
  'idle offscreen suspension remains effective',
);
world.visible(true);
assert.throws(
  () => world.animate(1200),
  /scene-work-reached/,
  'uncovering resumes the actual scene path',
);
assert.equal(world.snapshot().elapsed, 7.04);
const beforeDispose = world.snapshot().scheduled;
world.disposed(true);
world.animate(1250);
assert.equal(
  world.snapshot().scheduled,
  beforeDispose,
  'disposed world never reschedules',
);

const wrapper = readFileSync('app/companion-world.tsx', 'utf8');
const wrapperAst = ts.createSourceFile(
  'wrapper.tsx',
  wrapper,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const mount = findAll(
  wrapperAst,
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(wrapperAst) === 'mountCompanionWorld',
)[0];
assert.ok(
  mount.arguments[1].properties.some(
    (node) =>
      ts.isPropertyAssignment(node) &&
      node.name.getText(wrapperAst) === 'paused' &&
      node.initializer.getText(wrapperAst) === 'latest.current.paused',
  ),
  'lazy world mount receives the latest covering-dialog state',
);
const effects = findAll(
  wrapperAst,
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(wrapperAst) === 'useEffect',
);
const mountEffect = effects.find((node) =>
  node.arguments[0].getText(wrapperAst).includes('mountCompanionWorld'),
);
assert.doesNotMatch(
  mountEffect.arguments[1].getText(wrapperAst),
  /paused/,
  'pause never remounts or loses forest position',
);
const pauseEffect = effects.find((node) =>
  node.arguments[0].getText(wrapperAst).includes('world.setPaused'),
);
assert.match(pauseEffect.arguments[1].getText(wrapperAst), /props\.paused/);
assert.match(
  pauseEffect.arguments[0].getText(wrapperAst),
  /if \(props\.paused\)[\s\S]*queueMicrotask[\s\S]*if \(!canceled\) stop\(\)/,
  'wrapper releases captured joystick and held keys too',
);
const experience = readFileSync('app/companion-experience.tsx', 'utf8');
assert.equal(
  (
    experience.match(
      /paused=\{Boolean\(book \|\| chat \|\| settings \|\| toybox\)\}/g,
    ) || []
  ).length,
  2,
  'home and forest both pause under every full-cover dialog',
);
const css = readFileSync('app/companion.css', 'utf8');
assert.match(
  css,
  /\.cw-world-forest \.cw-webgl\s*\{\s*touch-action:\s*pan-y;/,
  'forest allows vertical reading gestures',
);
assert.match(
  wrapper,
  /style=\{\{ touchAction: 'none' \}\}/,
  'joystick retains dedicated game gestures',
);
console.log(
  'World suspension passed: actual frame guard/clock, dialog pause/resume, lazy mount, no remount, disposal and forest-only vertical scrolling.',
);
