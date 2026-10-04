import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
function compile(path) {
  return ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
}
const engine = {};
runInNewContext(compile('app/forest-toybox-engine.ts'), { exports: engine });
const component = compile('app/forest-toybox.tsx');
function nodes(element, result = []) {
  if (!React.isValidElement(element)) return result;
  result.push(element);
  React.Children.forEach(element.props.children, (child) =>
    nodes(child, result),
  );
  return result;
}
function content(element) {
  if (typeof element === 'string' || typeof element === 'number')
    return String(element);
  return React.Children.toArray(element?.props?.children).map(content).join('');
}
const byClass = (tree, name) =>
  nodes(tree).find((node) => node.props.className?.split(' ').includes(name));
const button = (tree, label) => {
  const found = nodes(tree).find(
    (node) => node.type === 'button' && content(node).includes(label),
  );
  assert.ok(found, `The actual ${label} button is rendered.`);
  return found;
};
const paths = (tree) =>
  nodes(tree)
    .filter((node) => node.type === 'path')
    .map((node) => node.props.d);

function createHarness(kind, difficulty) {
  const fibers = new Map();
  const completed = [];
  const focused = [];
  const keyboard = new Map();
  let current, session, effects, hosts;
  let id = 0;
  let closed = 0;
  class Element {
    constructor(props = {}) {
      this.props = props;
    }
    focus() {
      focused.push(this);
      document.activeElement = this;
    }
    querySelectorAll() {
      return hosts.filter(
        (host) => host.props.type === 'button' && !host.props.disabled,
      );
    }
  }
  const previousFocus = new Element();
  const document = {
    activeElement: previousFocus,
    body: { style: { overflow: 'auto' } },
    addEventListener: (name, listener) => keyboard.set(name, listener),
    removeEventListener: (name) => keyboard.delete(name),
  };
  const hooks = {
    useState(initial) {
      const slot = current.cursor++;
      const fiber = current;
      if (!(slot in fiber.slots))
        fiber.slots[slot] = {
          value: typeof initial === 'function' ? initial() : initial,
        };
      return [
        fiber.slots[slot].value,
        (value) => {
          fiber.slots[slot].value =
            typeof value === 'function'
              ? value(fiber.slots[slot].value)
              : value;
        },
      ];
    },
    useRef(initial) {
      return (current.slots[current.cursor++] ??= { current: initial });
    },
    useId() {
      return (current.slots[current.cursor++] ??= `toy-preview-${++id}`);
    },
    useEffect(work, dependencies) {
      const slot = current.cursor++;
      const previous = current.slots[slot];
      if (
        !previous ||
        dependencies.some(
          (value, index) => !Object.is(value, previous.dependencies[index]),
        )
      ) {
        const next = { dependencies: [...dependencies] };
        current.slots[slot] = next;
        effects.push(() => {
          previous?.cleanup?.();
          next.cleanup = work();
        });
      }
    },
  };
  const exports = {};
  runInNewContext(component, {
    exports,
    document,
    HTMLElement: Element,
    require(name) {
      if (name === 'react') return hooks;
      if (name === './forest-toybox-engine') return engine;
      if (name === './forest-toybox.css') return {};
      assert.equal(name, 'react/jsx-runtime');
      return nativeRequire(name);
    },
  });
  function expand(element, path = 'root') {
    if (!React.isValidElement(element)) return element;
    if (typeof element.type === 'function') {
      const fiberKey = `${path}/${element.type.name}`;
      const fiber = fibers.get(fiberKey) ?? { slots: [], cursor: 0 };
      fibers.set(fiberKey, fiber);
      fiber.cursor = 0;
      current = fiber;
      if (element.type.name === 'ForestToyboxSession') session = fiber;
      return expand(element.type(element.props), `${fiberKey}/output`);
    }
    const children = React.Children.map(element.props.children, (child, i) =>
      expand(child, `${path}/${child?.key ?? i}`),
    );
    const tree = React.cloneElement(element, {}, children);
    if (typeof element.type === 'string') {
      const host = new Element(tree.props);
      hosts.push(host);
      if (tree.props.ref && typeof tree.props.ref === 'object')
        tree.props.ref.current = host;
    }
    return tree;
  }
  return {
    completed,
    focused,
    get state() {
      return session.slots[0].value;
    },
    render() {
      effects = [];
      hosts = [];
      const tree = expand(
        React.createElement(exports.default, {
          kind,
          difficulty,
          companionName: '그림 <친구>',
          sound: false,
          onComplete: (design) => completed.push(design),
          onClose: () => closed++,
        }),
      );
      for (const effect of effects) effect();
      return tree;
    },
    dispose() {
      keyboard.get('keydown')({
        key: 'Escape',
        preventDefault() {},
        stopPropagation() {},
      });
      assert.equal(closed, 1, 'The existing Escape-close handler is retained.');
      for (const fiber of fibers.values())
        for (const slot of fiber.slots) slot?.cleanup?.();
      assert.equal(document.body.style.overflow, 'auto');
      assert.equal(document.activeElement, previousFocus);
      assert.equal(keyboard.size, 0);
    },
  };
}

const fixtures = [];
for (const kind of ['bridge', 'garden'])
  for (const difficulty of ['simple', 'standard', 'challenge']) {
    const test = createHarness(kind, difficulty);
    let tree = test.render();
    assert.equal(
      nodes(tree).some((node) => node.props['data-craft-design']),
      false,
    );
    assert.equal(test.completed.length, 0);
    // Exercise real rotation handlers until the engine's current hint is aligned.
    // Half the cases use keyboard rotation; none inject a solved state.
    let rotations = 0;
    while (test.state.stage === 'puzzle') {
      const index = engine.getForestToyView(test.state).hintIndex;
      const label =
        kind === 'bridge'
          ? `${index + 1}번 나무판 돌리기`
          : `${Math.floor(index / 3) + 1}번째 줄 ${(index % 3) + 1}번째 물길 돌리기`;
      const piece = nodes(tree).find((node) =>
        node.props['aria-label']?.startsWith(label),
      );
      assert.ok(piece && !piece.props.disabled);
      if (difficulty === 'challenge') {
        let prevented = false;
        piece.props.onKeyDown({
          key: 'ArrowRight',
          preventDefault: () => (prevented = true),
        });
        assert.equal(prevented, true);
      } else piece.props.onClick();
      tree = test.render();
      assert.ok(++rotations <= 32, 'Real puzzle controls reach decoration.');
      assert.equal(test.completed.length, 0);
    }
    const undecoratedBoard = byClass(tree, 'ftb-board');
    const progress = JSON.stringify(test.state);
    const live = content(byClass(tree, 'ftb-live'));
    assert.match(live, /장식을 골라 주세요/);
    assert.equal(byClass(tree, 'ftb-live').props['aria-live'], 'polite');
    assert.equal(
      nodes(undecoratedBoard).some((node) => node.props['data-craft-design']),
      false,
    );
    assert.equal(byClass(tree, 'ftb-finish').props.disabled, true);
    assert.equal(button(tree, '반짝이는 별').props['aria-pressed'], false);
    assert.equal(button(tree, '따뜻한 하트').props['aria-pressed'], false);
    assert.equal(test.focused.at(-1).props['aria-pressed'], false);
    const focusCount = test.focused.length;
    const glyphs = {
      star: paths(button(tree, '반짝이는 별')),
      heart: paths(button(tree, '따뜻한 하트')),
    };
    assert.notDeepEqual(glyphs.star, glyphs.heart);
    if (difficulty === 'simple') fixtures.push({ kind, design: 'none', tree });
    let previousMarkup = renderToStaticMarkup(undecoratedBoard);
    for (const [design, label] of [
      ['star', '반짝이는 별'],
      ['heart', '따뜻한 하트'],
    ]) {
      button(tree, label).props.onClick();
      tree = test.render();
      const board = byClass(tree, 'ftb-board');
      const markers = nodes(board).filter(
        (node) => node.props['data-craft-design'],
      );
      assert.equal(markers.length, kind === 'bridge' ? 2 : 1);
      for (const marker of markers) {
        assert.equal(marker.props['data-craft-design'], design);
        assert.deepEqual(
          paths(marker).slice(-2),
          glyphs[design],
          'The board reuses the actual choice glyph, not a second lookalike drawing.',
        );
        assert.equal(
          nodes(marker).some(
            (node) =>
              node.type === 'button' || node.props.tabIndex !== undefined,
          ),
          false,
        );
      }
      assert.equal(button(tree, label).props['aria-pressed'], true);
      assert.equal(byClass(tree, 'ftb-finish').props.disabled, false);
      assert.equal(
        test.completed.length,
        0,
        'Previewing never completes or saves the puzzle.',
      );
      assert.equal(
        JSON.stringify({ ...test.state, design: null }),
        progress,
        'Preview choice does not alter moves, hints, connectivity, stage, or assistance.',
      );
      assert.equal(
        content(byClass(tree, 'ftb-live')),
        live,
        'Preview preserves the existing live announcement flow.',
      );
      assert.equal(
        test.focused.length,
        focusCount,
        'Changing the preview does not steal focus.',
      );
      const markup = renderToStaticMarkup(board);
      assert.notEqual(
        markup,
        previousMarkup,
        'The work itself visibly changes, independently of choice buttons.',
      );
      assert.match(markup, new RegExp(`data-craft-design="${design}"`));
      previousMarkup = markup;
      if (difficulty === 'simple') fixtures.push({ kind, design, tree });
    }
    const finish = byClass(tree, 'ftb-finish');
    finish.props.onClick();
    tree = test.render();
    assert.deepEqual(
      test.completed,
      ['heart'],
      'Only the final explicit selection completes.',
    );
    assert.equal(test.state.stage, 'complete');
    assert.equal(byClass(tree, 'ftb-finish').props.disabled, true);
    finish.props.onClick();
    button(tree, '반짝이는 별').props.onClick();
    assert.deepEqual(
      test.completed,
      ['heart'],
      'Late duplicate handlers cannot complete twice or replace the final design.',
    );
    assert.equal(test.state.design, 'heart');
    test.dispose();
  }

if (process.argv.includes('--write-fixture')) {
  const escape = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  const css = readFileSync('app/forest-toybox.css', 'utf8');
  const views = fixtures.map(({ kind, design, tree }) => {
    const page = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui}${css}</style><body>${renderToStaticMarkup(tree)}</body></html>`;
    return `<section><h2>${kind} / ${design}</h2><iframe title="${kind} ${design}" width="320" height="760" srcdoc="${escape(page)}"></iframe></section>`;
  });
  mkdirSync('outputs', { recursive: true });
  writeFileSync(
    'outputs/forest-toybox-preview-320.html',
    `<!doctype html><html lang="ko"><meta charset="utf-8"><title>실제 퍼즐 JSX · 320px 장식 미리보기</title><style>body{font:14px system-ui;background:#f0f0eb;margin:20px}main{display:flex;flex-wrap:wrap;gap:24px}h2{font-size:16px}iframe{border:1px solid #acb9a7;border-radius:18px;background:#fff}</style><p>합성 상태의 실제 컴포넌트 마크업입니다. 스크립트·저장소·네트워크 요청이 없습니다.</p><main>${views.join('')}</main></html>`,
  );
  console.log(
    'Wrote outputs/forest-toybox-preview-320.html (synthetic actual JSX, six isolated 320px views).',
  );
}
console.log(
  'Forest toy preview passed: real controls across both puzzles × three difficulties, actual shared SVG glyph changes, unselected work, keyboard/focus/live flow, no early completion, final-choice-only completion and late-handler guards.',
);
