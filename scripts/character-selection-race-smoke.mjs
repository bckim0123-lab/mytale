import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('app/page.tsx', 'utf8');
const ast = ts.createSourceFile(
  'page.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function find(predicate) {
  let result;
  const visit = (node) => {
    if (!result && predicate(node)) result = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(result, 'Actual repository UI node must exist');
  return result;
}
function evaluate(expression, bindings) {
  const js = ts.transpileModule(`const run = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Execute only parsed repository functions with offline deferred request doubles.
  return new Function(...Object.keys(bindings), `${js};return run;`)(
    ...Object.values(bindings),
  );
}
function value(name, bindings) {
  const node = find(
    (node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name,
  );
  return evaluate(node.initializer.getText(ast), bindings);
}
const card = find(
  (node) =>
    ts.isJsxAttribute(node) &&
    node.name.text === 'onClick' &&
    node.initializer?.expression
      ?.getText(ast)
      .includes('if (waitingForCurrent) return'),
);

for (const handler of ['generateCharacter', 'regenerateVariant'])
  for (const reviewOnly of [false, true])
    for (const outcome of ['success', 'failure', 'canceled']) {
      const state = {
        pick: 2,
        generating: false,
        regenerating: false,
        generated: ['old-A', '', 'old-C'],
        generatedQuality: [],
        generationStatuses: ['ready', 'unrequested', 'ready'],
      };
      const setters = Object.fromEntries(
        [...source.matchAll(/\b(set[A-Z][A-Za-z0-9]*)\(/g)].map(([name]) => [
          name.slice(0, -1),
          (val) => {
            const key = name[3].toLowerCase() + name.slice(4, -1);
            state[key] = typeof val === 'function' ? val(state[key]) : val;
          },
        ]),
      );
      let resolveResult, rejectResult;
      const result = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });
      let requestedIndex,
        requests = 0;
      const generationRun = { current: 0 };
      const generationRequest = { current: null };
      const bindings = {
        ...setters,
        image: 'data:synthetic',
        generating: false,
        regenerating: false,
        generationFailed: false,
        generationCanRetry: true,
        generationRun,
        generationRequest,
        preferredStyle: 0,
        ensureCharacterRequestAllowed: () => true,
        reviewTickets: {
          current: reviewOnly ? { 0: { value: 'receipt' } } : {},
        },
        characterStyleCount: 3,
        characterStyles: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
        fetch: async () => ({ blob: async () => new Blob(['synthetic']) }),
        requestVariant: async (_blob, index) => {
          requestedIndex = index;
          requests++;
          return result;
        },
        rememberGenerationFailure: () => {
          state.generationFailed = true;
        },
      };
      const work = value(handler, bindings)(0, true);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      assert.equal(requests, 1);
      assert.equal(requestedIndex, 0);
      assert.equal(
        state.pick,
        0,
        'Explicitly starting a request initially selects that style',
      );
      const cardClick = evaluate(card.initializer.expression.getText(ast), {
        waitingForCurrent: false,
        generated: state.generated,
        i: 2,
        retryBlocked: false,
        setPick: setters.setPick,
        regenerateVariant: () =>
          assert.fail('Ready-card selection never starts a request'),
      });
      cardClick();
      assert.equal(state.pick, 2);
      const getReview = (tickets) =>
        value('generationReviewOnly', {
          generationBusy: true,
          generationRequestReviewOnly: state.generationRequestReviewOnly,
          pick: state.pick,
          reviewTicketStyles: tickets,
        });
      assert.equal(
        getReview(reviewOnly ? [] : [2]),
        reviewOnly,
        'In-flight request mode cannot change when selecting a different ready card',
      );
      if (outcome === 'canceled') {
        generationRequest.current.abort();
        generationRun.current++;
      }
      if (outcome === 'failure')
        rejectResult(new Error('synthetic provider failure'));
      else
        resolveResult({ index: 0, image: 'new-A', quality: { passed: true } });
      await work;
      assert.equal(
        state.pick,
        2,
        'A late response never replaces the more recent selected friend',
      );
      assert.equal(state.generated[2], 'old-C');
      assert.equal(
        state.generated[0],
        outcome === 'success' ? 'new-A' : 'old-A',
      );
      assert.equal(requests, 1);
    }

for (const pick of [0, 1, 2])
  assert.equal(
    value('generationReviewOnly', {
      generationBusy: false,
      generationRequestReviewOnly: true,
      pick,
      reviewTicketStyles: [1],
    }),
    pick === 1,
    'Idle recovery describes the explicitly selected result',
  );

console.log(
  'Character selection races passed: both real request handlers, new/review-only modes, actual ready-card selection, success/failure/cancel, retained result identities and one-request bound.',
);
