import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/forest-adventure-ui.tsx', 'utf8');
const ast = ts.createSourceFile(
  'caption.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const caption = ast.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'ForestMoment',
);
const moments = ast.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (item) => item.name.getText(ast) === 'moments',
    ),
);
assert.ok(caption && moments);
const compiled = ts.transpileModule(
  `${moments.getText(ast)}\n${caption.getText(ast).replace('export function', 'function')}\nForestMoment`,
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

function harness() {
  const state = [],
    timers = new Map();
  let index = 0,
    id = 0,
    effectDeps,
    cleanup,
    dismissals = 0;
  const jsx = (type, props) => ({ type, props });
  const renderCaption = runInNewContext(compiled, {
    exports: {},
    require: (name) => {
      assert.equal(name, 'react/jsx-runtime');
      return { jsx, jsxs: jsx };
    },
    X: 'close-icon',
    useState(initial) {
      const own = index++;
      if (!(own in state)) state[own] = initial;
      return [
        state[own],
        (value) => {
          state[own] = value;
        },
      ];
    },
    useEffect(effect, deps) {
      if (effectDeps && deps.every((value, i) => value === effectDeps[i]))
        return;
      cleanup?.();
      effectDeps = [...deps];
      cleanup = effect();
    },
    setTimeout(fn, delay) {
      assert.equal(delay, 6500);
      timers.set(++id, fn);
      return id;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
  });
  return {
    render() {
      index = 0;
      return renderCaption({
        chapter: 'arrival',
        onDismiss: () => dismissals++,
      });
    },
    timers,
    fire() {
      for (const [key, fn] of timers) {
        timers.delete(key);
        fn();
      }
    },
    dismissals: () => dismissals,
    unmount: () => cleanup?.(),
  };
}
{
  const test = harness();
  let tree = test.render();
  assert.equal(test.timers.size, 1);
  tree.props.onFocusCapture();
  tree = test.render();
  assert.equal(
    test.timers.size,
    0,
    'Focused caption never disappears on its timer.',
  );
  test.fire();
  assert.ok(test.render());
  tree.props.onBlurCapture({
    currentTarget: { contains: () => true },
    relatedTarget: {},
  });
  tree = test.render();
  assert.equal(
    test.timers.size,
    0,
    'Moving inside the caption preserves focus ownership.',
  );
  tree.props.onBlurCapture({
    currentTarget: { contains: () => false },
    relatedTarget: null,
  });
  test.render();
  assert.equal(
    test.timers.size,
    1,
    'Leaving restarts the full reading interval.',
  );
  test.fire();
  assert.equal(test.render(), null);
  assert.equal(test.dismissals(), 0, 'Automatic hiding does not steal focus.');
}
{
  const test = harness();
  const tree = test.render();
  tree.props.children.find((node) => node.type === 'button').props.onClick();
  assert.equal(test.render(), null);
  assert.equal(
    test.dismissals(),
    1,
    'Explicit closing hands focus back to a stable scene control.',
  );
  assert.equal(test.timers.size, 0);
}
{
  const test = harness();
  test.render();
  test.unmount();
  assert.equal(test.timers.size, 0);
}

const memoryComponent = ast.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'ForestMemories',
);
const icons = ast.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (item) => item.name.getText(ast) === 'discoveryIcons',
    ),
);
assert.ok(memoryComponent && icons);
const storyExports = {};
runInNewContext(
  ts.transpileModule(readFileSync('app/forest-story.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: storyExports },
);
const memoryView = runInNewContext(
  ts.transpileModule(
    `${icons.getText(ast)}\n${memoryComponent.getText(ast).replace('export function', 'function')}\nForestMemories`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText,
  {
    ...storyExports,
    exports: {},
    require(name) {
      assert.equal(name, 'react/jsx-runtime');
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx };
    },
  },
);
const visibleText = (node) =>
  Array.isArray(node)
    ? node.map(visibleText).join('')
    : node?.props
      ? visibleText(node.props.children)
      : node == null || typeof node === 'boolean'
        ? ''
        : String(node);
for (const compact of [false, true]) {
  for (let count = 0; count <= 3; count++) {
    const tree = memoryView({
      compact,
      discovered: storyExports.FOREST_DISCOVERY_IDS.slice(0, count),
    });
    assert.match(visibleText(tree), /지금까지 모은 숲의 기억/);
    assert.match(visibleText(tree), /여러 번의 모험에서 모은 기억/);
    assert.ok(visibleText(tree.props.children[0]).includes(`${count} / 3`));
  }
}
console.log(
  'Forest caption smoke passed: focus-safe dismissal, timer cleanup and explicit lifetime discovery totals in both views.',
);
