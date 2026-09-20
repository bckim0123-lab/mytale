import type { CompanionStoryBook } from './companion-save';

export type StorybookExportOptions = {
  /** Saved companion portrait only. Never pass an original uploaded photograph. */
  image?: string | null;
  name?: string;
  /** Optional already-embedded decorative backgrounds in page order. */
  illustrations?: readonly (string | null | undefined)[];
};

const chapters = [
  '숲이 우리를 불렀어',
  '작은 손으로 만든 길',
  '마음이 닿은 노래',
  '반짝, 우리가 켠 불빛',
  '또 만나, 달빛 숲',
];

export function storybookChapterTitle(
  book: CompanionStoryBook,
  page: number,
): string {
  return (
    book.chapterTitles?.[page] ??
    (book.illustrationTheme
      ? `${page + 1}번째 이야기`
      : chapters[page] || `${page + 1}번째 이야기`)
  );
}

/** Trusted, code-native decorative art shared by the reader and offline book.
 * No child-authored text, URLs, scripts or arbitrary attributes enter this SVG. */
export function storybookWorldSvg(
  theme: NonNullable<CompanionStoryBook['illustrationTheme']>,
  page: number,
): string {
  const palettes = {
    forest: ['#264f54', '#b7cfad', '#75a087'],
    ocean: ['#225775', '#9edbd3', '#70bcb9'],
    cloud: ['#52799e', '#f7ddd8', '#dbcfdd'],
    space: ['#27264f', '#8993ca', '#656794'],
    dino: ['#474562', '#d2be9a', '#7e9985'],
    candy: ['#82546f', '#f7d7c4', '#e6aeae'],
    aurora: ['#173f59', '#c3dbe1', '#94bdbf'],
    garden: ['#305e55', '#d0e3ac', '#8fb477'],
  } as const;
  if (
    !Object.hasOwn(palettes, theme) ||
    !Number.isInteger(page) ||
    page < 0 ||
    page > 99
  )
    throw new TypeError('이야기 그림의 세계와 페이지를 확인해 주세요.');
  const palette = palettes[theme];
  const id = `world-${theme}-${page}`;
  const shift = (page % 4) * 12;
  const sparkles = [
    [86, 85],
    [153, 145],
    [527, 90],
    [458, 197],
    [50, 237],
  ]
    .map(
      ([x, y]) =>
        `<path d="M${x} ${y + shift - 6}q2 5 6 6q-5 2-6 6q-2-5-6-6q5-2 6-6"/>`,
    )
    .join('');
  const cloud = (x: number, y: number, scale = 1) =>
    `<g transform="translate(${x} ${y}) scale(${scale})" fill="#fff6ed"><ellipse cy="8" rx="67" ry="23"/><circle cx="-27" cy="-6" r="27"/><circle cx="13" cy="-19" r="34"/><circle cx="44" cy="-2" r="24"/></g>`;
  const flower = (x: number, y: number, color: string, scale = 1) =>
    `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0 0q15 70 0 130M4 74q-61-54-48-8q8 28 48 17M5 50q58-51 44-9q-9 25-41 21" fill="#65976a" stroke="#578660" stroke-width="5"/>${[0, 60, 120, 180, 240, 300].map((angle) => `<ellipse cy="-22" rx="18" ry="29" fill="${color}" transform="rotate(${angle})"/>`).join('')}<circle r="19" fill="#ffe1a0"/><circle cx="-7" cy="-7" r="6" fill="#fff4ca"/></g>`;
  const jellyfish = `<g transform="translate(${512 - shift} 206)"><path d="M-45 15a45 45 0 0 1 90 0q-11 13-23 0q-11 13-22 0q-11 13-22 0q-12 13-23 0" fill="#efc7e6" opacity=".85"/><path d="M-22 29q-13 27 0 40M0 29q13 32 0 48M23 29q-12 21 0 35" fill="none" stroke="#f4e1ee" stroke-width="5" stroke-linecap="round"/><circle cx="-12" cy="-1" r="3" fill="#545274"/><circle cx="12" cy="-1" r="3" fill="#545274"/><path d="M-4 7q4 4 8 0" fill="none" stroke="#8e6f94" stroke-width="2"/></g>`;
  let motifs = '';
  if (theme === 'ocean')
    motifs = `<g fill="#d1f1ef" opacity=".45">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${80 + (i % 2) * 34}" cy="${210 + i * 47 - shift}" r="${8 + i * 2}" fill="none" stroke="#d2f8f1" stroke-width="3"/>`).join('')}</g>${jellyfish}<g fill="none" stroke-linecap="round"><path d="M32 511q-38-123 11-195q-3 73 24 94M83 518q31-106-1-152" stroke="#518e8b" stroke-width="16"/><path d="M568 511v-86m0 47-34-30m34 9 37-37" stroke="#efa7ac" stroke-width="17"/></g><g transform="translate(${123 + shift} 166)" fill="#fbd69d"><ellipse rx="27" ry="15"/><path d="M-23 0l-17-16v32z"/><circle cx="13" cy="-3" r="3" fill="#527b83"/></g>`;
  if (theme === 'cloud')
    motifs = `${cloud(89, 191 + shift, 0.86)}${cloud(546, 270 - shift, 0.95)}${cloud(82, 450, 1.1)}${cloud(554, 465, 1.2)}<path d="M61 174a108 108 0 0 1 210 0" fill="none" stroke="#f6c9c1" stroke-width="16" opacity=".7"/><path d="M77 174a92 92 0 0 1 178 0" fill="none" stroke="#f4dfb4" stroke-width="12" opacity=".7"/><g fill="#d8eff8">${[0, 1, 2].map((i) => `<path d="M${500 + i * 22} ${323 + shift + i * 14}q-13 18 0 22q13-4 0-22"/>`).join('')}</g>`;
  if (theme === 'space')
    motifs = `<g transform="translate(${116 + shift} 179) rotate(-18)"><ellipse rx="79" ry="22" fill="none" stroke="#d6bddf" stroke-width="10"/><circle r="46" fill="#edc9bc"/><path d="M-38-20q40 24 79 9M-40 13q42 25 77 8" stroke="#dca4a8" stroke-width="9" fill="none"/><ellipse rx="79" ry="22" fill="none" stroke="#e8d7e8" stroke-width="8" stroke-dasharray="125 280"/></g><g transform="translate(525 ${318 - shift}) rotate(12)"><path d="M-23 25v-69q0-35 23-47q23 12 23 47v69z" fill="#fff0d9"/><circle cy="-37" r="13" fill="#a6c8db"/><path d="M-23-6q-32 5-30 43l30-12M23-6q32 5 30 43L23 25" fill="#e6b4c4"/><path d="M-10 31q10 53 20 0" fill="#ffdb96"/></g><g fill="#f6d99c">${sparkles}</g>`;
  if (theme === 'dino')
    motifs = `<g fill="#5a6b69" opacity=".75"><path d="M18 415V161q0-56 54-56h63v310zM505 415V105h63q54 0 54 56v254z"/><path d="M-5 200h145v13H-5m510-13h145v13H505" fill="#bfa082"/></g><g>${[0, 1, 2, 3].map((i) => `<rect x="${29 + i * 25}" y="${160 - (i % 2) * 15}" width="19" height="40" rx="5" fill="${['#d7b096', '#aec7b3', '#d4b4ca', '#e4ce9e'][i]}"/><rect x="${519 + i * 25}" y="${160 - (i % 2) * 15}" width="19" height="40" rx="5" fill="${['#c3adc8', '#d5c199', '#93b8b2', '#c89596'][i]}"/>`).join('')}</g><g transform="translate(105 382)"><path d="M-53 81q-12-68 40-82q12-15 13-65q-5-31 22-32q35-1 35 32q0 20-30 19q-4 33 19 52q36 28 16 76z" fill="#a5bf91"/><ellipse cx="-1" cy="39" rx="43" ry="42" fill="#bbd0a4"/><circle cx="34" cy="-75" r="4" fill="#465d52"/><path d="M23-61q8 5 15 0" fill="none" stroke="#6c8869" stroke-width="3"/><path d="M-23 76v17M26 76v17" stroke="#89aa7c" stroke-width="18" stroke-linecap="round"/></g>`;
  if (theme === 'candy')
    motifs = `<g transform="translate(90 301)"><path d="M0 0v183" stroke="#f8ebda" stroke-width="11"/><circle r="56" fill="#f5c6cf"/><path d="M0 0q-31-10-15-31q23-21 43 3q25 33-12 55q-43 19-61-26" fill="none" stroke="#fff0de" stroke-width="15" stroke-linecap="round"/></g><g transform="translate(526 403)"><path d="M-65 96V0l32-55L0 0V-55l29-45 30 45V96z" fill="#e7c3d8"/><path d="M-65 0l32-55L0 0M0-55l29-45 30 45" fill="#f3dec5"/><rect x="-25" y="40" width="31" height="56" rx="16" fill="#ad8faa"/><circle cx="-33" cy="20" r="9" fill="#fff0d5"/><circle cx="30" cy="5" r="10" fill="#fff0d5"/></g>${cloud(526, 190 - shift, 0.65)}`;
  if (theme === 'aurora')
    motifs = `<g fill="none" stroke-linecap="round" opacity=".43"><path d="M-40 173Q150 42 277 140T689 114" stroke="#9be4c4" stroke-width="48"/><path d="M-30 206Q165 70 294 177T679 150" stroke="#beafe5" stroke-width="25"/></g><path d="M-20 488q326-71 680-2M-20 507q326-72 680-2" stroke="#7d9da7" stroke-width="5" fill="none"/><g transform="translate(86 430)"><rect x="-48" y="-54" width="91" height="53" rx="12" fill="#dbb3ad"/><path d="M-52-54h99" stroke="#ede6d8" stroke-width="12" stroke-linecap="round"/><rect x="-34" y="-42" width="21" height="24" rx="6" fill="#f7e0a1"/><rect x="5" y="-42" width="21" height="24" rx="6" fill="#f7e0a1"/><circle cx="-26" cy="5" r="11" fill="#607d86"/><circle cx="22" cy="5" r="11" fill="#607d86"/></g><path d="M462 389l44-61 46 61zM516 420l43-71 49 71z" fill="#e4efea"/>`;
  if (theme === 'garden')
    motifs = `${flower(86, 263 + shift, '#edc5c5', 1.2)}${flower(553, 314 - shift, '#ded0ed', 1.0)}${flower(33, 451, '#f4dcad', 0.58)}<g transform="translate(507 434)"><path d="M-30 63V7h61v56" fill="#efdfbc"/><path d="M-54 14q0-83 54-77q55-6 56 77z" fill="#dba9a8"/><ellipse cx="-20" cy="-11" rx="11" ry="8" fill="#fff0dc"/><ellipse cx="19" cy="-34" rx="10" ry="8" fill="#fff0dc"/><rect x="-7" y="28" width="18" height="34" rx="9" fill="#a78d72"/></g><g fill="#d4f0d0" opacity=".8"><circle cx="486" cy="201" r="7"/><circle cx="150" cy="341" r="5"/></g>`;
  if (theme === 'forest')
    motifs = `<g fill="#284f43" opacity=".65"><path d="M-30 493V0h83q-23 148 9 299l-4 194M585 506V0h87v506"/><ellipse cx="42" cy="25" rx="152" ry="85"/><ellipse cx="609" cy="58" rx="151" ry="88"/></g><circle cx="477" cy="132" r="40" fill="#f6e6bd"/><g fill="#fff0bc">${sparkles}</g><path d="M48 486q17-31 54-17q13 24 34 8M503 460q33-26 65 11" fill="none" stroke="#85ad88" stroke-width="14" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="scene-art" data-world="${theme}" viewBox="0 0 640 520" aria-hidden="true"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs><rect width="640" height="520" fill="url(#${id})"/><g fill="#fff3d3" opacity=".5">${sparkles}</g><path d="M0 461q172-66 321-8q173-76 319-8v75H0z" fill="${palette[2]}" opacity=".6"/><path d="M0 506q192-65 337-16q163-49 303-6v36H0z" fill="${palette[1]}"/>${motifs}<ellipse cx="320" cy="484" rx="145" ry="20" fill="${palette[0]}" opacity=".13"/></svg>`;
}
const routeWords = { river: '첨벙! 시냇물 길', garden: '톡톡! 비밀 정원' };
const owlWords = {
  listen: '천천히 해도 괜찮아. 내가 들어줄게.',
  invite: '우리 같이 부르자!',
};
const endingWords = {
  sky: '밤하늘에 별을 띄워 줄래',
  home: '친구들의 집 앞을 밝혀 줄래',
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

/** Raster allowlist: a data URL can never introduce scripts, SVG or remote loads. */
function imageData(value: string | null | undefined): string | null {
  if (!value) return null;
  if (
    value.length > 12 * 1024 * 1024 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new TypeError(
      '책에 넣을 그림은 9MB 이하의 PNG, JPEG, WebP 기기 이미지여야 해요.',
    );
  }
  const comma = value.indexOf(',');
  const data = value.slice(comma + 1);
  if (data.length % 4 !== 0)
    throw new TypeError('책에 넣을 그림 파일을 읽지 못했어요.');
  const prefix = atob(data.slice(0, 32));
  const type = value.slice(11, value.indexOf(';'));
  const valid =
    type === 'png'
      ? prefix.startsWith('\x89PNG\r\n\x1a\n')
      : type === 'jpeg'
        ? prefix.startsWith('\xff\xd8\xff')
        : prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP';
  if (!valid) throw new TypeError('책에 넣을 그림의 형식을 확인하지 못했어요.');
  return value;
}

function forestArt(page: number, book: CompanionStoryBook): string {
  const river = page === 1 && book.choices?.route === 'river';
  const flowers = page === 1 && book.choices?.route === 'garden';
  const owl = page === 2;
  const lanterns = page >= 3;
  const id = `scene-${page + 1}`;
  const stars = [
    [77, 112],
    [169, 73],
    [474, 119],
    [527, 65],
    [427, 183],
    [100, 261],
  ]
    .map(
      ([x, y]) =>
        `<path d="M${x} ${y - 7}q2 5 7 7q-5 2-7 7q-2-5-7-7q5-2 7-7"/>`,
    )
    .join('');
  const blossom = (x: number, y: number, color: string) =>
    `<g transform="translate(${x} ${y})"><path d="M0 5v48m0-10q-25-22-25-4q5 12 25 14m0-25q20-18 23-3q-6 11-23 12" fill="#76926b" stroke="#76926b" stroke-width="3"/>${[0, 60, 120, 180, 240, 300].map((angle) => `<ellipse cy="-11" rx="10" ry="17" fill="${color}" transform="rotate(${angle})"/>`).join('')}<circle r="9" fill="#e3ae59"/></g>`;
  return `<svg class="scene-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 520" aria-hidden="true">
  <defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#254d51"/><stop offset="1" stop-color="#b8cbb5"/></linearGradient><radialGradient id="${id}-moon"><stop stop-color="#fff8d6"/><stop offset="1" stop-color="#f1d6a0"/></radialGradient></defs>
  <rect width="640" height="520" fill="url(#${id})"/><circle cx="447" cy="103" r="79" fill="#fff2c6" opacity=".06"/><circle cx="447" cy="103" r="55" fill="#fff2c6" opacity=".08"/><circle cx="447" cy="103" r="34" fill="url(#${id}-moon)"/>
  <g fill="#fff1b7" opacity=".8">${stars}</g>
  <g fill="#264f47" opacity=".62"><path d="M-35 470V-10H50q-23 120 15 240l-15 240zM590 500V-10h74v510z"/><ellipse cx="43" cy="23" rx="153" ry="86"/><ellipse cx="629" cy="57" rx="151" ry="93"/></g>
  <g fill="#5d826e" opacity=".7"><ellipse cx="27" cy="360" rx="89" ry="74"/><ellipse cx="588" cy="376" rx="112" ry="84"/></g>
  <path d="M0 430q165-90 300-13q160-79 340-1v104H0z" fill="#98b197"/><path d="M0 478q170-88 338-5q141-56 302-1v48H0z" fill="#bfcea9"/>
  ${river ? `<path d="M0 480q190-63 328-3t312-9v52H0z" fill="#9acdd0"/><path d="M80 486q241-98 474-18" fill="none" stroke="#765245" stroke-width="25" stroke-linecap="round"/>${Array.from({ length: 9 }, (_, index) => `<path d="M${100 + index * 53} ${472 - Math.sin((index / 8) * Math.PI) * 42}l-5 32" stroke="${index % 2 ? '#d7a77c' : '#eccca0'}" stroke-width="41" stroke-linecap="round"/>`).join('')}` : ''}
  ${flowers ? blossom(100, 407, '#e9abc0') + blossom(523, 416, '#f0cf7b') + blossom(566, 466, '#d3b9df') + blossom(58, 474, '#f2e0a3') : ''}
  ${owl ? `<g transform="translate(514 317)"><ellipse cy="28" rx="40" ry="48" fill="#a8816d"/><ellipse cy="32" rx="27" ry="32" fill="#f3dcba"/><path d="M-35-8l3-27 22 20M35-8l-3-27-22 20" fill="#9c735f"/><circle cx="-17" r="20" fill="#fff1d1"/><circle cx="17" r="20" fill="#fff1d1"/><circle cx="-16" cy="2" r="8" fill="#493a35"/><circle cx="18" cy="2" r="8" fill="#493a35"/><circle cx="-18" r="2.5" fill="white"/><circle cx="16" r="2.5" fill="white"/><path d="M-6 17h12l-6 10z" fill="#e6ae66"/><path d="M-49 76q49-10 95 0" fill="none" stroke="#78604e" stroke-width="10" stroke-linecap="round"/></g>${book.choices?.owl === 'invite' ? '<text x="459" y="229" fill="#ffedb3" font-size="35">♪</text><text x="555" y="269" fill="#ffedb3" font-size="29">♫</text>' : '<g fill="#fff8a0"><circle cx="464" cy="214" r="3"/><circle cx="570" cy="254" r="4"/><circle cx="533" cy="191" r="3"/></g>'}` : ''}
  ${
    lanterns
      ? Array.from({ length: 8 }, (_, index) => {
          const x = 63 + ((index * 89) % 530);
          const y =
            book.choices?.ending === 'home'
              ? 390 + (index % 3) * 37
              : 90 + ((index * 67) % 225);
          return `<g transform="translate(${x} ${y})"><circle r="27" fill="#ffe7a1" opacity=".13"/><path d="M-8-9q8-5 16 0l-2 19h-12z" fill="#ffdfa0"/><path d="M-5 12h10" stroke="#b58d5d" stroke-width="2"/></g>`;
        }).join('')
      : ''
  }
  </svg>`;
}

function hero(image: string | null, name: string, cover = false): string {
  return image
    ? `<img class="hero${cover ? ' cover-hero' : ''}" src="${image}" alt="${escapeHtml(name)}의 저장된 모습"/>`
    : `<div class="hero-placeholder"><span aria-hidden="true">✧</span><strong>${escapeHtml(name)}</strong><small>이 이야기의 주인공</small></div>`;
}

/** An offline, script-free keepsake. No uploads, chats or metadata are serialized. */
export function exportStorybookHtml(
  book: CompanionStoryBook,
  options: StorybookExportOptions = {},
): string {
  if (
    !book ||
    !Array.isArray(book.pages) ||
    !book.pages.length ||
    book.pages.length > 100 ||
    typeof book.title !== 'string' ||
    typeof book.ending !== 'string' ||
    Array.from(book.pages).some((page) => typeof page !== 'string') ||
    (book.chapterTitles !== undefined &&
      (!Array.isArray(book.chapterTitles) ||
        book.chapterTitles.length !== book.pages.length ||
        Array.from(book.chapterTitles).some(
          (chapter) =>
            typeof chapter !== 'string' ||
            !chapter.trim() ||
            Array.from(chapter).length > 80,
        )))
  ) {
    throw new TypeError('동화책의 제목과 페이지를 확인해 주세요.');
  }
  const name = book.heroName || options.name || '우리 친구';
  // Validate even when there are no raster backgrounds; arbitrary world strings
  // must never be interpolated into SVG attributes.
  if (book.illustrationTheme !== undefined)
    storybookWorldSvg(book.illustrationTheme, 0);
  const portrait = imageData(options.image);
  const backgrounds = (options.illustrations ?? []).map(imageData);
  const date = new Date(book.createdAt);
  const dateLabel = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date)
    : '우리의 이야기가 만들어진 날';
  const choices = book.choices;
  const choiceLines: [string, string][] = [];
  if (choices?.route && Object.hasOwn(routeWords, choices.route))
    choiceLines.push(['우리가 고른 길', routeWords[choices.route]]);
  if (choices?.owl && Object.hasOwn(owlWords, choices.owl))
    choiceLines.push(['부엉이에게 건넨 말', owlWords[choices.owl]]);
  if (choices?.ending && Object.hasOwn(endingWords, choices.ending))
    choiceLines.push(['마지막 빛을 보낸 곳', endingWords[choices.ending]]);
  const title = escapeHtml(book.title);
  const safeName = escapeHtml(name);
  const ending =
    book.ending === 'sky' || book.ending === 'home'
      ? (book.pages.at(-1) ?? '')
      : book.ending;
  const missingChoices = book.illustrationTheme
    ? '우리가 고른 행동은 각 장의 이야기에 담겨 있어요. 마음에 남은 장면을 함께 떠올려 보세요.'
    : '이전에 만든 책이라 선택 기록은 남아 있지 않아요. 이야기 속 장면을 함께 떠올려 보세요.';
  const sheets = book.pages
    .map((text, index) => {
      const heading = storybookChapterTitle(book, index);
      const choice =
        index === 1
          ? choiceLines.find(([label]) => label === '우리가 고른 길')
          : index === 2
            ? choiceLines.find(([label]) => label === '부엉이에게 건넨 말')
            : index === book.pages.length - 1
              ? choiceLines.find(([label]) => label === '마지막 빛을 보낸 곳')
              : undefined;
      return `<section class="sheet story-page" aria-labelledby="chapter-${index + 1}" data-story-page="${index + 1}">
      <div class="illustration">${book.illustrationTheme ? storybookWorldSvg(book.illustrationTheme, index) : backgrounds[index] ? `<img class="scene-art" src="${backgrounds[index]}" alt=""/>` : forestArt(index, book)}${hero(portrait, name)}<div class="art-caption"><span>${title}</span><strong>${escapeHtml(heading)}</strong></div></div>
      <div class="paper"><span class="eyebrow">우리의 이야기 · ${String(index + 1).padStart(2, '0')}</span><h2 id="chapter-${index + 1}">${escapeHtml(heading)}</h2><p class="story-text">${escapeHtml(text)}</p>${choice ? `<aside class="choice"><span>${escapeHtml(choice[0])}</span><q>${escapeHtml(choice[1])}</q></aside>` : ''}<footer><span>나와 ${safeName}, 우리가 고른 이야기</span><b>${index + 1} / ${book.pages.length}</b></footer></div>
    </section>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"/>
<meta name="referrer" content="no-referrer"/><title>${title} · 그림친구 동화책</title>
<style>
:root{color-scheme:light;--ink:#344c43;--paper:#fffdf5;--gold:#b39765;--line:#e5dac2}*{box-sizing:border-box}html{background:#e9e5db;color:var(--ink);font-family:"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}body{margin:0;padding:32px 16px 64px}h1,h2,p{margin:0}main{max-width:960px;margin:auto}.guide{max-width:760px;margin:0 auto 22px;text-align:center;font-size:13px;line-height:1.8;color:#586d62}.sheet{position:relative;background:var(--paper);border:1px solid var(--line);box-shadow:0 16px 60px #35453518;margin:0 0 32px;overflow:visible;break-after:page;page-break-after:always}.cover{min-height:840px;padding:66px 48px 42px;text-align:center;background:radial-gradient(ellipse at 50% 47%,#dae8d3 0%,#f5eedf 52%,#fffcf3 78%);display:flex;flex-direction:column;align-items:center}.cover::before,.afterword::before{content:"";position:absolute;inset:22px;border:1px solid #bca57e;pointer-events:none}.cover .eyebrow{letter-spacing:.2em;color:#7e785b}.cover h1{max-width:660px;font-size:44px;line-height:1.4;letter-spacing:-.055em;text-wrap:balance;margin:18px 0 0;overflow-wrap:anywhere;word-break:keep-all}.cover .hero-wrap{position:relative;width:100%;height:455px;margin:10px 0}.hero-wrap::after{content:"";position:absolute;bottom:24px;left:29%;width:42%;height:18px;border-radius:50%;background:#74866d25;filter:blur(8px)}.hero{position:absolute;left:17%;bottom:0;width:66%;height:82%;object-fit:contain;filter:drop-shadow(0 12px 10px #21362a2b);z-index:2}.cover-hero{left:16%;width:68%;height:100%;z-index:2}.cover-subtitle{font-size:18px;font-weight:650;line-height:1.8;overflow-wrap:anywhere}.date{font-size:12px;color:#81785f;margin-top:12px}.brand{font-size:12px;letter-spacing:.17em;color:#8b846b;margin-top:auto;padding-top:30px}.story-page{display:flex;flex-direction:column;min-height:800px}.illustration{height:405px;position:relative;isolation:isolate;overflow:hidden;background:#6f8d7e}.scene-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.art-caption{position:absolute;z-index:3;left:24px;right:24px;top:23px;color:#fff6df;text-align:center;text-shadow:0 2px 14px #152c33}.art-caption span{display:block;font-size:11px;letter-spacing:.07em}.art-caption strong{display:block;font-size:23px;line-height:1.5;margin-top:8px;letter-spacing:-.04em}.paper{padding:38px 55px 28px;flex:1;background:radial-gradient(ellipse at 100% 0,#f3e6c94d,transparent 65%),var(--paper)}.eyebrow{font-size:11px;font-weight:700;color:#8d7d60;letter-spacing:.1em}.paper h2{font-size:25px;line-height:1.5;margin:10px 0 20px;letter-spacing:-.04em}.story-text{font-size:20px;line-height:1.95;letter-spacing:-.02em;word-break:keep-all;overflow-wrap:anywhere;white-space:pre-wrap;orphans:3;widows:3}.choice{margin:24px 0 0;padding:15px 20px;border-left:3px solid #bba675;background:#f2eedf}.choice span{display:block;font-size:10px;letter-spacing:.05em;color:#8a7657;margin-bottom:7px}.choice q{font-size:15px;line-height:1.7;font-weight:650;quotes:"“" "”";overflow-wrap:anywhere}.paper footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #e9e1cf;margin-top:28px;padding-top:16px;font-size:10px;color:#968b73;line-height:1.6}.paper footer b{white-space:nowrap;font-weight:500}.hero-placeholder{position:absolute;inset:25% 12% 10%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fffae7}.hero-placeholder span{font-size:96px;line-height:1.2;color:#f9da97}.hero-placeholder strong{font-size:28px;overflow-wrap:anywhere}.hero-placeholder small{font-size:12px;margin-top:10px}.cover .hero-placeholder{color:var(--ink)}.afterword{padding:64px 62px;min-height:760px;background:radial-gradient(ellipse at 10% 0,#e3ecd6aa,transparent 65%),var(--paper)}.afterword h2{font-size:29px;line-height:1.5;letter-spacing:-.05em;margin:12px 0 24px}.ending{font-size:21px;line-height:1.9;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}.keepsake{margin:30px 0;padding:23px;background:#f1eee1;border-radius:3px}.keepsake h3{font-size:14px;margin:0 0 18px}.keepsake ol{margin:0;padding:0;list-style:none}.keepsake li+li{margin-top:20px}.keepsake li span{display:block;font-size:11px;color:#8a775a;margin-bottom:7px}.keepsake q{font-size:16px;line-height:1.7}.questions{padding-top:24px;border-top:1px solid var(--line)}.questions h3{font-size:18px;line-height:1.5}.questions p{font-size:15px;line-height:1.9;margin:12px 0}.small-print{font-size:11px!important;color:#7c806e;line-height:1.8!important}.sheet:last-child{break-after:auto;page-break-after:auto}
@media(max-width:600px){body{padding:12px 9px 30px}.guide{font-size:11px;padding:0 15px}.sheet{margin-bottom:18px}.cover{min-height:650px;padding:48px 28px 34px}.cover h1{font-size:31px}.cover .hero-wrap{height:340px}.cover-subtitle{font-size:15px}.illustration{height:310px}.paper{padding:28px 27px}.paper h2{font-size:23px}.story-text{font-size:18px;line-height:1.95}.story-page{min-height:0}.afterword{min-height:0;padding:48px 36px}.afterword h2{font-size:25px}.ending{font-size:19px}.art-caption strong{font-size:20px}.cover::before,.afterword::before{inset:14px}}
@media print{@page{size:A4 portrait;margin:12mm}html,body{background:white;padding:0;margin:0}.guide{display:none}main{max-width:none}.sheet{width:100%;margin:0;border:0;box-shadow:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}.cover{min-height:270mm;padding:19mm 13mm 13mm}.cover h1{font-size:32pt}.cover .hero-wrap{height:142mm}.cover-subtitle{font-size:15pt}.story-page{min-height:270mm}.illustration{height:121mm;flex-shrink:0}.paper{padding:11mm 13mm 9mm}.story-text{font-size:14pt;line-height:1.9}.paper h2{font-size:20pt}.choice{break-inside:avoid;page-break-inside:avoid}.afterword{min-height:270mm;padding:18mm 16mm}.questions,.keepsake{break-inside:avoid;page-break-inside:avoid}.cover::before,.afterword::before{inset:5mm}.hero,.hero-wrap::after{filter:none}h1,h2,h3{break-after:avoid;page-break-after:avoid}}
</style></head><body><p class="guide">우리의 동화책을 파일로 간직했어요. 인터넷 없이 열어 볼 수 있어요.<br/>종이에 담고 싶을 때는 브라우저의 인쇄 메뉴에서 A4 또는 PDF 저장을 골라 주세요.</p>
<main><section class="sheet cover" aria-labelledby="book-title"><span class="eyebrow">우리가 만든 동화책</span><h1 id="book-title">${title}</h1><div class="hero-wrap">${hero(portrait, name, true)}</div><p class="cover-subtitle">나와 ${safeName}, 우리가 고른 이야기</p><p class="date">${escapeHtml(dateLabel)}</p><span class="brand">그림친구 · OUR LITTLE STORY</span></section>
${sheets}
<section class="sheet afterword" aria-labelledby="afterword-title"><span class="eyebrow">이야기는 끝나도, 마음은 여기</span><h2 id="afterword-title">우리의 마지막 장면</h2><p class="ending">${escapeHtml(ending)}</p><div class="keepsake"><h3>모험에서 우리가 고른 말</h3>${choiceLines.length ? `<ol>${choiceLines.map(([label, words]) => `<li><span>${escapeHtml(label)}</span><q>${escapeHtml(words)}</q></li>`).join('')}</ol>` : `<p class="small-print">${missingChoices}</p>`}</div><div class="questions"><h3>책을 덮고, 잠깐 도란도란</h3><p>${choices?.route === 'garden' ? '우리가 심은 꽃에 이름을 붙인다면 뭐라고 할까?' : choices?.route === 'river' ? '다리가 완성됐을 때 누가 제일 먼저 건너가면 좋겠어?' : '오늘 이야기에서 가장 마음에 든 장면은 어디였어?'}</p><p>${choices?.owl === 'invite' ? '우리와 함께 노래하고 싶은 친구는 누구야?' : choices?.owl === 'listen' ? '누군가 조용히 기다려 줘서 좋았던 적이 있어?' : '다음에는 친구와 어떤 곳으로 가 보고 싶어?'}</p><p class="small-print">정답은 없어요. 아이의 이야기를 듣고, 어른의 이야기도 하나 들려주세요.</p></div><p class="small-print">이 파일에는 동화책과 선택 기록${portrait ? ', 친구의 그림' : ''}만 담았어요. 원본 사진이나 대화 기록은 담지 않았어요.${!book.heroName || !book.heroAppearance ? ' 이전 책에 주인공의 모습이 저장되지 않았다면, 파일을 만들 때 선택한 친구의 모습으로 담았어요.' : ''}</p></section></main></body></html>`;
}
