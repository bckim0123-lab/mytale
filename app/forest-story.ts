/** A deterministic story: the scenery, dialogue and ending follow saved actions. */
export type ForestRoute = 'undecided' | 'river' | 'garden';
export type ForestChapter =
  | 'arrival'
  | 'crossing'
  | 'grove'
  | 'festival'
  | 'complete';
export type ForestOwlChoice = 'listen' | 'invite';
export type ForestEndingChoice = 'sky' | 'home';
export type ForestDifficulty = 'simple' | 'standard' | 'challenge';
export type ForestCraftDesign = 'star' | 'heart';
export type ForestEvent =
  | { type: 'choose-route'; route: 'river' | 'garden' }
  | { type: 'interact'; id: string }
  | { type: 'choose-owl'; choice: ForestOwlChoice }
  | { type: 'choose-ending'; choice: ForestEndingChoice }
  | { type: 'complete-craft'; design: ForestCraftDesign }
  | { type: 'retry-melody' };

export type ForestState = {
  version: 1;
  /** Existing saves without an edition retain their original progression. */
  edition?: 2;
  craftDesign?: ForestCraftDesign;
  discoveries?: string[];
  /** Fixed when an adventure starts. Missing on older saves means standard. */
  difficulty?: ForestDifficulty;
  route: ForestRoute;
  chapter: ForestChapter;
  collected: string[];
  bridges: boolean;
  planted: string[];
  watered: string[];
  hasWater: boolean;
  gardenBloom: boolean;
  owlHelped: boolean;
  owlChoice: ForestOwlChoice | null;
  melody: number;
  lanterns: string[];
  ending: ForestEndingChoice | null;
  message: string;
  moves: number;
};

export type ForestHotspot = {
  id: string;
  label: string;
  kind:
    | 'npc'
    | 'seed'
    | 'wood'
    | 'bridge'
    | 'flower'
    | 'bell'
    | 'lantern'
    | 'portal'
    | 'water'
    | 'secret';
  x: number;
  z: number;
  available: boolean;
  complete: boolean;
};

export type ForestChoice = {
  id: string;
  label: string;
  description: string;
  event: ForestEvent;
};

export type ForestView = {
  chapterLabel: string;
  title: string;
  objective: string;
  dialogue: string;
  hotspots: ForestHotspot[];
  choices: ForestChoice[];
  /** Overall completion, 0–100. */
  progress: number;
  /** Stable bell IDs in playback order. UI may replay these without changing state. */
  melody: string[];
  melodyIndex: number;
  reward: string | null;
};

export const FOREST_WOOD_IDS = [
  'wood-fern',
  'wood-stump',
  'wood-moon',
] as const;
export const FOREST_SEED_IDS = [
  'seed-peach',
  'seed-mint',
  'seed-gold',
] as const;
export const FOREST_BED_IDS = [
  'flower-peach',
  'flower-mint',
  'flower-gold',
] as const;
export const FOREST_LANTERN_IDS = [
  'lantern-berry',
  'lantern-moon',
  'lantern-star',
] as const;
export const FOREST_BELL_IDS = ['bell-dew', 'bell-leaf', 'bell-star'] as const;
export const FOREST_DISCOVERY_IDS = [
  'secret-shell',
  'secret-mushroom',
  'secret-star',
] as const;
export const FOREST_DISCOVERIES = {
  'secret-shell': {
    label: '속삭이는 조개',
    description: '귀에 살짝 대면 작은 파도 소리가 나요.',
  },
  'secret-mushroom': {
    label: '포근한 버섯 배지',
    description: '풀잎 아래 숨은 버섯 모양 배지예요. 옷깃에 달아 봐요.',
  },
  'secret-star': {
    label: '별빛 조각',
    description: '나뭇잎 사이에서 찾은 빛이 손바닥에 반짝여요.',
  },
} as const;

export function getForestCompanion(route: ForestRoute): string {
  return route === 'river'
    ? '수달 모모'
    : route === 'garden'
      ? '토끼 포포'
      : '숲 친구';
}

function craftName(state: ForestState): string {
  const shape = state.craftDesign === 'heart' ? '하트' : '별';
  return state.route === 'river' ? `${shape}표 다리` : `${shape} 모양 물길`;
}

function availableSecrets(state: ForestState): string[] {
  if (
    state.edition !== 2 ||
    state.route === 'undecided' ||
    state.chapter === 'complete'
  )
    return [];
  const ids = [state.route === 'river' ? 'secret-shell' : 'secret-mushroom'];
  if (state.chapter === 'grove' || state.chapter === 'festival')
    ids.push('secret-star');
  return ids;
}

/** Placement shared with the renderer; each ID has one position throughout the story. */
export const FOREST_LOCATIONS: Record<string, { x: number; z: number }> = {
  'owl-welcome': { x: 0, z: 1.4 },
  'wood-fern': { x: 2.4, z: 3.4 },
  'wood-stump': { x: 6.1, z: 3 },
  'wood-moon': { x: 6.6, z: 0.6 },
  'river-bridge': { x: 4.2, z: -0.4 },
  'river-gate': { x: 4.2, z: -3.4 },
  'seed-peach': { x: -2.9, z: 3.3 },
  'seed-mint': { x: -5.3, z: 4 },
  'seed-gold': { x: -7, z: 1.7 },
  'garden-water': { x: -6.2, z: 2.3 },
  'flower-peach': { x: -6.1, z: -0.5 },
  'flower-mint': { x: -4.4, z: -1.2 },
  'flower-gold': { x: -2.7, z: -0.5 },
  'garden-gate': { x: -4.2, z: -3.4 },
  'owl-grove': { x: 0, z: -4.3 },
  'bell-dew': { x: -2.5, z: -5.8 },
  'bell-leaf': { x: 0, z: -6.5 },
  'bell-star': { x: 2.5, z: -5.8 },
  'lantern-berry': { x: -3.5, z: -3.3 },
  'lantern-moon': { x: 0, z: -6.5 },
  'lantern-star': { x: 3.5, z: -3.3 },
  'festival-tree': { x: 0, z: -4.5 },
  'secret-shell': { x: 6.5, z: 2.1 },
  'secret-mushroom': { x: -7, z: 0.4 },
  'secret-star': { x: 3.2, z: -7.1 },
};

const chapterLabels: Record<ForestChapter, string> = {
  arrival: '첫 만남',
  crossing: '우리가 만드는 길',
  grove: '잊어버린 숲의 노래',
  festival: '달빛 축제',
  complete: '우리의 첫 번째 이야기',
};

export function initialForestState(
  difficulty: ForestDifficulty = 'standard',
): ForestState {
  return {
    version: 1,
    edition: 2,
    discoveries: [],
    difficulty,
    route: 'undecided',
    chapter: 'arrival',
    collected: [],
    bridges: false,
    planted: [],
    watered: [],
    hasWater: false,
    gardenBloom: false,
    owlHelped: false,
    owlChoice: null,
    melody: 0,
    lanterns: [],
    ending: null,
    message:
      difficulty === 'simple'
        ? '오늘은 숲의 생일이야! 잠든 달빛 나무를 깨우러 가자.'
        : difficulty === 'challenge'
          ? '숲의 생일인데 달빛 나무가 잠들어 있어. 다리도 끊기고 꽃길도 닫혔네. 우리가 고른 길을 다른 친구들도 지날 수 있을까?'
          : '오늘은 숲의 생일이래! 그런데 달빛 나무가 아직 잠들어 있어. 우리 함께 깨워 줄까?',
    moves: 0,
  };
}

export function getForestMelody(
  state: Pick<ForestState, 'difficulty' | 'owlChoice'>,
): string[] {
  if (state.difficulty === 'simple')
    return state.owlChoice === 'invite'
      ? ['bell-star', 'bell-dew']
      : ['bell-dew', 'bell-star'];
  if (state.difficulty === 'challenge')
    return state.owlChoice === 'invite'
      ? ['bell-star', 'bell-dew', 'bell-leaf', 'bell-dew', 'bell-star']
      : ['bell-dew', 'bell-leaf', 'bell-star', 'bell-leaf', 'bell-dew'];
  return state.owlChoice === 'invite'
    ? ['bell-star', 'bell-dew', 'bell-leaf', 'bell-star']
    : ['bell-dew', 'bell-leaf', 'bell-star'];
}

const bellNames: Record<string, string> = {
  'bell-dew': '물방울',
  'bell-leaf': '나뭇잎',
  'bell-star': '별빛',
};
function melodyWords(state: Pick<ForestState, 'difficulty' | 'owlChoice'>) {
  return getForestMelody(state)
    .map((id) => bellNames[id])
    .join(', ');
}
function say(
  state: ForestState,
  standard: string,
  simple = standard,
  challenge = standard,
) {
  return state.difficulty === 'simple'
    ? simple
    : state.difficulty === 'challenge'
      ? challenge
      : standard;
}

function hotspot(
  id: string,
  kind: ForestHotspot['kind'],
  label: string,
  available = true,
  complete = false,
): ForestHotspot {
  return { id, kind, label, ...FOREST_LOCATIONS[id], available, complete };
}

function feedback(
  state: ForestState,
  message: string,
  simple?: string,
  challenge?: string,
): ForestState {
  message = say(state, message, simple, challenge);
  return state.message === message ? state : { ...state, message };
}

function advance(
  state: ForestState,
  changes: Partial<ForestState>,
  message: string,
  simple?: string,
  challenge?: string,
): ForestState {
  message = say(state, message, simple, challenge);
  return { ...state, ...changes, message, moves: state.moves + 1 };
}

export function getForestView(state: ForestState): ForestView {
  const view: ForestView = {
    chapterLabel: chapterLabels[state.chapter],
    title: '달빛 숲의 작은 약속',
    objective: '',
    dialogue: state.message,
    hotspots: [],
    choices: [],
    progress: 0,
    melody: getForestMelody(state),
    melodyIndex: state.melody,
    reward: null,
  };

  if (state.chapter === 'arrival') {
    view.objective = '어느 길로 갈까? 우리가 고른 길이 숲의 모습을 바꿔요.';
    view.hotspots = [hotspot('owl-welcome', 'npc', '부엉이에게 인사')];
    view.choices = [
      {
        id: 'route-river',
        label: '첨벙! 시냇물 길',
        description:
          '나뭇가지를 모아 다리를 놓아요. 완성된 다리는 숲 친구들도 건널 수 있어요.',
        event: { type: 'choose-route', route: 'river' },
      },
      {
        id: 'route-garden',
        label: '톡톡! 비밀 정원',
        description: '씨앗을 심고 물을 주면 꽃들이 숨겨진 길을 열어 줘요.',
        event: { type: 'choose-route', route: 'garden' },
      },
    ];
  } else if (state.chapter === 'crossing' && state.route === 'river') {
    const woodCount = state.collected.length;
    view.title = state.bridges
      ? '우리가 놓은 작은 다리'
      : '첨벙 시냇물의 나무다리';
    view.objective = state.bridges
      ? '다리가 튼튼해졌어! 다리 건너 반짝이는 길로 가자.'
      : woodCount === 3
        ? '나뭇가지가 다 모였어. 시냇가의 다리 표시를 눌러 이어 보자!'
        : `시냇가에서 나뭇가지 세 개를 찾아요. ${woodCount}/3개`;
    view.hotspots = [
      ...FOREST_WOOD_IDS.map((id, index) =>
        hotspot(
          id,
          'wood',
          ['고사리 옆 나뭇가지', '그루터기 옆 나뭇가지', '물가의 나뭇가지'][
            index
          ],
          !state.collected.includes(id),
          state.collected.includes(id),
        ),
      ),
      hotspot(
        'river-bridge',
        'bridge',
        state.bridges ? '우리가 만든 다리' : '다리 이어 만들기',
        woodCount === 3 && !state.bridges,
        state.bridges,
      ),
      hotspot('river-gate', 'portal', '다리 건너 숲으로', state.bridges),
    ];
    view.progress =
      8 + Math.round(((woodCount + Number(state.bridges)) / 5) * 38);
  } else if (state.chapter === 'crossing' && state.route === 'garden') {
    view.title = state.gardenBloom
      ? '꽃들이 열어 준 길'
      : '잠꾸러기 씨앗의 정원';
    view.objective = state.gardenBloom
      ? '꽃이 활짝 피었어! 꽃 아치 아래 반짝이는 길로 가자.'
      : state.collected.length < 3
        ? `동그란 씨앗을 찾고 빈 화단에 심어요. 씨앗 ${state.collected.length}/3개`
        : !state.hasWater
          ? '연못 옆 물뿌리개에 물을 담아 꽃들에게 가져다주자.'
          : `씨앗을 심은 화단을 다시 눌러 물을 줘요. 활짝 핀 꽃 ${state.watered.length}/3개`;
    view.hotspots = [
      ...FOREST_SEED_IDS.map((id, index) =>
        hotspot(
          id,
          'seed',
          ['복숭아빛 씨앗', '민트빛 씨앗', '꿀빛 씨앗'][index],
          !state.collected.includes(id),
          state.collected.includes(id),
        ),
      ),
      hotspot(
        'garden-water',
        'water',
        state.hasWater ? '찰랑찰랑 물뿌리개' : '물뿌리개에 물 담기',
        !state.hasWater,
        state.hasWater,
      ),
      ...FOREST_BED_IDS.map((id, index) => {
        const planted = state.planted.includes(id);
        const bloomed = state.watered.includes(id);
        const color = ['복숭아', '민트', '꿀빛'][index];
        return hotspot(
          id,
          'flower',
          bloomed
            ? `${color} 꽃이 피었어!`
            : planted
              ? `${color} 새싹에 물 주기`
              : `${color} 씨앗 심기`,
          !bloomed &&
            (planted
              ? state.hasWater
              : state.collected.length > state.planted.length),
          bloomed,
        );
      }),
      hotspot('garden-gate', 'portal', '꽃길 따라 숲으로', state.gardenBloom),
    ];
    view.progress =
      8 +
      Math.round(
        ((state.collected.length +
          state.planted.length +
          state.watered.length +
          Number(state.hasWater)) /
          11) *
          38,
      );
  } else if (state.chapter === 'grove') {
    view.title = '부엉이가 잊어버린 노래';
    view.objective = state.owlChoice
      ? `숲의 종을 차례로 울려요. ${state.melody}/${view.melody.length}음 · 소리 없이도 이름과 빛으로 따라갈 수 있어요.`
      : '부엉이가 첫 무대가 떨린대. 어떤 말을 해 줄까?';
    view.hotspots = [
      hotspot(
        'owl-grove',
        'npc',
        state.owlChoice ? '부엉이의 노래 다시 듣기' : '부엉이와 이야기',
      ),
      ...FOREST_BELL_IDS.map((id, index) =>
        hotspot(
          id,
          'bell',
          ['물방울 종', '나뭇잎 종', '별빛 종'][index],
          state.owlChoice !== null,
        ),
      ),
    ];
    if (!state.owlChoice) {
      view.choices = [
        {
          id: 'owl-listen',
          label: '천천히 해도 괜찮아. 내가 들어줄게.',
          description:
            '부엉이의 조용한 노래를 함께 들어요. 반딧불들이 모여들어요.',
          event: { type: 'choose-owl', choice: 'listen' },
        },
        {
          id: 'owl-invite',
          label: '우리 같이 부르자!',
          description: '둘이 부르는 씩씩한 노래! 부엉이도 축제에 함께 와요.',
          event: { type: 'choose-owl', choice: 'invite' },
        },
      ];
    }
    view.progress =
      48 +
      (state.owlChoice ? 7 : 0) +
      Math.round((state.melody / view.melody.length) * 20);
  } else if (state.chapter === 'festival') {
    view.title = '달빛 나무의 생일';
    view.objective =
      state.lanterns.length < 3
        ? `숲 친구들의 등불을 켜요. ${state.lanterns.length}/3개 · 마지막 빛을 어디에 남겨 줄까?`
        : '모두 모였어! 우리가 만든 빛을 어디에 남기고 싶어?';
    view.hotspots = FOREST_LANTERN_IDS.map((id, index) =>
      hotspot(
        id,
        'lantern',
        ['산딸기 등불 켜기', '초승달 등불 켜기', '꼬마별 등불 켜기'][index],
        !state.lanterns.includes(id),
        state.lanterns.includes(id),
      ),
    );
    if (state.lanterns.length === 3) {
      view.choices = [
        {
          id: 'ending-sky',
          label: '밤하늘에 별을 띄워 줄래',
          description: '우리의 노래를 실은 별들이 숲 위로 올라가요.',
          event: { type: 'choose-ending', choice: 'sky' },
        },
        {
          id: 'ending-home',
          label: '친구들의 집 앞을 밝혀 줄래',
          description: '꽃길과 작은 집마다 따뜻한 불이 켜져요.',
          event: { type: 'choose-ending', choice: 'home' },
        },
      ];
    }
    view.progress = 78 + state.lanterns.length * 5;
  } else if (state.chapter === 'complete') {
    const ending = getForestEnding(state);
    view.title = ending?.title ?? '달빛 숲의 작은 약속';
    view.objective =
      '우리가 바꾼 숲이 이야기에 담겼어요. 친구와 함께 오래 간직해요.';
    view.progress = 100;
    view.reward = ending?.reward ?? null;
    view.hotspots = [hotspot('festival-tree', 'npc', '달빛 나무와 인사하기')];
  }
  if (state.difficulty === 'simple') {
    if (state.chapter === 'arrival')
      view.objective = '물길로 갈까? 꽃길로 갈까?';
    else if (state.chapter === 'crossing') {
      if (state.route === 'river')
        view.objective = state.bridges
          ? '다리를 건너가자!'
          : state.collected.length === 3
            ? '가지가 다 모였어. 다리를 눌러 봐!'
            : `나뭇가지 세 개를 찾아 줘. ${state.collected.length}/3개`;
      else
        view.objective = state.gardenBloom
          ? '꽃길이 열렸어. 들어가 보자!'
          : state.collected.length < 3
            ? `동그란 씨앗을 찾아 줘. ${state.collected.length}/3개`
            : state.planted.length < 3
              ? `빈 화단에 씨앗을 심자. ${state.planted.length}/3개`
              : !state.hasWater
                ? '물뿌리개에 물을 담자.'
                : `새싹을 눌러 물을 줘. ${state.watered.length}/3개`;
    } else if (state.chapter === 'grove')
      view.objective = state.owlChoice
        ? `종을 두 번 울려 줘. ${state.melody}/2음 · 이름을 보고 눌러도 돼.`
        : '부엉이가 떨린대. 뭐라고 말해 줄까?';
    else if (state.chapter === 'festival')
      view.objective =
        state.lanterns.length < 3
          ? `등불을 켜자. ${state.lanterns.length}/3개`
          : '빛을 어디로 보내 줄까?';
    else view.objective = '우리 이야기가 책이 됐어!';
    const shortChoices: Record<string, [string, string]> = {
      'route-river': ['시냇물 길', '가지를 모아 다리를 만들자.'],
      'route-garden': ['비밀 정원', '씨앗에 물을 주고 꽃을 피우자.'],
      'owl-listen': ['내가 들어줄게.', '반딧불도 노래를 들으러 와.'],
      'owl-invite': ['같이 부르자!', '부엉이와 축제에 가자.'],
      'ending-sky': ['하늘에 별을 띄울래', '우리 별이 둥실 올라가.'],
      'ending-home': ['집 앞을 밝혀 줄래', '친구들이 밝은 길로 돌아가.'],
    };
    view.choices = view.choices.map((choice) => ({
      ...choice,
      label: shortChoices[choice.id]?.[0] ?? choice.label,
      description: shortChoices[choice.id]?.[1] ?? choice.description,
    }));
  } else if (state.difficulty === 'challenge') {
    if (state.chapter === 'arrival')
      view.objective =
        '다리를 이을까, 정원을 깨울까? 우리가 지나간 뒤에도 남을 길을 골라 보자.';
    if (
      state.chapter === 'crossing' &&
      state.route === 'river' &&
      state.collected.length < 3
    )
      view.objective = `고사리, 그루터기, 물가를 살펴보자. 떨어진 나뭇가지 ${state.collected.length}/3개`;
    if (
      state.chapter === 'crossing' &&
      state.route === 'garden' &&
      !state.gardenBloom
    )
      view.objective += ' 흙에 심은 새싹과 물을 받은 꽃은 어떻게 다를까?';
    if (state.chapter === 'grove' && state.owlChoice)
      view.objective = `다섯 소리의 규칙을 찾아보자. 가운데 음을 지나면 왔던 순서로 돌아와. ${state.melody}/5음 · 언제든 다시 듣거나 이름을 봐도 돼.`;
    if (state.chapter === 'festival' && state.lanterns.length === 3)
      view.objective =
        '멀리 보이는 별과 가까운 귀갓길. 이 빛이 닿았으면 하는 곳을 골라 보자.';
  }
  if (state.edition === 2) {
    const companion = getForestCompanion(state.route);
    if (state.chapter === 'arrival') {
      view.choices = view.choices.map((choice) => ({
        ...choice,
        description:
          choice.id === 'route-river'
            ? '수달 모모와 조각을 맞춰 다리를 만들어요.'
            : '토끼 포포와 물길을 이어 꽃을 깨워요.',
      }));
    }
    if (state.chapter === 'crossing') {
      if (state.route === 'garden' && state.collected.length < 3)
        view.objective = say(
          state,
          `포포와 씨앗 세 개를 모아 물길을 이어요. 씨앗 ${state.collected.length}/3개`,
          `포포와 동그란 씨앗을 찾아 줘. ${state.collected.length}/3개`,
          `세 화단을 깨울 씨앗을 찾아보자. 물은 어디로 흘러가야 할까? ${state.collected.length}/3개`,
        );
      if (
        state.route === 'river' &&
        state.collected.length === 3 &&
        !state.bridges
      )
        view.objective = say(
          state,
          '모모가 가지를 잡아 줄게. 다리 앞에서 조각을 맞추고 우리 표식을 골라 보자!',
          '모모와 다리 조각을 맞춰 줘.',
          '길이와 모양을 살펴 빈자리에 맞춰 보자. 마지막 표식은 우리가 골라!',
        );
      if (
        state.route === 'garden' &&
        state.collected.length === 3 &&
        !state.hasWater
      )
        view.objective = say(
          state,
          '포포가 씨앗을 화단에 놓았어! 수로 조각을 돌려 세 꽃에게 물이 흐르게 이어 보자.',
          '포포와 물길 조각을 이어 줘.',
          '끊긴 수로를 돌려 이어 보자. 입구부터 출구까지 물이 흐를 수 있을까?',
        );
      view.hotspots = view.hotspots.map((spot) =>
        spot.id === 'garden-water'
          ? {
              ...spot,
              available: !state.hasWater && state.collected.length === 3,
              label: state.hasWater ? '우리가 이은 물길' : '포포와 물길 잇기',
            }
          : spot.id === 'river-bridge'
            ? {
                ...spot,
                label: state.bridges
                  ? craftName(state)
                  : '모모와 다리 조각 맞추기',
              }
            : state.route === 'garden' &&
                spot.kind === 'flower' &&
                !state.hasWater
              ? {
                  ...spot,
                  available: false,
                  label: spot.label
                    .replace('씨앗 심기', '꽃이 자랄 자리')
                    .replace('새싹에 물 주기', '새싹이 물을 기다려요'),
                }
              : spot,
      );
      if (state.route === 'garden')
        view.progress =
          8 +
          Math.round(
            ((state.collected.length + Number(state.gardenBloom)) / 5) * 38,
          );
    }
    if (state.chapter === 'grove') view.title = `${companion}와 찾은 작은 노래`;
    if (state.chapter === 'festival')
      view.title = `${companion}와 켜는 달빛 축제`;
    view.hotspots.push(
      ...availableSecrets(state).map((id) =>
        hotspot(
          id,
          'secret',
          FOREST_DISCOVERIES[id as keyof typeof FOREST_DISCOVERIES].label,
          !(state.discoveries ?? []).includes(id),
          (state.discoveries ?? []).includes(id),
        ),
      ),
    );
  }
  return view;
}

/** Invalid/out-of-order and completed actions never grant items or skip chapters. */
export function transitionForest(
  state: ForestState,
  event: ForestEvent,
): ForestState {
  if (state.chapter === 'complete') return state;

  if (event.type === 'choose-route') {
    if (
      state.chapter !== 'arrival' ||
      !['river', 'garden'].includes(event.route)
    )
      return state;
    if (state.edition === 2)
      return advance(
        state,
        { route: event.route, chapter: 'crossing' },
        event.route === 'river'
          ? '“이쪽이야!” 수달 모모가 물 밖으로 얼굴을 쏙 내밀었어. “가지 세 개만 모아 줘. 내가 잡고 있을 테니 함께 다리를 맞추자!”'
          : '풀잎 뒤에서 토끼 포포가 폴짝! “꽃들이 목말라해. 씨앗 세 개를 찾아 줄래? 나는 끊긴 물길을 살펴볼게.”',
        event.route === 'river'
          ? '수달 모모가 손을 흔들어! 가지 세 개를 모으자.'
          : '토끼 포포가 폴짝! 씨앗 세 개를 찾자.',
      );
    return advance(
      state,
      { route: event.route, chapter: 'crossing' },
      event.route === 'river'
        ? '저기 다리의 가운데가 비어 있네. 떨어진 나뭇가지를 모으면 우리가 고칠 수 있어!'
        : '씨앗들이 이불 속에서 자고 있나 봐. 흙에 심고 물을 주면 꽃길을 보여 줄 거야.',
      event.route === 'river'
        ? '다리가 끊겼네. 떨어진 가지 세 개를 찾자!'
        : '동그란 씨앗을 찾아 흙에 심어 주자!',
      event.route === 'river'
        ? '다리 가운데가 비었어. 고사리 옆, 그루터기 옆, 물가에 쓸 만한 가지가 보이네. 살아 있는 나뭇가지는 꺾지 않아도 되겠다.'
        : '정원에 씨앗만 남아 있어. 먼저 심고 물을 주면 무슨 일이 생길까? 새싹이 자라는 순서를 살펴보자.',
    );
  }

  if (event.type === 'complete-craft') {
    if (
      state.edition !== 2 ||
      state.chapter !== 'crossing' ||
      state.collected.length !== 3 ||
      !['star', 'heart'].includes(event.design) ||
      state.craftDesign ||
      (state.route !== 'river' && state.route !== 'garden')
    )
      return state;
    const built = { ...state, craftDesign: event.design };
    return advance(
      state,
      {
        craftDesign: event.design,
        ...(state.route === 'river'
          ? { bridges: true }
          : {
              hasWater: true,
              planted: [...FOREST_BED_IDS],
              watered: [...FOREST_BED_IDS],
              gardenBloom: true,
            }),
      },
      state.route === 'river'
        ? `마지막 조각이 쏙! 모모가 양팔을 들었어. “우리가 만든 ${craftName(built)}야!” 발을 톡 굴려 보니 튼튼해. 이제 함께 건너자.`
        : `쪼르르! ${craftName(built)}을 따라 물이 세 화단에 도착했어. 포포가 심은 씨앗들이 꽃으로 활짝! “우리가 꽃길을 열었어!” 이제 아치 아래로 함께 가자.`,
      state.route === 'river'
        ? `${craftName(built)} 완성! 모모와 건너자.`
        : `${craftName(built)}로 물이 졸졸! 세 꽃이 활짝! 포포와 꽃길로 가자.`,
    );
  }

  if (event.type === 'choose-owl') {
    if (
      state.chapter !== 'grove' ||
      state.owlChoice ||
      !['listen', 'invite'].includes(event.choice)
    )
      return state;
    if (state.edition === 2) {
      const companion = getForestCompanion(state.route);
      const next = { ...state, owlChoice: event.choice };
      return advance(
        state,
        { owlChoice: event.choice, owlHelped: true },
        event.choice === 'listen'
          ? `${companion}도 네 옆에 조용히 앉았어. “괜찮아, 기다릴게.” 부엉이가 숨을 고르고 노래를 시작해. 빛나는 종의 순서를 잘 보고 기억해 볼까?`
          : `${companion}가 먼저 박자를 톡톡! 네가 첫 소리를 부르자 부엉이도 날개를 폈어. 함께 반짝이는 종을 잘 보고 같은 순서로 울려 보자.`,
        event.choice === 'listen'
          ? `${companion}도 귀를 쫑긋! ${melodyWords(next)}.`
          : `${companion}와 같이 부르자! ${melodyWords(next)}.`,
        event.choice === 'listen'
          ? `${companion}와 기다려 주니 부엉이가 노래를 시작했어. 가운데 소리 뒤에는 어떤 순서로 돌아올까?`
          : `${companion}가 첫 박자를 내고 부엉이가 이어 불러. 처음과 끝이 만나는 소리의 규칙을 찾아보자.`,
      );
    }
    return advance(
      state,
      { owlChoice: event.choice, owlHelped: true },
      event.choice === 'listen'
        ? `“내 이야기를 들어 줘서 고마워.” 부엉이가 날개를 폈어. ${melodyWords({ ...state, owlChoice: event.choice })}… 반딧불도 가만히 귀를 기울여.`
        : `“정말? 함께라면 할 수 있어!” ${melodyWords({ ...state, owlChoice: event.choice })}! 부엉이가 너와 나란히 노래해.`,
      event.choice === 'listen'
        ? `부엉이가 노래해. ${melodyWords({ ...state, owlChoice: event.choice })}! 우리도 눌러 보자.`
        : `같이 부르자! ${melodyWords({ ...state, owlChoice: event.choice })}!`,
      event.choice === 'listen'
        ? `재촉하지 않고 기다렸더니 부엉이가 날개를 폈어. ${melodyWords({ ...state, owlChoice: event.choice })}. 가운데 소리 뒤에 어떤 규칙이 숨어 있을까?`
        : `부엉이와 한 소리씩 주고받아 보자. ${melodyWords({ ...state, owlChoice: event.choice })}. 첫 소리와 끝 소리가 만나는 노래야.`,
    );
  }

  if (event.type === 'choose-ending') {
    if (
      state.chapter !== 'festival' ||
      state.lanterns.length !== 3 ||
      !['sky', 'home'].includes(event.choice)
    )
      return state;
    if (state.edition === 2)
      return advance(
        state,
        { ending: event.choice, chapter: 'complete' },
        event.choice === 'sky'
          ? `${getForestCompanion(state.route)}와 손을 번쩍! ${craftName(state)}의 표식을 닮은 빛이 하늘로 올라갔어. 달빛 나무가 눈을 뜨자 모두 “와아!” 하고 웃어.`
          : `${getForestCompanion(state.route)}가 앞장서고 우리는 빛을 나누었어. ${craftName(state)}부터 집 앞까지 환해졌어. “오늘은 나도 혼자 돌아갈 수 있겠다!”`,
        event.choice === 'sky'
          ? `${getForestCompanion(state.route)}와 별을 띄웠어! 우리 이야기가 책이 됐어.`
          : `${getForestCompanion(state.route)}와 길을 밝혔어! 우리 이야기가 책이 됐어.`,
      );
    return advance(
      state,
      { ending: event.choice, chapter: 'complete' },
      event.choice === 'sky'
        ? '하나, 둘, 셋! 우리가 밝힌 별이 숲 위로 둥실 떠올랐어. 오늘 밤 이야기는 아주 멀리서도 보일 거야.'
        : '집집마다 노란 불이 켜졌어. “이제 집으로 가는 길이 포근해!” 숲 친구들이 손을 흔들어.',
      event.choice === 'sky'
        ? '우리 별이 둥실! 달빛 나무도 깨어났어.'
        : '집 앞이 환해졌어! 친구들이 손을 흔들어.',
      event.choice === 'sky'
        ? '별빛이 나뭇가지보다 높이 올랐어. 멀리 있는 친구도 오늘의 노래를 볼 수 있겠지? 달빛 나무가 눈을 떴어.'
        : '같은 빛인데 이제 계단과 좁은 길이 잘 보여. 축제가 끝난 뒤 돌아갈 친구들을 생각한 선물이구나.',
    );
  }

  if (event.type === 'retry-melody') {
    if (state.chapter !== 'grove' || !state.owlChoice) return state;
    return feedback(
      { ...state, melody: 0 },
      '천천히 다시 들어 보자. 틀려도 괜찮아. 숲의 노래는 우리를 기다려 줘.',
      '괜찮아. 두 소리를 다시 들어 보자!',
      '처음부터 다시 들어 보자. 가운데 소리를 찾고, 그 뒤가 앞부분을 거꾸로 따라가는지 살펴봐.',
    );
  }
  if (event.type !== 'interact') return state;
  const { id } = event;
  if (availableSecrets(state).includes(id)) {
    if ((state.discoveries ?? []).includes(id)) return state;
    const companion = getForestCompanion(state.route);
    const discovery = FOREST_DISCOVERIES[id as keyof typeof FOREST_DISCOVERIES];
    return advance(
      state,
      { discoveries: [...(state.discoveries ?? []), id] },
      id === 'secret-shell'
        ? `돌 아래서 속삭이는 조개를 찾았어! 모모가 귀에 대 보래. “쉬이이…” 작은 파도 소리야. 축제에 가져가 볼까?`
        : id === 'secret-mushroom'
          ? '풀잎을 살짝 들자 포근한 버섯 배지가 짠! 포포가 네 옷깃에 달아 주었어. “우리 탐험대 표식이네!”'
          : `${companion}가 가리킨 잎 사이에 별빛 조각이 반짝! 손바닥 위에서 데굴 굴리니 주변 잎들이 노랗게 빛나. 등불 곁에 놓아 보자.`,
      `${discovery.label} 발견! ${companion}와 살짝 간직하자.`,
    );
  }
  if (state.chapter === 'arrival' && id === 'owl-welcome') {
    return feedback(
      state,
      '“달빛 나무가 잠에서 깨면 숲의 생일 잔치가 시작돼. 시냇물 길과 꽃길 중 어디로 가 볼래?”',
      '달빛 나무가 자고 있어. 물길로 갈까, 꽃길로 갈까?',
    );
  }
  if (state.chapter === 'crossing' && state.route === 'river') {
    if ((FOREST_WOOD_IDS as readonly string[]).includes(id)) {
      if (state.collected.includes(id)) return state;
      const collected = [...state.collected, id];
      return advance(
        state,
        { collected },
        collected.length === 3
          ? '세 개 다 찾았다! 이제 시냇가에 모아서 다리를 만들어 보자.'
          : [
              '나뭇가지 하나! 나무를 꺾지 않아도 바닥에 좋은 가지가 있었네.',
              '두 번째 나뭇가지도 찾았어. 하나만 더 있으면 튼튼하겠다!',
            ][collected.length - 1],
        collected.length === 3
          ? '세 개 다 찾았어! 다리를 만들자.'
          : `가지 ${collected.length}개를 찾았어!`,
      );
    }
    if (id === 'river-bridge') {
      if (state.bridges) return state;
      if (state.collected.length < 3)
        return feedback(
          state,
          `다리를 놓으려면 나뭇가지 ${3 - state.collected.length}개가 더 필요해. 주변을 함께 살펴보자.`,
          `가지 ${3 - state.collected.length}개를 더 찾아 줘.`,
        );
      if (state.edition === 2)
        return feedback(
          state,
          '모모가 가지를 잡고 기다려. 다리 조각을 빈자리에 맞춰야 건널 수 있어!',
          '모모와 다리 조각을 맞춰 줘.',
        );
      return advance(
        state,
        { bridges: true },
        '톡, 톡, 톡! 다리가 이어졌어. 이제 우리도, 작은 숲 친구들도 건널 수 있어!',
        '톡톡! 다리가 이어졌어. 건너가 보자!',
        '가지가 서로 받쳐 주자 다리가 되었어. 우리가 건넌 뒤에도 다리는 여기 남을 거야. 또 누가 건너오게 될까?',
      );
    }
    if (id === 'river-gate' && state.bridges) {
      if (state.edition === 2)
        return advance(
          state,
          { chapter: 'grove' },
          `수달 모모가 ${craftName(state)}를 톡톡 두드려 보고 따라왔어. 나무 아래에서 부엉이가 입을 열었다 닫아. “노래가… 잘 안 나와.” 모모가 네 손을 꼭 잡아.`,
          `수달 모모와 ${craftName(state)}를 건넜어. 부엉이가 떨린대!`,
        );
      return advance(
        state,
        { chapter: 'grove' },
        '찰랑이는 물소리를 지나자 부엉이가 보여. “노래가 자꾸 생각이 안 나… 무대에 서는 게 떨려.”',
        '부엉이가 떨린대. 곁에 가 볼까?',
        '물소리가 멀어지자 작은 목소리가 들려. 부엉이가 첫 무대 앞에서 망설이고 있어. 어떤 도움이 필요할까?',
      );
    }
  }
  if (state.chapter === 'crossing' && state.route === 'garden') {
    if ((FOREST_SEED_IDS as readonly string[]).includes(id)) {
      if (state.collected.includes(id)) return state;
      if (state.edition === 2)
        return advance(
          state,
          { collected: [...state.collected, id] },
          state.collected.length === 2
            ? '씨앗 세 개를 다 모았어! 포포가 화단에 놓는 동안 우리는 물길 조각을 이어 보자.'
            : '동그란 씨앗이 손바닥에 쏙! 포포에게 가져다주니 빈 화단 옆에 조심히 놓았어.',
          state.collected.length === 2
            ? '세 개 다 찾았어! 포포와 물길을 이어 줘.'
            : '씨앗을 찾았어! 포포가 잘 보관해 줄게.',
        );
      return advance(
        state,
        { collected: [...state.collected, id] },
        '손바닥에 쏙 들어오는 씨앗이야. 빈 화단에 심으면 어떤 꽃이 될까?',
        '씨앗을 찾았어! 빈 화단에 심자.',
      );
    }
    if (id === 'garden-water') {
      if (state.hasWater) return state;
      if (state.edition === 2)
        return feedback(
          state,
          state.collected.length < 3
            ? '포포가 수로를 살피는 동안 씨앗 세 개를 찾아보자. 다 모으면 함께 물길을 이을 수 있어.'
            : '포포와 수로 조각을 돌려 이어 보자. 물이 세 화단까지 닿으면 꽃길이 열릴 거야!',
          state.collected.length < 3
            ? '포포와 씨앗 세 개부터 찾자.'
            : '포포와 물길 조각을 이어 줘.',
        );
      return advance(
        state,
        { hasWater: true },
        '찰랑찰랑! 물뿌리개가 가득 찼어. 새싹에게 조금씩 나눠 주자.',
        '찰랑! 물을 담았어. 새싹에게 주자.',
      );
    }
    if ((FOREST_BED_IDS as readonly string[]).includes(id)) {
      if (state.watered.includes(id)) return state;
      if (state.edition === 2 && !state.hasWater)
        return feedback(
          state,
          '화단은 포포가 준비하고 있어. 씨앗 세 개를 모아 수로를 이으면 이곳까지 물이 흐를 거야.',
          '포포와 씨앗을 모아 물길부터 이어 줘.',
        );
      if (!state.planted.includes(id)) {
        if (state.collected.length <= state.planted.length)
          return feedback(
            state,
            '이 화단에 심을 씨앗을 먼저 찾아보자. 동그랗게 반짝이는 씨앗이 근처에 있어.',
            '씨앗이 필요해. 동그란 씨앗을 찾아 줘.',
          );
        return advance(
          state,
          { planted: [...state.planted, id] },
          '폭신한 흙 이불을 덮어 줬어. 작은 새싹이 쏙! 이제 물을 주면 더 자랄 거야.',
          '흙을 덮으니 새싹이 쏙! 이제 물을 주자.',
        );
      }
      if (!state.hasWater)
        return feedback(
          state,
          '새싹이 목마른가 봐. 연못 옆 물뿌리개에 물을 담아 오자.',
          '새싹이 목말라. 물뿌리개에 물을 담자.',
        );
      const watered = [...state.watered, id];
      return advance(
        state,
        { watered, gardenBloom: watered.length === 3 },
        watered.length === 3
          ? '와아, 꽃들이 손을 맞잡았어! 달콤한 꽃 아치 사이로 새로운 길이 열렸어.'
          : '쪼르르… 꽃잎이 활짝! 나비 한 마리가 우리가 키운 꽃을 찾아왔어.',
        watered.length === 3
          ? '꽃 세 송이가 활짝! 꽃길이 열렸어.'
          : '쪼르르! 꽃이 활짝 피었어.',
        watered.length === 3
          ? '꽃들이 자라서 아치를 만들었어. 씨앗을 찾았을 때는 보이지 않던 길이네. 우리가 한 일 중 무엇이 꽃을 깨웠을까?'
          : '물을 받은 꽃이 활짝 피었어. 아직 새싹인 화단과 나란히 보니 달라진 모습이 잘 보여.',
      );
    }
    if (id === 'garden-gate' && state.gardenBloom) {
      if (state.edition === 2)
        return advance(
          state,
          { chapter: 'grove' },
          `토끼 포포가 ${craftName(state)}에 물이 잘 흐르는지 보고 폴짝 따라왔어. 꽃 아치 너머에서 부엉이가 목을 가다듬어. “첫 무대가 무서워…” 포포가 네 곁에 앉아.`,
          '토끼 포포와 꽃길을 지났어. 부엉이에게 힘을 줄까?',
        );
      return advance(
        state,
        { chapter: 'grove' },
        '우리가 피운 꽃길을 따라가니 부엉이가 앉아 있어. “노래가 자꾸 생각이 안 나… 무대에 서는 게 떨려.”',
        '꽃길 끝에 부엉이가 있어. 첫 노래가 떨린대.',
      );
    }
  }
  if (state.chapter === 'grove') {
    if (id === 'owl-grove' && state.edition === 2)
      return feedback(
        state,
        state.owlChoice
          ? `${getForestCompanion(state.route)}가 곁에서 발로 박자를 맞춰. 부엉이가 다시 불러 줘. ${melodyWords(state)}.`
          : `${getForestCompanion(state.route)}가 작은 목소리로 말해. “우리도 처음엔 어려웠지? 부엉이에게 어떤 말을 해 줄까?”`,
        state.owlChoice
          ? `${getForestCompanion(state.route)}와 들어 봐. ${melodyWords(state)}.`
          : `${getForestCompanion(state.route)}도 곁에 있어. 뭐라고 할까?`,
      );
    if (id === 'owl-grove')
      return feedback(
        state,
        state.owlChoice
          ? `${melodyWords(state)}! ${state.owlChoice === 'listen' ? '네가 들어 주니까 기억이 나.' : '이번엔 우리 함께!'}`
          : '“첫 무대라 가슴이 콩닥콩닥해.” 부엉이 곁에 앉아 어떤 말을 해 줄지 골라 보자.',
        state.owlChoice
          ? `${melodyWords(state)}! 종을 눌러 보자.`
          : '부엉이가 콩닥콩닥 떨린대. 뭐라고 말해 줄까?',
        state.owlChoice
          ? `${melodyWords(state)}. 가운데 소리를 지나면 앞의 순서가 거꾸로 돌아와. 마지막 소리를 예상해 볼까?`
          : '부엉이가 목을 가다듬다가 멈췄어. 곁에서 들어 주는 것과 함께 부르는 것 중 어떤 말을 건네고 싶어?',
      );
    if (
      (FOREST_BELL_IDS as readonly string[]).includes(id) &&
      state.owlChoice
    ) {
      const melody = getForestMelody(state);
      if (id !== melody[state.melody]) {
        // A wrong note can also be the beginning of the next attempt.
        return {
          ...state,
          melody: id === melody[0] ? 1 : 0,
          message: say(
            state,
            '딩! 새로운 가락도 예쁘네. 부엉이의 노래를 다시 천천히 따라가 보자.',
            '딩! 괜찮아. 두 소리를 다시 눌러 보자.',
            '새로운 가락이 나왔네. 모은 물건은 그대로야. 가운데 소리를 거울처럼 생각하며 다시 들어 보자.',
          ),
        };
      }
      const nextNote = state.melody + 1;
      if (nextNote === melody.length && state.edition === 2)
        return advance(
          state,
          { melody: nextNote, chapter: 'festival' },
          state.owlChoice === 'listen'
            ? `${getForestCompanion(state.route)}도 숨을 죽이고 듣자 마지막 소리가 숲에 퍼졌어. 반딧불이 하나둘 모여 ${craftName(state)} 쪽을 밝혀! 등불도 함께 켜 볼까?`
            : `${getForestCompanion(state.route)}가 네 박자를 따라 톡톡! 부엉이가 날개를 활짝 펴. “나도 갈래!” 세 친구가 ${craftName(state)}${state.route === 'river' ? '를' : '을'} 돌아보고 축제로 달려가.`,
          state.owlChoice === 'listen'
            ? `${getForestCompanion(state.route)}와 성공! 반딧불도 축제에 왔어.`
            : `${getForestCompanion(state.route)}와 성공! 부엉이도 함께 가!`,
        );
      if (nextNote === melody.length)
        return advance(
          state,
          { melody: nextNote, chapter: 'festival' },
          state.owlChoice === 'listen'
            ? '종소리를 듣고 반딧불들이 모여들었어! 달빛 나무가 기지개를 켜. 이제 등불을 켜서 생일 잔치를 시작하자.'
            : '우리 노래가 숲 끝까지 들렸어! 부엉이도 날개를 펴고 축제에 왔어. 함께 등불을 켜자!',
          state.owlChoice === 'listen'
            ? '반딧불도 들으러 왔어! 이제 등불을 켜자.'
            : '부엉이도 따라왔어! 함께 등불을 켜자.',
        );
      return advance(
        state,
        { melody: nextNote },
        `딩동! ${nextNote}번째 소리를 찾았어. 다음 종도 천천히 골라 보자.`,
        '딩동! 한 소리만 더 눌러 줘.',
        nextNote === 3
          ? '가운데 소리까지 왔어. 이제 방금 온 순서를 되짚어 보자.'
          : `다섯 소리 중 ${nextNote}개를 찾았어. 처음과 끝이 만나는 규칙을 생각해 봐.`,
      );
    }
  }
  if (
    state.chapter === 'festival' &&
    (FOREST_LANTERN_IDS as readonly string[]).includes(id)
  ) {
    if (state.lanterns.includes(id)) return state;
    const lanterns = [...state.lanterns, id];
    if (state.edition === 2)
      return advance(
        state,
        { lanterns },
        lanterns.length === 3
          ? `${getForestCompanion(state.route)}가 세 번째 등불을 받쳐 주자 달빛 나무가 반짝! 우리가 고른 ${craftName(state)}의 표식도 빛나. 이 빛을 어디에 남길까?`
          : (state.discoveries ?? []).includes('secret-star')
            ? `${getForestCompanion(state.route)}와 등불 옆에 별빛 조각을 놓았어. 빛이 반사되어 잎사귀에 작은 별이 춤춰! 등불 ${lanterns.length}개가 켜졌어.`
            : `${getForestCompanion(state.route)}가 등불을 잡고 네가 불을 켜. ${lanterns.length}개가 반짝! 손을 마주치니 부엉이도 날개로 짝짝!`,
        lanterns.length === 3
          ? `${getForestCompanion(state.route)}와 다 켰어! 빛을 어디로 보낼까?`
          : `${getForestCompanion(state.route)}와 반짝! 등불 ${lanterns.length}개가 켜졌어.`,
      );
    return advance(
      state,
      { lanterns },
      lanterns.length === 3
        ? '모든 등불이 켜졌어! 이 따뜻한 빛을 밤하늘에 띄울까, 친구들의 집 앞에 남길까?'
        : [
            '산들바람에도 꺼지지 않는 마법 등불이야. 숲 친구가 방긋 웃네!',
            '또 하나 반짝! 달빛 나무가 황금빛으로 물들고 있어.',
          ][lanterns.length - 1],
      lanterns.length === 3
        ? '다 켰어! 빛을 어디로 보내 줄까?'
        : `반짝! 등불 ${lanterns.length}개가 켜졌어.`,
    );
  }
  return state;
}

type ForestEnding = {
  title: string;
  paragraphs: string[];
  reward: string;
  routeMemory: string;
  owlMemory: string;
};

function editionTwoEnding(state: ForestState): ForestEnding {
  const companion = getForestCompanion(state.route);
  const design = craftName(state);
  const river = state.route === 'river';
  const listen = state.owlChoice === 'listen';
  const sky = state.ending === 'sky';
  const found = state.discoveries ?? [];
  const foundRoute = found.includes(river ? 'secret-shell' : 'secret-mushroom');
  const foundStar = found.includes('secret-star');
  const tiny = state.difficulty === 'simple';
  const thoughtful = state.difficulty === 'challenge';
  const routeTreasure = river ? '속삭이는 조개' : '포근한 버섯 배지';
  const paragraphs = tiny
    ? [
        `작은 친구 둘이 숲에 왔어요. ${companion}가 손을 흔들었어요. “나랑 같이 가자!”`,
        river
          ? `가지를 모아 조각을 쏙쏙! ${design}를 만들었어요.${foundRoute ? ` 모모와 ${routeTreasure}도 찾았어요.` : ' 모모가 먼저 폴짝 건넜어요.'}`
          : `물길 조각을 빙글! ${design}로 물이 졸졸. 꽃이 피었어요.${foundRoute ? ` ${routeTreasure}도 찾았어요.` : ' 포포가 폴짝 뛰었어요.'}`,
        listen
          ? `${companion}와 기다렸어요. 부엉이가 ${melodyWords(state)}! 하고 불렀어요. 반딧불도 왔어요.`
          : `${companion}와 톡톡! ${melodyWords(state)}! 부엉이도 함께 불렀어요.`,
        `${companion}와 등불을 켰어요.${foundStar ? ' 별빛 조각도 반짝!' : ''} ${sky ? '하늘로 별이 둥실! 나무가 깨어났어요.' : '집 앞이 환해졌어요. 모두 손을 흔들었어요.'}`,
        `“또 놀자!” ${companion}와 손을 짝! ${design}${river ? '와' : '과'} 오늘의 모험을 책에 담았어요.`,
      ]
    : [
        river
          ? '작은 친구 둘이 시냇가에 도착했어요. 물에서 얼굴을 내민 수달 모모가 다리의 빈 곳을 가리켰어요. “나는 가지를 잡을게. 너희가 맞춰 줄래?” 두 친구는 소매를 걷었어요.'
          : '작은 친구 둘이 정원에 들어섰어요. 토끼 포포가 빈 물뿌리개를 흔들었어요. 달그락! “꽃들이 목말라하는데 물길이 끊겼어.” 두 친구는 포포 옆에 쪼그려 앉았어요.',
        (river
          ? `모모가 한쪽 끝을 잡고 두 친구가 조각을 밀었어요. 어긋난 곳은 살짝 돌리고, 마지막 빈칸에는 꼭 맞는 조각을 쏙! ${design}가 완성됐어요. 모모가 먼저 발을 톡 굴리고 폴짝 건넜어요.`
          : `두 친구가 모은 씨앗을 포포가 세 화단에 심었어요. 그동안 두 친구는 수로 조각을 빙글 돌렸어요. “조금만 더!” 마지막 조각이 이어지자 ${design}로 물이 졸졸 달려갔어요. 물이 닿은 세 꽃이 차례로 활짝! 포포가 꽃 아치 아래에서 폴짝 뛰었어요.`) +
          (foundRoute
            ? river
              ? ' 돌 아래서 속삭이는 조개도 찾았어요. 모모와 번갈아 귀에 대자 작은 파도 소리가 났어요.'
              : ' 풀잎 아래에는 포근한 버섯 배지가 숨어 있었어요. 포포가 탐험대 표식이라며 옷깃에 달아 주었어요.'
            : ''),
        (listen
          ? `${companion}와 두 친구가 부엉이 곁에 앉았어요. 아무도 서두르라고 하지 않았어요. 부엉이가 숨을 고르더니 ${melodyWords(state)}… 조그만 노래를 꺼냈어요. 종으로 답하자 반딧불이 모여들었어요.`
          : `${companion}가 발로 박자를 톡톡 밟았어요. 두 친구도 ${melodyWords(state)}! 하고 불렀어요. 부엉이가 머뭇거리다 마지막 소리를 보탰어요. 다시 부를 때는 날개까지 활짝 폈어요. “나도 축제에 갈래!”`) +
          (thoughtful
            ? ' 혼자서는 멈추던 노래가 친구들의 소리를 만나 끝까지 이어졌어요.'
            : ''),
        `${companion}가 등불을 받치고 두 친구가 하나씩 불을 켰어요.${foundStar ? ' 나무 곁에서 찾은 별빛 조각을 가까이 놓자, 잎사귀 위에 작은 별들이 춤췄어요.' : ''} ` +
          (sky
            ? `${design}의 표식을 닮은 빛을 하늘로 보냈어요. 점점 작아지는 별을 따라 모두 고개를 들었어요. 달빛 나무가 눈을 뜨고 가지를 쭉 폈어요!`
            : `${design}에서 집 앞까지 빛을 나눴어요. 작은 계단도 구불구불한 길도 잘 보였어요. 돌아가던 친구가 뒤돌아 손을 흔들자 달빛 나무도 가지를 흔들었어요.`),
        `${companion}가 돌아가는 두 친구에게 손을 내밀었어요. 짝! “다음에는 내가 너희를 도와줄게.” 두 친구는 ${design}${river ? '를' : '을'} 한 번 돌아보았어요.${foundRoute ? ` ${routeTreasure}를 만지니 함께 찾던 순간이 떠올랐어요.` : ''}${foundStar ? ' 별빛 조각은 마지막 장을 환하게 밝혔어요.' : ''} 오늘 우리가 고르고 만든 일들이 이 책에 고스란히 남았어요.`,
      ];
  return {
    title: sky
      ? `${companion}와 띄운 작은 별`
      : `${companion}와 밝힌 돌아오는 길`,
    paragraphs,
    reward: listen ? '반딧불 친구 배지' : '부엉이 합창단 배지',
    routeMemory: `우리가 만든 ${design}`,
    owlMemory: listen
      ? `${companion}와 귀 기울여 준 노래`
      : `${companion}와 함께 부른 노래`,
  };
}

export function getForestEnding(state: ForestState): ForestEnding | null {
  if (state.chapter !== 'complete' || !state.ending || !state.owlChoice)
    return null;
  if (state.edition === 2) return editionTwoEnding(state);
  const routeMemory =
    state.route === 'river' ? '우리가 만든 나무다리' : '우리가 피운 세 송이 꽃';
  const owlMemory =
    state.owlChoice === 'listen' ? '귀를 기울여 준 친구' : '함께 노래한 친구';
  return {
    title:
      state.ending === 'sky'
        ? '달빛 숲에 우리 별이 떴어요'
        : '우리가 밝혀 준 집으로 가는 길',
    paragraphs:
      state.difficulty === 'simple'
        ? [
            '오늘은 숲의 생일이에요. 작은 친구 둘이 잠든 달빛 나무를 깨우러 갔어요.',
            state.route === 'river'
              ? '나뭇가지 세 개를 찾았어요. 톡톡! 다리가 이어졌어요. 두 친구가 폴짝 건넜어요.'
              : '씨앗을 심고 물을 주었어요. 꽃 세 송이가 활짝! 꽃길이 열렸어요.',
            state.owlChoice === 'listen'
              ? `부엉이 곁에서 노래를 들었어요. ${melodyWords(state)}! 반딧불도 찾아왔어요.`
              : `${melodyWords(state)}! 부엉이와 같이 불렀어요. 이제 함께 축제에 가요.`,
            state.ending === 'sky'
              ? '등불 세 개를 켰어요. 빛이 별이 되어 둥실! 달빛 나무도 깨어났어요.'
              : '등불 세 개를 켰어요. 집 앞이 환해졌어요. 친구들이 손을 흔들었어요.',
            state.route === 'river'
              ? '다리는 숲에 남았어요. 다음 친구도 건너갈 수 있어요. 안녕, 또 만나!'
              : '꽃은 숲에 남았어요. 나비가 꽃잎에 앉았어요. 안녕, 또 만나!',
          ]
        : state.difficulty === 'challenge'
          ? [
              '숲의 생일인데 달빛 나무는 잠들어 있었어요. 작은 친구 둘이 길을 나섰어요. 끊어진 다리와 잠든 정원 중 어느 길을 열어 볼까요?',
              state.route === 'river'
                ? '고사리 옆, 그루터기 옆, 물가에서 떨어진 가지를 찾았어요. 하나씩 놓을 때마다 빈 곳이 줄어들었지요. 두 친구가 건넌 뒤에도 다리는 남았어요. 다음에는 누가 이 길을 지날까요?'
                : '처음에는 빈 흙뿐이었어요. 씨앗을 심으니 새싹이 나왔고 물을 주니 꽃잎이 펼쳐졌어요. 세 송이 꽃이 아치를 만들었어요. 꽃길이 열린 데에는 두 친구가 보탠 손길이 있었지요.',
              state.owlChoice === 'listen'
                ? `부엉이는 첫 무대가 떨려서 자꾸 입을 다물었어요. 두 친구는 재촉하지 않고 곁에 앉았어요. ${melodyWords(state)}. 가운데 소리에서 돌아오는 노래였어요. 반딧불도 조용히 모여들었지요.`
                : `두 친구가 먼저 작은 소리를 내자 부엉이도 따라 불렀어요. ${melodyWords(state)}. 가운데 소리를 지나 앞의 순서로 돌아왔어요. 혼자 멈추던 노래가 함께 부르는 노래가 되었지요.`,
              state.ending === 'sky'
                ? '세 등불의 빛을 하늘로 보냈어요. 별이 높아질수록 더 먼 곳에서 보였어요. 달빛 나무가 눈을 떴어요. 숲 바깥의 누군가도 이 별을 보고 있을까요?'
                : '두 친구는 세 등불의 빛을 집 앞에 나누었어요. 높이 띄우지는 않았지만 작은 계단과 좁은 길이 잘 보였어요. 달빛 나무가 눈을 떴어요. 돌아갈 길을 위한 선물이었지요.',
              state.route === 'river'
                ? '잔치가 끝나고도 다리는 시냇물 위에 남았어요. 우리가 지나간 자리가 누군가의 다음 길이 되었어요. 두 친구는 다리 건너를 한 번 돌아보고 손을 흔들었어요.'
                : '잔치가 끝나고도 꽃은 정원에 남았어요. 텅 비었던 화단에 나비가 내려앉았어요. 두 친구는 꽃길을 한 번 돌아보았어요. 물을 나눠 준 작은 일이 여기 남아 있었지요.',
            ]
          : [
              '숲의 생일날, 달빛 나무는 깊이 잠들어 있었어요. 작은 친구 둘이 나무를 깨우러 길을 나섰지요.',
              state.route === 'river'
                ? '졸졸 흐르는 시냇물 앞에서 발걸음이 멈췄어요. 두 친구는 떨어진 나뭇가지 세 개를 모아 다리를 이었어요. 뒤따라오던 꼬마 토끼도 폴짝 건너왔답니다. “이 다리는 모두의 다리야!”'
                : '잠든 정원에서 동그란 씨앗 세 개를 발견했어요. 폭신한 흙에 심고 물을 나누어 주자, 복숭아빛과 민트빛, 꿀빛 꽃이 활짝 피었어요. 꽃들이 서로 손을 잡듯 휘어지며 비밀 길을 열어 주었지요.',
              state.owlChoice === 'listen'
                ? '나무 아래 부엉이가 날개를 꼭 모으고 있었어요. “첫 무대가 너무 떨려.” 두 친구는 재촉하지 않고 곁에 앉았어요. 물방울, 나뭇잎, 별빛… 부엉이의 작은 노래를 듣고 반딧불들도 모여들었어요.'
                : '나무 아래 부엉이가 노래를 잊어버려 속상해하고 있었어요. “우리 같이 부르자!” 별빛, 물방울, 나뭇잎, 별빛! 둘의 노래가 셋의 노래가 되었어요. 부엉이도 축제에 함께 가기로 했답니다.',
              state.ending === 'sky'
                ? '산딸기 등불, 초승달 등불, 꼬마별 등불에 빛이 켜졌어요. 두 친구가 손을 펼치자 빛이 별이 되어 밤하늘로 둥실 올라갔어요. 달빛 나무가 눈을 뜨고 웃었어요. “내 생일에 별까지 만들어 주었구나!”'
                : '세 개의 등불이 켜지자 두 친구는 따뜻한 빛을 숲속 집마다 나누어 주었어요. 창문에도, 작은 계단에도 노란 빛이 내려앉았지요. 달빛 나무가 눈을 떴어요. “오늘은 누구도 어두운 길로 돌아가지 않겠구나!”',
              state.route === 'river'
                ? '축제가 끝난 뒤에도 나무다리는 그 자리에 남았어요. 다음에 이 숲에 오면 친구들이 다리 위에서 반갑게 손을 흔들어 줄 거예요.'
                : '축제가 끝난 뒤에도 세 송이 꽃은 그 자리에 남았어요. 다음에 이 숲에 오면 나비들과 꽃들이 가장 먼저 두 친구를 알아볼 거예요.',
            ],
    reward:
      state.owlChoice === 'listen' ? '반딧불 친구 배지' : '부엉이 합창단 배지',
    routeMemory,
    owlMemory,
  };
}

/** Persisted data is untrusted. Reject impossible progression, duplicate IDs and oversized text. */
export function sanitizeForestState(input: unknown): ForestState | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.edition !== undefined && value.edition !== 2) return null;
  if (
    value.craftDesign !== undefined &&
    value.craftDesign !== 'star' &&
    value.craftDesign !== 'heart'
  )
    return null;
  if (
    value.edition !== 2 &&
    (value.craftDesign !== undefined || value.discoveries !== undefined)
  )
    return null;
  if (
    value.difficulty !== undefined &&
    (typeof value.difficulty !== 'string' ||
      !['simple', 'standard', 'challenge'].includes(value.difficulty))
  )
    return null;
  const difficulty = (value.difficulty ?? 'standard') as ForestDifficulty;
  if (
    value.version !== 1 ||
    typeof value.route !== 'string' ||
    !['undecided', 'river', 'garden'].includes(value.route) ||
    typeof value.chapter !== 'string' ||
    !Object.keys(chapterLabels).includes(value.chapter)
  )
    return null;
  for (const key of ['bridges', 'hasWater', 'gardenBloom', 'owlHelped'])
    if (typeof value[key] !== 'boolean') return null;
  if (
    value.owlChoice !== null &&
    value.owlChoice !== 'listen' &&
    value.owlChoice !== 'invite'
  )
    return null;
  if (
    value.ending !== null &&
    value.ending !== 'sky' &&
    value.ending !== 'home'
  )
    return null;
  if (
    typeof value.melody !== 'number' ||
    !Number.isInteger(value.melody) ||
    value.melody < 0 ||
    value.melody > 5
  )
    return null;
  if (
    typeof value.moves !== 'number' ||
    !Number.isInteger(value.moves) ||
    value.moves < 0 ||
    value.moves > 100000
  )
    return null;
  if (typeof value.message !== 'string' || value.message.length > 500)
    return null;
  const arrayIds = (
    key: string,
    allowed: readonly string[],
  ): string[] | null => {
    const items = value[key];
    if (
      !Array.isArray(items) ||
      items.length > allowed.length ||
      Array.from(items).some(
        (item) => typeof item !== 'string' || !allowed.includes(item),
      ) ||
      new Set(items).size !== items.length
    )
      return null;
    return [...items];
  };
  const collected = arrayIds(
    'collected',
    value.route === 'river'
      ? FOREST_WOOD_IDS
      : value.route === 'garden'
        ? FOREST_SEED_IDS
        : [],
  );
  const planted = arrayIds('planted', FOREST_BED_IDS);
  const watered = arrayIds('watered', FOREST_BED_IDS);
  const lanterns = arrayIds('lanterns', FOREST_LANTERN_IDS);
  const discoveries =
    value.discoveries === undefined
      ? []
      : arrayIds('discoveries', FOREST_DISCOVERY_IDS);
  if (
    !discoveries ||
    discoveries.length > 2 ||
    (discoveries.length > 0 && value.route === 'undecided') ||
    (value.route === 'river' && discoveries.includes('secret-mushroom')) ||
    (value.route === 'garden' && discoveries.includes('secret-shell'))
  )
    return null;
  if (!collected || !planted || !watered || !lanterns) return null;
  if (
    planted.length > collected.length ||
    watered.some((id) => !planted.includes(id))
  )
    return null;
  if (
    value.route !== 'garden' &&
    (planted.length || watered.length || value.hasWater || value.gardenBloom)
  )
    return null;
  if (watered.length && !value.hasWater) return null;
  if (value.gardenBloom !== (value.route === 'garden' && watered.length === 3))
    return null;
  if (value.bridges && (value.route !== 'river' || collected.length !== 3))
    return null;
  if (value.edition === 2) {
    const crafted = value.craftDesign !== undefined;
    if (crafted && (collected.length !== 3 || value.chapter === 'arrival'))
      return null;
    if (value.route === 'river' && value.bridges !== crafted) return null;
    if (value.route === 'garden' && value.hasWater !== crafted) return null;
    if (value.route === 'undecided' && crafted) return null;
  }
  if (value.owlHelped !== (value.owlChoice !== null)) return null;
  if (
    value.chapter === 'arrival' &&
    (value.route !== 'undecided' || collected.length || value.moves !== 0)
  )
    return null;
  if (value.chapter !== 'arrival' && value.route === 'undecided') return null;
  const crossed = ['grove', 'festival', 'complete'].includes(value.chapter);
  if (!crossed && discoveries.includes('secret-star')) return null;
  if (crossed && !(value.route === 'river' ? value.bridges : value.gardenBloom))
    return null;
  if (!crossed && (value.owlChoice !== null || value.melody !== 0)) return null;
  if (value.owlChoice === null && value.melody !== 0) return null;
  const melodyLength = getForestMelody({
    difficulty,
    owlChoice: value.owlChoice as ForestOwlChoice | null,
  }).length;
  if (value.chapter === 'grove' && value.melody >= melodyLength) return null;
  const festivalReached =
    value.chapter === 'festival' || value.chapter === 'complete';
  if (festivalReached && (!value.owlHelped || value.melody !== melodyLength))
    return null;
  if (!festivalReached && lanterns.length) return null;
  if (
    value.chapter === 'complete'
      ? value.ending === null || lanterns.length !== 3
      : value.ending !== null
  )
    return null;
  return {
    version: 1,
    ...(value.edition === 2 ? { edition: 2 as const } : {}),
    ...(value.craftDesign !== undefined
      ? { craftDesign: value.craftDesign as ForestCraftDesign }
      : {}),
    ...(value.discoveries !== undefined ? { discoveries } : {}),
    ...(value.difficulty === undefined ? {} : { difficulty }),
    route: value.route as ForestRoute,
    chapter: value.chapter as ForestChapter,
    collected,
    bridges: value.bridges as boolean,
    planted,
    watered,
    hasWater: value.hasWater as boolean,
    gardenBloom: value.gardenBloom as boolean,
    owlHelped: value.owlHelped as boolean,
    owlChoice: value.owlChoice as ForestOwlChoice | null,
    melody: value.melody,
    lanterns,
    ending: value.ending as ForestEndingChoice | null,
    message: value.message,
    moves: value.moves,
  };
}
