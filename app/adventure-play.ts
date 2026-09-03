import type { AdventureDecision, AdventureTrait } from './adventures';

export type SceneQuestKind = 'seek' | 'echo' | 'bridge' | 'comfort' | 'rhythm';

export type SceneQuest = {
  id: string;
  kind: SceneQuestKind;
  eyebrow: string;
  title: string;
  instruction: string;
  juniorInstruction: string;
  success: string;
  symbols: string[];
  ordered: boolean;
};

export const sceneQuests: SceneQuest[] = [
  {
    id: 'light-finder',
    kind: 'seek',
    eyebrow: '손가락 탐험',
    title: '숨어 있는 빛을 깨워요',
    instruction: '장면 곳곳의 반짝임을 찾아 톡톡 눌러 주세요.',
    juniorInstruction: '반짝이 세 개를 찾아 톡톡!',
    success: '우와! 숨어 있던 길이 전부 깨어났어요.',
    symbols: ['✦', '✧', '●', '★', '◇'],
    ordered: false,
  },
  {
    id: 'forest-echo',
    kind: 'echo',
    eyebrow: '빛의 암호',
    title: '깜빡이는 순서를 따라가요',
    instruction: '먼저 반짝이는 빛부터 차례로 눌러 암호를 이어 주세요.',
    juniorInstruction: '반짝이는 빛부터 세 번 톡!',
    success: '딩동! 길이 우리 노래를 기억했어요.',
    symbols: ['♩', '♪', '♫', '♬', '✦'],
    ordered: true,
  },
  {
    id: 'star-bridge',
    kind: 'bridge',
    eyebrow: '별다리 건너기',
    title: '빛나는 발판을 이어 건너요',
    instruction: '가까운 발판부터 눌러 친구가 한 걸음씩 건너게 해 주세요.',
    juniorInstruction: '가까운 별 세 개를 차례로 톡!',
    success: '착지 성공! 우리가 직접 별다리를 완성했어요.',
    symbols: ['★', '★', '★', '★', '★'],
    ordered: true,
  },
  {
    id: 'warm-heart',
    kind: 'comfort',
    eyebrow: '마음 온도',
    title: '따뜻한 빛을 천천히 보내요',
    instruction: '빛 손잡이를 끝까지 밀어 외로운 마음을 포근하게 밝혀 주세요.',
    juniorInstruction: '하트 버튼을 다섯 번 톡!',
    success: '포근해! 차가운 구름이 무지개빛으로 바뀌었어요.',
    symbols: ['♡', '♥', '♡', '♥', '♡'],
    ordered: false,
  },
  {
    id: 'moon-rhythm',
    kind: 'rhythm',
    eyebrow: '달빛 합주',
    title: '반짝이는 박자를 완성해요',
    instruction: '빛나는 달북을 순서대로 눌러 마지막 축제를 열어 주세요.',
    juniorInstruction: '반짝이는 달북 세 개를 톡!',
    success: '쿵짝짝! 우리가 만든 달빛 축제가 시작됐어요.',
    symbols: ['●', '◐', '●', '◑', '✦'],
    ordered: true,
  },
];

export const questTargetPositions = [
  { x: 56, y: 29, rotate: -8 },
  { x: 73, y: 24, rotate: 7 },
  { x: 86, y: 39, rotate: -4 },
  { x: 66, y: 52, rotate: 6 },
  { x: 82, y: 59, rotate: -7 },
] as const;

export function questTargetCount(age: string) {
  if (age === '4–6세') return 3;
  if (age === '7–9세') return 4;
  return 5;
}

const traitOffset: Record<AdventureTrait, number> = {
  kindness: 0,
  curiosity: 1,
  courage: 2,
  creativity: 3,
};

export function questOrder(
  sceneIndex: number,
  count: number,
  trait: AdventureTrait = 'kindness',
) {
  const patterns = [
    [0, 1, 2, 3, 4],
    [1, 0, 3, 2, 4],
    [0, 2, 1, 4, 3],
    [0, 1, 2, 3, 4],
    [2, 0, 3, 1, 4],
  ];
  return patterns[(sceneIndex + traitOffset[trait]) % patterns.length].filter(
    (index) => index < count,
  );
}

export function questPositionsForChoice(
  sceneIndex: number,
  trait: AdventureTrait = 'kindness',
) {
  const offset =
    (sceneIndex + traitOffset[trait]) % questTargetPositions.length;
  return questTargetPositions.map(
    (_, index) =>
      questTargetPositions[(index + offset) % questTargetPositions.length],
  );
}

export function clueGlyph(decision?: AdventureDecision | null) {
  if (!decision) return '✦';
  const clue = decision.clue;
  if (/지도|나침반|공식|규칙/.test(clue)) return '⌁';
  if (/깃털/.test(clue)) return '❧';
  if (/발자국|발판/.test(clue)) return '✣';
  if (/여우/.test(clue)) return '◇';
  if (/노래|음|박자|춤|북|화음/.test(clue)) return '♫';
  if (/구름|비|바람|눈/.test(clue)) return '☁';
  if (/별|빛|달/.test(clue)) return '✦';
  if (/우정|마음|미소|손/.test(clue)) return '♥';
  return decision.trait === 'kindness'
    ? '♥'
    : decision.trait === 'curiosity'
      ? '⌕'
      : decision.trait === 'courage'
        ? '↗'
        : '✦';
}

export const guideGlyph: Record<AdventureTrait, string> = {
  kindness: '🦉',
  curiosity: '🗺️',
  courage: '✨',
  creativity: '🎵',
};
