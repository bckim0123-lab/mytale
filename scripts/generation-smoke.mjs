import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  /style-plush-3d-guide\.webp\?v=\$\{plushReferenceVersion\}[\s\S]{0,140}cache: 'force-cache'/,
  '버전이 고정된 3D 기준 파일은 캐시를 사용해 생성 전 지연을 줄여야 합니다.',
);
assert.match(
  page,
  /new AbortController\(\)[\s\S]{0,500}setTimeout\([\s\S]{0,120}4_000[\s\S]{0,800}style-plush-3d-guide/,
  '구형 모바일에서도 3D 기준 파일이 지연되면 4초 뒤 텍스트 폴백으로 계속해야 합니다.',
);
assert.match(
  page,
  /new Blob\(\[await referenceResponse\.arrayBuffer\(\)\],[\s\S]{0,80}type: 'image\/webp'/,
  '배포 런타임의 MIME 차이와 무관하게 기준 파일 형식을 명시해야 합니다.',
);
assert.match(
  page,
  /headers: \{ Accept: 'application\/x-ndjson' \}/,
  '장시간 생성 요청은 스트림 전송을 명시해야 합니다.',
);
assert.match(
  page,
  /readCharacterStream<CharacterResponse>\(response,[\s\S]{0,180}setGenerationLastActivityAt/,
  '클라이언트가 장시간 생성 스트림의 결과와 실제 heartbeat를 읽어야 합니다.',
);
assert.match(
  page,
  /AI 작업실이 잠깐 쉬고 있어요\. 네 그림에는 문제가 없어요\./,
  '일시 장애는 아이 탓이 아닌 안전한 문구로 알려야 합니다.',
);
assert.match(
  page,
  /고화질 완성은 보통 2–4분[\s\S]{0,1000}AI 캐릭터 예상 진행 단계/,
  '장시간 생성에는 실제 예상 시간과 단계 안내가 보여야 합니다.',
);
assert.match(
  page,
  /기다리며 내 그림으로 놀기[\s\S]{0,1200}이 요청 멈추기/,
  '생성 중에도 즉시 놀기와 오래 걸릴 때 취소하기를 제공해야 합니다.',
);
assert.match(
  page,
  /JPG, PNG, WEBP 그림만 사용할 수 있어요/,
  '지원하지 않는 업로드 형식은 버튼이 멈추지 않고 명확히 알려야 합니다.',
);
assert.doesNotMatch(
  page,
  /accept="image\/\*"/,
  '카메라 파일 입력도 실제 디코딩 가능한 형식만 받아야 합니다.',
);
assert.match(
  page,
  /disabled=\{[\s\S]{0,80}!image \|\| Boolean\(uploadError\)/,
  '새 파일을 읽지 못했을 때 이전 그림으로 잘못 생성하지 못하게 해야 합니다.',
);
assert.match(
  page,
  /const regenerateVariant[\s\S]{0,240}if \(generationFailed && !generationCanRetry\)[\s\S]{0,100}setPick\(index\)/,
  '재시도 제한 중에는 생성 함수가 새 API 요청을 보내면 안 됩니다.',
);
assert.match(
  page,
  /else if \(retryBlocked\) setPick\(i\)/,
  '재시도 제한 중 스타일 카드는 선택만 하고 API 요청은 보내면 안 됩니다.',
);
assert.match(
  page,
  /stopCharacterGeneration\(\);[\s\S]{0,360}setStep\('upload'\)/,
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
  /code: 'rate_limited',[\s\S]{0,100}retryable: true[\s\S]{0,120}retryAfterMs/,
  '사용량 제한은 실제 재시도 대기시간과 함께 전달해야 합니다.',
);
assert.match(
  route,
  /code: 'quality_failed',[\s\S]{0,80}retryable: false/,
  '무섭거나 복수 캐릭터인 결과는 비용이 드는 자동 재생성을 반복하면 안 됩니다.',
);
assert.match(
  route,
  /if \(!alpha\.transparent \|\| !passesCharacterQuality\(review\)\)[\s\S]{0,80}return qualityFailure\(\)/,
  '모든 정상 결과는 서버의 숫자 품질 기준과 투명 알파 검사를 통과해야 합니다.',
);
assert.match(
  route,
  /retryMode: 'review-only',[\s\S]{0,150}reviewTicket: bytesToBase64\(ticket\)/,
  '검수 장애는 미검수 이미지를 표시하지 않고 암호화된 재검사 티켓만 전달해야 합니다.',
);
assert.match(
  route,
  /passed: true,[\s\S]{0,80}tier: 'premium'/,
  '엄격한 품질 기준에 실패한 결과를 ready 등급으로 낮추어 통과시키면 안 됩니다.',
);
assert.doesNotMatch(
  route,
  /tier:[^\n]*'ready'/,
  '기준 미달 캐릭터를 완성본으로 보내는 우회 등급은 없어야 합니다.',
);
assert.match(
  route,
  /edgeTransparentRatio >= 0\.9[\s\S]{0,120}rectangularFillRatio <= 0\.94/,
  '사각 카드나 불투명 캔버스는 픽셀 알파 검사에서 계속 차단해야 합니다.',
);
assert.doesNotMatch(
  `${page}\n${route}`,
  /tier[^\n]*unchecked|=== 'unchecked'/,
  '미검수 AI 이미지를 완성본으로 노출하는 상태가 없어야 합니다.',
);
assert.doesNotMatch(
  route,
  /code: 'invalid_style_reference'/,
  '내부 3D 기준 파일 문제로 핵심 생성을 400에서 중단하면 안 됩니다.',
);
assert.match(
  route,
  /character-style-reference-fallback/,
  '3D 기준 파일 검증 실패를 개인정보 없이 운영 로그에 남겨야 합니다.',
);
assert.match(
  route,
  /신뢰된 3D 스타일 가이드를 불러오지 못했으므로/,
  '3D 기준 파일 검증 실패 시 임의 파일은 버리고 안전한 텍스트 스타일로 계속 생성해야 합니다.',
);
assert.doesNotMatch(
  route,
  /instanceof File/,
  'multipart 파일 검증은 배포 런타임 realm에 민감한 instanceof를 사용하면 안 됩니다.',
);
assert.match(
  route,
  /send\(\{ type: 'accepted' \}\)[\s\S]{0,200}send\(\{ type: 'heartbeat' \}\)/,
  '배포 연결 제한을 넘는 생성은 즉시 응답을 열고 주기적으로 연결을 유지해야 합니다.',
);
assert.match(
  route,
  /'Content-Type': 'application\/x-ndjson; charset=utf-8'/,
  '장시간 생성 응답은 NDJSON 스트림 형식을 명시해야 합니다.',
);
assert.match(
  route,
  /const generationAbort = new AbortController\(\)[\s\S]{0,1000}handleCharacterRequest\(request, operationSignal\)[\s\S]{0,2000}generationAbort\.abort\(\)/,
  '사용자가 스트림을 닫으면 진행 중인 이미지 생성과 품질 검사도 중단해야 합니다.',
);
assert.match(
  route,
  /character-stream-terminal[\s\S]{0,300}status: response\.status/,
  'HTTP 200 스트림 안의 실제 종료 상태를 운영 로그에 남겨야 합니다.',
);
assert.match(
  route,
  /character-stream-accepted/,
  '장시간 요청은 종료 전에도 접수 사실을 운영 로그에 남겨야 합니다.',
);
assert.equal(
  route.match(/api\.openai\.com\/v1\/images\/edits/g)?.length,
  1,
  '최초 생성과 한 번의 보정은 같은 예산 제한 이미지 호출 함수만 사용해야 합니다.',
);
assert.match(
  route,
  /!passesCharacterQuality\(reviewOutcome.review\)[\s\S]{0,160}!isHardQualityFailure\(reviewOutcome.review\)[\s\S]{0,160}CORRECTION_RESERVE_MS/,
  '보정은 검수가 끝난 기준 미달 결과에만, 안전 조건과 남은 시간 예산을 확인한 뒤 해야 합니다.',
);
assert.match(
  route,
  /generationStage = 'review-correction'[\s\S]{0,200}await reviewCuteness\(/,
  '보정된 결과는 원본 검사 결과를 재사용하지 않고 다시 검사해야 합니다.',
);

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-generation-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const {
    imageTypeFromBytes,
    isBinaryFormPart,
    isHardQualityFailure,
    trusted3dReference,
  } = await server.ssrLoadModule('/app/api/character/route.ts');
  const { passesCharacterQuality, CHARACTER_QUALITY_THRESHOLDS } =
    await server.ssrLoadModule('/app/character-quality.ts');
  const usableReview = {
    score: 68,
    sourceFidelity: 65,
    fullBody: 80,
    anatomy: 74,
    styleMatch: 72,
    materialQuality: 70,
    naturalPose: 76,
    singleCharacter: true,
    scaryOrUncanny: false,
    backgroundArtifact: false,
    passed: false,
    issue: '조금 더 다듬기',
  };
  assert.equal(
    isHardQualityFailure(usableReview),
    false,
    '심각한 안전 실패가 아닌 낮은 점수는 한 번 보정할 수 있는 대상입니다.',
  );
  assert.equal(
    passesCharacterQuality(usableReview),
    false,
    '보정 가능한 결과라도 품질 기준 미달이면 아이에게 완성본으로 보여 주면 안 됩니다.',
  );
  assert.equal(
    isHardQualityFailure({ ...usableReview, scaryOrUncanny: true }),
    true,
    '무섭거나 기괴한 결과는 계속 차단해야 합니다.',
  );
  assert.equal(
    isHardQualityFailure({ ...usableReview, singleCharacter: false }),
    true,
    '복수 캐릭터 결과는 계속 차단해야 합니다.',
  );
  assert.equal(
    isHardQualityFailure({ ...usableReview, backgroundArtifact: true }),
    false,
    '배경 아티팩트는 한 번 보정할 수 있지만 정상 결과의 조건은 아닙니다.',
  );
  const passingReview = {
    ...usableReview,
    ...CHARACTER_QUALITY_THRESHOLDS,
    passed: true,
  };
  assert.equal(passesCharacterQuality(passingReview), true);
  assert.equal(
    passesCharacterQuality({ ...passingReview, backgroundArtifact: true }),
    false,
  );
  for (const [key, minimum] of Object.entries(CHARACTER_QUALITY_THRESHOLDS)) {
    assert.equal(
      passesCharacterQuality({ ...passingReview, [key]: minimum - 0.01 }),
      false,
      `${key} 점수를 반올림하거나 무시하여 통과시키면 안 됩니다.`,
    );
  }
  const guideBytes = await readFile('public/style-plush-3d-guide.webp');
  const guideHash = createHash('sha256').update(guideBytes).digest('hex');
  assert.match(
    route,
    new RegExp(guideHash),
    '배포할 3D 기준 파일의 해시와 서버 상수가 일치해야 합니다.',
  );
  const crossRuntimeGuide = new Blob([guideBytes], {
    type: 'application/octet-stream',
  });
  assert.equal(
    isBinaryFormPart(crossRuntimeGuide),
    true,
    '다른 런타임의 Blob도 바이트 기반 검증 대상으로 받아야 합니다.',
  );
  assert.equal(
    imageTypeFromBytes(new Uint8Array(guideBytes)),
    'image/webp',
    '3D 기준 파일 형식은 응답 MIME이 아니라 실제 바이트로 판별해야 합니다.',
  );
  const verifiedGuide = await trusted3dReference(crossRuntimeGuide);
  assert.equal(
    verifiedGuide?.type,
    'image/webp',
    '정상 기준 파일은 런타임 MIME이 달라도 신뢰된 WebP로 정규화해야 합니다.',
  );
  const alteredGuideBytes = new Uint8Array(guideBytes);
  alteredGuideBytes[alteredGuideBytes.length - 1] ^= 1;
  assert.equal(
    await trusted3dReference(
      new Blob([alteredGuideBytes], { type: 'image/webp' }),
    ),
    null,
    '변조된 기준 파일은 모델 입력에서 제외해야 합니다.',
  );

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
  'generation smoke passed: instant safe cutout, one initial client request, strict server quality gate, bounded reviewed correction contract, encrypted review-only retry, on-demand variants',
);
