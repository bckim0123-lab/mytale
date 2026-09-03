import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const ages = new Map([
  ['4–6세', 3],
  ['7–9세', 4],
  ['10–12세', 5],
]);
const traits = ['kindness', 'curiosity', 'courage', 'creativity'];
const sceneIndexes = [0, 1, 2, 3, 4];

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const play = await server.ssrLoadModule('/app/adventure-play.ts');
  const stories = await server.ssrLoadModule('/app/adventures.ts');
  const { questOrder, questPositionsForChoice, questTargetCount, sceneQuests } =
    play;
  const { adventureStories, traitMeta } = stories;

  for (const [age, expectedCount] of ages) {
    assert.equal(
      questTargetCount(age),
      expectedCount,
      `${age} target 수는 ${expectedCount}여야 합니다.`,
    );
  }

  assert.deepEqual(
    Object.keys(traitMeta).sort(),
    [...traits].sort(),
    '모험 trait 계약이 예상과 다릅니다.',
  );

  for (const [age, count] of ages) {
    for (const sceneIndex of sceneIndexes) {
      const layoutSignatures = new Set();

      for (const trait of traits) {
        const order = questOrder(sceneIndex, count, trait);
        assert.equal(
          order.length,
          count,
          `${age} ${sceneIndex + 1}장 ${trait} order 길이가 잘못됐습니다.`,
        );
        assert.equal(
          new Set(order).size,
          order.length,
          `${age} ${sceneIndex + 1}장 ${trait} order에 중복이 있습니다.`,
        );
        assert.ok(
          order.every(
            (target) =>
              Number.isInteger(target) && target >= 0 && target < count,
          ),
          `${age} ${sceneIndex + 1}장 ${trait} order가 유효 범위를 벗어났습니다.`,
        );

        const layout = questPositionsForChoice(sceneIndex, trait);
        assert.ok(
          Array.isArray(layout) && layout.length >= count,
          `${age} ${sceneIndex + 1}장 ${trait} layout target이 부족합니다.`,
        );
        const visibleLayout = layout.slice(0, count);
        for (const position of visibleLayout) {
          assert.ok(
            Number.isFinite(position.x) &&
              Number.isFinite(position.y) &&
              Number.isFinite(position.rotate),
            `${age} ${sceneIndex + 1}장 ${trait} layout 값이 유효하지 않습니다.`,
          );
          assert.ok(
            position.x >= 0 &&
              position.x <= 100 &&
              position.y >= 0 &&
              position.y <= 100,
            `${age} ${sceneIndex + 1}장 ${trait} layout이 무대 밖에 있습니다.`,
          );
        }
        layoutSignatures.add(JSON.stringify(visibleLayout));
      }

      assert.equal(
        layoutSignatures.size,
        traits.length,
        `${age} ${sceneIndex + 1}장은 선택 trait마다 다른 layout이어야 합니다.`,
      );
    }
  }

  assert.equal(
    sceneQuests.length,
    sceneIndexes.length,
    '5장 퀘스트가 필요합니다.',
  );
  assert.equal(
    new Set(sceneQuests.map((quest) => quest.id)).size,
    sceneQuests.length,
    '퀘스트 id는 중복될 수 없습니다.',
  );
  for (const quest of sceneQuests) {
    assert.ok(
      typeof quest.juniorInstruction === 'string' &&
        quest.juniorInstruction.trim().length > 0,
      `${quest.id}에 4–6세용 juniorInstruction이 필요합니다.`,
    );
  }

  assert.ok(adventureStories.length > 0, '최소 한 개의 모험이 필요합니다.');
  assert.equal(
    new Set(adventureStories.map((story) => story.id)).size,
    adventureStories.length,
    '모험 id는 중복될 수 없습니다.',
  );

  for (const story of adventureStories) {
    assert.equal(
      story.scenes.length,
      5,
      `${story.id} 모험은 정확히 5장이어야 합니다.`,
    );
    assert.ok(
      typeof story.reward === 'string' && story.reward.trim().length > 0,
      `${story.id} 모험 보상이 필요합니다.`,
    );

    for (const trait of traits) {
      assert.ok(
        typeof story.endings?.[trait] === 'string' &&
          story.endings[trait].trim().length > 0,
        `${story.id} 모험에 ${trait} 결말이 필요합니다.`,
      );
    }

    story.scenes.forEach((scene, sceneIndex) => {
      for (const field of ['chapter', 'title', 'body']) {
        assert.ok(
          typeof scene[field] === 'string' && scene[field].trim().length > 0,
          `${story.id} ${sceneIndex + 1}장에 ${field} 데이터가 필요합니다.`,
        );
      }
      assert.ok(
        Array.isArray(scene.choices) && scene.choices.length >= 3,
        `${story.id} ${sceneIndex + 1}장에는 선택이 3개 이상 필요합니다.`,
      );
      assert.equal(
        new Set(scene.choices.map((choice) => choice.label)).size,
        scene.choices.length,
        `${story.id} ${sceneIndex + 1}장의 선택 문구가 중복됩니다.`,
      );
      for (const choice of scene.choices) {
        assert.ok(
          traits.includes(choice.trait),
          `${story.id} ${sceneIndex + 1}장 선택의 trait가 유효하지 않습니다.`,
        );
        for (const field of ['label', 'result', 'clue']) {
          assert.ok(
            typeof choice[field] === 'string' &&
              choice[field].trim().length > 0,
            `${story.id} ${sceneIndex + 1}장 선택에 ${field} 데이터가 필요합니다.`,
          );
        }
      }
    });

    for (const choice of story.scenes.at(-1).choices) {
      assert.ok(
        story.endings[choice.trait]?.trim(),
        `${story.id} 마지막 선택 ${choice.label}에 연결된 결말이 없습니다.`,
      );
    }
  }

  const pageSource = await readFile('app/page.tsx', 'utf8');
  const finishStart = pageSource.indexOf('const finishAdventureTransition');
  const finishEnd = pageSource.indexOf('const continueAdventure', finishStart);
  const finishBlock = pageSource.slice(finishStart, finishEnd);
  assert.ok(
    finishStart >= 0 && finishEnd > finishStart,
    '동화 완성 전이를 찾을 수 없습니다.',
  );
  assert.ok(
    finishBlock.includes('setSavedStorybooks'),
    '완성된 동화를 보관함에 추가해야 합니다.',
  );
  assert.ok(
    !finishBlock.includes('setSavedStorybooks([])'),
    '동화 완성 직후 보관함을 초기화하면 안 됩니다.',
  );
  const replayLabel = pageSource.indexOf('같은 세계 다시 모험하기');
  const replayBlock = pageSource.slice(
    Math.max(0, replayLabel - 650),
    replayLabel,
  );
  assert.ok(replayLabel >= 0, '같은 세계 재플레이 동작을 찾을 수 없습니다.');
  assert.ok(
    !replayBlock.includes('setStorybook(null)'),
    '재플레이를 시작할 때 첫 동화책을 삭제하면 안 됩니다.',
  );

  console.log(
    `adventure smoke passed: ${ages.size} ages, ${sceneQuests.length} quests, ${adventureStories.length} stories`,
  );
} finally {
  await server.close();
}
