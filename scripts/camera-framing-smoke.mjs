import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';

const cssText = readFileSync('app/globals.css', 'utf8');
const css = postcss.parse(cssText);
function property(selector, name) {
  let value;
  css.walkRules(selector, (rule) => {
    if (rule.parent.type !== 'root') return;
    rule.walkDecls(name, (declaration) => {
      value = declaration.value;
    });
  });
  return value;
}
assert.equal(property('.camera-frame video', 'object-fit'), 'contain');
assert.equal(property('.camera-frame video', 'display'), 'block');
assert.equal(property('.camera-status', 'display'), 'block');
for (const size of ['width', 'height'])
  assert.ok(parseFloat(property('.camera-close', size)) >= 44);
for (const size of ['min-width', 'min-height'])
  assert.ok(
    parseFloat(
      property('.camera-controls > button:not(.camera-shutter)', size),
    ) >= 44,
  );
assert.equal(property('.camera-shutter:disabled', 'cursor'), 'wait');
assert.ok(Number(property('.camera-shutter:disabled', 'opacity')) < 1);
assert.equal(
  property('.camera-shutter:enabled:active span', 'transform'),
  'scale(0.86)',
);

let checked = 0;
const aspects = [
  [16, 9],
  [9, 16],
  [4, 3],
  [3, 4],
  [1, 1],
];
for (const width of [280, 320, 390, 680]) {
  const height = (width * 3) / 4;
  for (const [w, h] of aspects) {
    const scale = Math.min(width / w, height / h);
    const x = (width - w * scale) / 2;
    const y = (height - h * scale) / 2;
    assert.ok(x >= -1e-9 && y >= -1e-9);
    assert.ok(x + w * scale <= width + 1e-9);
    assert.ok(y + h * scale <= height + 1e-9);
    checked += 1;
  }
}
// The former cover policy excludes a real portion of non-4:3 sources.
const oldScale = Math.max(320 / 16, 240 / 9);
assert.ok(16 * oldScale > 320);

if (process.argv.includes('--write-fixture')) {
  const rawCss = cssText.replace(/^@import[^;]+;/gm, '');
  function poster(w, h) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * 100} ${h * 100}"><rect width="100%" height="100%" fill="#f5ddce"/><rect x="15" y="15" width="${w * 100 - 30}" height="${h * 100 - 30}" rx="24" fill="none" stroke="#477b61" stroke-width="16"/><g fill="#477b61"><circle cx="70" cy="70" r="24"/><circle cx="${w * 100 - 70}" cy="70" r="24"/><circle cx="70" cy="${h * 100 - 70}" r="24"/><circle cx="${w * 100 - 70}" cy="${h * 100 - 70}" r="24"/></g><circle cx="${w * 50}" cy="${h * 50}" r="${Math.min(w, h) * 25}" fill="#fff7e3"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="60" fill="#355341">${w}:${h}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  const panels = aspects.map(([w, h]) => {
    const doc = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${rawCss}\nbody{margin:0;padding:10px;background:#fdf8ee;font:14px system-ui}*{box-sizing:border-box}</style><body><p>합성 포스터 ${w}:${h} · 실제 카메라 없음</p><section class="camera-live"><div class="camera-frame"><video muted playsinline poster="${poster(w, h)}" aria-label="${w}:${h} 전체 프레임 검수"></video><button class="camera-close" aria-label="카메라 닫기">×</button></div><div class="camera-controls"><button>전환</button><button class="camera-shutter" aria-label="그림 사진 촬영" disabled><span></span></button><button>닫기</button></div><output class="camera-status" aria-live="polite">새 영상이 준비되면 촬영할 수 있어요.</output><small>검수용 도형으로 가장자리 표시를 확인합니다.</small></section></body></html>`;
    return `<iframe title="320px ${w}:${h} 전체 프레임" srcdoc="${doc.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" style="width:320px;height:500px;border:0"></iframe>`;
  });
  mkdirSync('outputs', { recursive: true });
  writeFileSync(
    'outputs/camera-framing-320-oct4.html',
    `<!doctype html><html lang="ko"><meta charset="utf-8"><title>실제 카메라 CSS · 합성 포스터 전체 프레임 검수</title><body style="margin:0;display:flex;gap:16px;flex-wrap:wrap;background:#e8e6dd">${panels.join('')}</body></html>`,
  );
}
console.log(
  `Camera framing passed: actual CSS contain/disabled/hit-target contracts, ${checked} source and viewport combinations, cover negative control; no real camera or hardware claim.`,
);
