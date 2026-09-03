import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const page = await readFile('app/page.tsx', 'utf8');
const route = await readFile('app/api/character/route.ts', 'utf8');
const generateStart = page.indexOf('const generateCharacter = async');
const generateEnd = page.indexOf('const regenerateVariant = async');
const initialGeneration = page.slice(generateStart, generateEnd);

assert.ok(
  generateStart >= 0 && generateEnd > generateStart,
  '최초 생성 함수 범위를 찾을 수 없습니다.',
);
assert.match(
  page,
  /const characterGenerationOrder = \[2, 1, 0\] as const/,
  '스타일 선택 화면은 추천 3D를 첫 카드로 보여야 합니다.',
);
assert.match(
  initialGeneration,
  /const requestedStyle = preferredStyle/,
  '최초 AI 생성은 아이가 고른 한 스타일만 사용해야 합니다.',
);
assert.equal(
  initialGeneration.match(/await requestVariant\(/g)?.length,
  1,
  '최초 생성 흐름은 AI 이미지 요청을 정확히 한 번만 해야 합니다.',
);
assert.match(
  initialGeneration,
  /requestVariant\(blob, requestedStyle, signal, true\)/,
  '핵심 첫 AI 캐릭터는 고화질로 생성해야 합니다.',
);
assert.doesNotMatch(
  initialGeneration,
  /for \(|Promise\.all|requestVariantWithRetry/,
  '최초 생성 흐름은 숨은 다중 생성이나 자동 재시도를 하면 안 됩니다.',
);
assert.match(
  initialGeneration,
  /setStep\('character'\);[\s\S]*await requestVariant/,
  'AI 응답을 기다리지 않고 기기 미리보기 친구를 먼저 만나야 합니다.',
);
assert.match(
  page,
  /generated\[pick\] \|\| activeLocalPreview\?\.image \|\| image/,
  'AI가 지연되거나 실패해도 기기 미리보기로 계속 놀 수 있어야 합니다.',
);
assert.match(
  page,
  /const storyCharacterImage = playImage \|\| chosenImage/,
  '대화와 모험을 시작한 캐릭터 이미지는 이야기 도중 고정해야 합니다.',
);
assert.match(
  page,
  /setPlayImageSource\(selectedHasAiCharacter \? 'ai' : 'local'\)/,
  '이야기 캐릭터의 이미지 출처도 이미지와 함께 고정해야 합니다.',
);
assert.match(
  page,
  /새 AI 모습이 도착했어요![\s\S]{0,700}지금 바꾸기[\s\S]{0,500}이야기 뒤에/,
  '늦게 도착한 AI 모습은 아이가 적용 시점을 직접 골라야 합니다.',
);
assert.match(
  page,
  /스타일 예시 · 내 그림의 결과가 아니에요/,
  '스타일 샘플을 실제 AI 결과처럼 오해하지 않도록 표시해야 합니다.',
);
assert.doesNotMatch(
  page,
  /preview-v[012]/,
  '스타일별 CSS 필터를 AI 결과처럼 보여 주면 안 됩니다.',
);
assert.match(
  page,
  /AI 작업실이 잠깐 쉬고 있어요\. 네 그림에는 문제가 없어요\./,
  '일시 장애는 아이 탓이 아닌 안전한 문구로 알려야 합니다.',
);
assert.match(
  page,
  /stopCharacterGeneration\(\);[\s\S]{0,180}setStep\('upload'\)/,
  '취향 화면으로 돌아갈 때 진행 중인 생성을 취소해야 합니다.',
);
assert.match(
  route,
  /code: 'service_unconfigured',[\s\S]{0,80}retryable: false/,
  'API 키 누락은 자동 재시도하면 안 됩니다.',
);
assert.match(
  route,
  /code: 'upstream_busy',[\s\S]{0,80}retryable: true/,
  '일시적인 이미지 API 실패는 재시도 가능 상태로 응답해야 합니다.',
);
assert.match(
  route,
  /code: 'quality_failed',[\s\S]{0,80}retryable: false/,
  '귀여움 품질 탈락은 비용이 드는 자동 재생성을 반복하면 안 됩니다.',
);
assert.equal(
  route.match(/api\.openai\.com\/v1\/images\/edits/g)?.length,
  1,
  '서버의 사용자 요청 한 건에는 GPT Image 호출 경로가 하나만 있어야 합니다.',
);
const postStart = route.indexOf('export async function POST');
const postRoute = route.slice(postStart);
assert.equal(
  postRoute.match(/await reviewCuteness\(/g)?.length,
  1,
  '품질 검사도 숨은 자동 재시도 없이 한 번만 실행해야 합니다.',
);

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { removeConnectedPaperBackground } = await server.ssrLoadModule(
    '/app/local-character-preview.ts',
  );
  const width = 11;
  const height = 11;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels.set([248, 246, 238, 255], index * 4);
  }
  for (let y = 3; y <= 7; y += 1) {
    for (let x = 3; x <= 7; x += 1) {
      const perimeter = x === 3 || x === 7 || y === 3 || y === 7;
      pixels.set(
        perimeter ? [45, 49, 53, 255] : [255, 255, 255, 255],
        (y * width + x) * 4,
      );
    }
  }
  const cutout = removeConnectedPaperBackground(pixels, width, height);
  assert.equal(cutout.cutout, true, '종이 배경 분리가 성공해야 합니다.');
  assert.equal(cutout.pixels[3], 0, '가장자리 종이 배경은 투명해야 합니다.');
  assert.equal(
    cutout.pixels[(5 * width + 5) * 4 + 3],
    255,
    '외곽선 안의 흰색 눈·몸통은 지우면 안 됩니다.',
  );

  const uniform = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1)
    uniform.set([250, 248, 244, 255], index * 4);
  const fallback = removeConnectedPaperBackground(uniform, width, height);
  assert.equal(
    fallback.cutout,
    false,
    '피사체를 확신할 수 없으면 원본을 보존해야 합니다.',
  );
  assert.equal(
    fallback.pixels[3],
    255,
    '불확실한 입력은 투명하게 지우면 안 됩니다.',
  );

  const deskPhoto = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1)
    deskPhoto.set([121, 86, 57, 255], index * 4);
  for (let y = 2; y <= 8; y += 1)
    for (let x = 2; x <= 8; x += 1)
      deskPhoto.set([249, 247, 240, 255], (y * width + x) * 4);
  const wholePaper = removeConnectedPaperBackground(deskPhoto, width, height);
  assert.equal(
    wholePaper.cutout,
    false,
    '책상만 지우고 종이 사각형 전체를 캐릭터로 오인하면 안 됩니다.',
  );
} finally {
  await server.close();
}

console.log(
  'generation smoke passed: instant safe cutout, one initial AI request, on-demand variants',
);
