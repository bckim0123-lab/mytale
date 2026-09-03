import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile('app/page.tsx', 'utf8');
const route = await readFile('app/api/character/route.ts', 'utf8');

assert.match(
  page,
  /const characterGenerationOrder = \[2, 1, 0\] as const/,
  '보송 3D 친구를 첫 순서로 생성해야 합니다.',
);
assert.match(
  page,
  /for \(const \[queueIndex, index\] of characterGenerationOrder\.entries\(\)\)/,
  '캐릭터 변형은 한 번에 하나씩 순차 생성해야 합니다.',
);
assert.doesNotMatch(
  page,
  /Promise\.all(?:Settled)?\(variants\)/,
  '고화질 캐릭터 요청을 동시에 실행하면 안 됩니다.',
);
assert.match(
  page,
  /revealedFirst && automaticRetryAvailable/,
  '첫 결과 전에는 실패한 3D 요청이 다음 스타일을 막지 않아야 합니다.',
);
assert.match(
  page,
  /stopCharacterGeneration\(\);[\s\S]{0,180}setStep\('upload'\)/,
  '취향 화면으로 돌아갈 때 남은 생성 대기열을 취소해야 합니다.',
);
assert.match(
  route,
  /code: 'service_unconfigured',[\s\S]{0,80}retryable: false/,
  'API 키 누락은 자동 재시도하면 안 됩니다.',
);
assert.match(
  route,
  /code: 'upstream_busy',[\s\S]{0,80}retryable: true/,
  '일시적인 이미지 API 실패만 재시도 가능해야 합니다.',
);
assert.match(
  route,
  /code: 'quality_failed',[\s\S]{0,80}retryable: false/,
  '귀여움 품질 탈락은 비용이 드는 자동 재생성을 반복하면 안 됩니다.',
);

console.log(
  'generation smoke passed: 3D-first sequential queue and typed retries',
);
