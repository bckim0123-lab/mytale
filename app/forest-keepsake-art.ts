import type { CompanionStoryBook } from './companion-save';
import { FOREST_DISCOVERIES } from './forest-story';

type Discovery = keyof typeof FOREST_DISCOVERIES;
export type ForestKeepsake = {
  friend: '수달 모모' | '토끼 포포';
  route: 'river' | 'garden';
  design: 'star' | 'heart';
  designLabel: string;
  discoveries: Discovery[];
  discoveryLabels: string[];
};

/** Only edition-two forest books have a handmade marker. Never retrofit history. */
export function getForestKeepsake(
  book: CompanionStoryBook,
): ForestKeepsake | null {
  const choices = book.choices;
  if (
    book.illustrationTheme ||
    !choices ||
    (choices.craftDesign !== 'star' && choices.craftDesign !== 'heart') ||
    (choices.route !== 'river' && choices.route !== 'garden')
  )
    return null;
  const discoveries: Discovery[] = [];
  if (Array.isArray(choices.discoveries)) {
    for (const item of choices.discoveries) {
      if (
        (item === 'secret-star' ||
          item ===
            (choices.route === 'river' ? 'secret-shell' : 'secret-mushroom')) &&
        !discoveries.includes(item as Discovery)
      )
        discoveries.push(item as Discovery);
    }
  }
  return {
    friend: choices.route === 'river' ? '수달 모모' : '토끼 포포',
    route: choices.route,
    design: choices.craftDesign,
    designLabel: `${choices.craftDesign === 'star' ? '별' : '하트'}${choices.route === 'river' ? '표 다리' : ' 모양 물길'}`,
    discoveries,
    discoveryLabels: discoveries.map((id) => FOREST_DISCOVERIES[id].label),
  };
}

/** Shared memory labels for the app's last spread and the offline keepsake. */
export function forestKeepsakeMemory(
  book: CompanionStoryBook,
): [string, string][] {
  const memory = getForestKeepsake(book);
  return memory
    ? [
        ['함께 걸은 숲 친구', memory.friend],
        ['우리 손으로 만든 것', memory.designLabel],
        [
          '주머니에 간직한 발견',
          memory.discoveryLabels.length
            ? memory.discoveryLabels.join(' · ')
            : '이번 모험에는 발견물을 모으지 않았어요.',
        ],
      ]
    : [];
}

const star =
  '<path d="m0-17 5 11 12 2-9 8 2 12-10-5-10 5 2-12-9-8 12-2z" fill="#f1d286" stroke="#bd9355" stroke-width="1.5"/><path d="m-2-9 2-3 3 7" stroke="#fff1c2" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
const heart =
  '<path d="M0 15C-28-3-13-23 0-10C13-23 28-3 0 15Z" fill="#eca6af" stroke="#c7808d" stroke-width="1.5"/><path d="M-10-7q0-6 5-5" stroke="#ffe2df" stroke-width="2.5" fill="none" stroke-linecap="round"/>';

function discoveryIcon(id: Discovery): string {
  if (id === 'secret-shell')
    return '<path d="M-15 3q-5-17 5-16q9-11 17-3q14-2 14 13L9 18H-3z" fill="#e8b5ae" stroke="#af807e" stroke-width="1.5"/><path d="M3 13-7-10m11 23 1-24m0 25L15-9" fill="none" stroke="#f6dbce" stroke-width="2"/><path d="M-2 17h13" stroke="#c59a8b" stroke-width="3" stroke-linecap="round"/>';
  if (id === 'secret-mushroom')
    return '<rect x="-5" y="-2" width="13" height="23" rx="6" fill="#f5dfb1" stroke="#ae9c72" stroke-width="1.5"/><path d="M-18 1q-2-24 18-24q21 1 23 24Z" fill="#dda9b3" stroke="#ac7e87" stroke-width="1.5"/><circle cx="-7" cy="-7" r="4" fill="#fff0d4"/><circle cx="7" cy="-14" r="4" fill="#fff0d4"/>';
  return `<circle r="23" fill="#fff1a3" opacity=".2"/>${star}`;
}

/**
 * Trusted code-native SVG shared by the reader and downloaded HTML. All output
 * fragments, attributes and labels are constants or bounded numbers selected by
 * enum checks above; no user name, book text or raw discovery ID is interpolated.
 */
export function forestKeepsakeSvg(
  book: CompanionStoryBook,
  page: number,
): string {
  const memory = getForestKeepsake(book);
  if (!memory || !Number.isInteger(page) || page < 1 || page > 4) return '';
  const otter = memory.route === 'river';
  const waving = page === 4 || (page === 2 && book.choices?.owl === 'invite');
  const icon = memory.design === 'star' ? star : heart;
  const fur = otter ? '#bd9278' : '#f5eadb';
  const outline = otter ? '#946d58' : '#c4b4a2';
  const visibleDiscoveries = memory.discoveries.filter(
    (id) => id !== 'secret-star' || page >= 3,
  );
  const accessories = visibleDiscoveries
    .map(
      (id, index) =>
        `<g data-discovery="${id}" transform="translate(${42 + index * 51} 250) scale(.66)">${discoveryIcon(id)}</g>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="forest-keepsake-art" data-forest-friend="${otter ? 'otter' : 'bunny'}" data-craft-design="${memory.design}" viewBox="0 0 200 274" role="img" aria-label="${memory.friend}와 ${memory.designLabel}">
  <ellipse cx="106" cy="239" rx="73" ry="11" fill="#284634" opacity=".17"/>
  ${otter ? '<path d="M140 214q47 12 38-34q-5-14-9-7q0 22-29 19Z" fill="#aa7e65" stroke="#946d58" stroke-width="2"/>' : '<circle cx="148" cy="203" r="20" fill="#fff7e9" stroke="#d4c5af" stroke-width="2"/>'}
  <ellipse cx="107" cy="186" rx="47" ry="48" fill="${fur}" stroke="${outline}" stroke-width="2"/>
  <ellipse cx="106" cy="186" rx="29" ry="36" fill="${otter ? '#f0d5af' : '#fff9ed'}"/>
  <ellipse cx="76" cy="227" rx="21" ry="12" fill="${fur}" stroke="${outline}" stroke-width="2"/><ellipse cx="135" cy="227" rx="21" ry="12" fill="${fur}" stroke="${outline}" stroke-width="2"/>
  ${otter ? '<circle cx="65" cy="89" r="20" fill="#bd9278" stroke="#946d58" stroke-width="2"/><circle cx="145" cy="89" r="20" fill="#bd9278" stroke="#946d58" stroke-width="2"/><circle cx="65" cy="89" r="11" fill="#e0b4a0"/><circle cx="145" cy="89" r="11" fill="#e0b4a0"/>' : '<ellipse cx="81" cy="61" rx="16" ry="47" transform="rotate(-13 81 61)" fill="#f5eadb" stroke="#c4b4a2" stroke-width="2"/><ellipse cx="81" cy="58" rx="8" ry="33" transform="rotate(-13 81 58)" fill="#e6b8b6"/><ellipse cx="130" cy="65" rx="16" ry="45" transform="rotate(16 130 65)" fill="#f5eadb" stroke="#c4b4a2" stroke-width="2"/><ellipse cx="130" cy="62" rx="8" ry="31" transform="rotate(16 130 62)" fill="#e6b8b6"/>'}
  <ellipse cx="105" cy="119" rx="59" ry="47" fill="${fur}" stroke="${outline}" stroke-width="2"/>
  <ellipse cx="105" cy="137" rx="36" ry="25" fill="${otter ? '#f3dabc' : '#fff9ed'}"/>
  <ellipse cx="63" cy="137" rx="12" ry="7" fill="#e5a4a1" opacity=".65"/><ellipse cx="146" cy="137" rx="12" ry="7" fill="#e5a4a1" opacity=".65"/>
  <ellipse cx="82" cy="115" rx="9" ry="11" fill="#40322b"/><ellipse cx="129" cy="115" rx="9" ry="11" fill="#40322b"/><circle cx="79" cy="111" r="3.4" fill="#fffdf0"/><circle cx="126" cy="111" r="3.4" fill="#fffdf0"/><circle cx="85" cy="119" r="1.5" fill="#fffdf0"/><circle cx="132" cy="119" r="1.5" fill="#fffdf0"/>
  <path d="M98 132q7-5 14 0q0 7-7 8q-7-1-7-8Z" fill="${otter ? '#785748' : '#d39797'}"/><path d="M105 140v4q-5 7-10 1m10-1q5 7 10 1" stroke="#926956" stroke-width="2" fill="none" stroke-linecap="round"/>
  ${otter ? '<path d="M80 158q24 10 48-1l-10 20-13-8-11 11z" fill="#7dafa3" stroke="#5d8c81" stroke-width="1.5"/>' : '<path d="M81 157q25 11 48 0l-12 18-12-6-11 9z" fill="#d7b1b6" stroke="#b68d97" stroke-width="1.5"/>'}
  <ellipse cx="62" cy="183" rx="14" ry="26" transform="rotate(24 62 183)" fill="${fur}" stroke="${outline}" stroke-width="2"/>
  <ellipse cx="151" cy="${waving ? 163 : 183}" rx="14" ry="26" transform="rotate(${waving ? -55 : -24} 151 ${waving ? 163 : 183})" fill="${fur}" stroke="${outline}" stroke-width="2"/>
  <g data-handmade-marker="true" transform="translate(43 206)"><path d="M0 15v28" stroke="#a57b56" stroke-width="8" stroke-linecap="round"/><rect x="-23" y="-26" width="46" height="46" rx="9" fill="#ebc99e" stroke="#ab8159" stroke-width="2"/><path d="M-15-19h28" stroke="#f9dfb8" stroke-width="3" stroke-linecap="round"/>${icon}</g>
  ${page === 3 ? '<g transform="translate(161 208)"><path d="M-11-5q11-8 22 0l-3 23h-16z" fill="#f7d189" stroke="#b59560" stroke-width="1.5"/><path d="M-5-8v-5q5-5 10 0v5" fill="none" stroke="#8a7a5a" stroke-width="2"/><circle cy="6" r="5" fill="#fff3b7"/></g>' : ''}
  ${accessories}</svg>`;
}
