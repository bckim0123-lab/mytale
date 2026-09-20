export type ForestToyKind = 'bridge' | 'garden';
export type ForestToyDifficulty = 'simple' | 'standard' | 'challenge';
export type ForestToyDesign = 'star' | 'heart';
export type ForestToyState = {
  version: 1;
  kind: ForestToyKind;
  difficulty: ForestToyDifficulty;
  turns: number[];
  stage: 'puzzle' | 'design' | 'complete';
  design: ForestToyDesign | null;
  moves: number;
  hintsUsed: number;
  assistedPieces: number;
};
export type ForestToyEvent =
  | { type: 'rotate'; index: number; direction?: 1 | -1 }
  | { type: 'hint' }
  | { type: 'assist' }
  | { type: 'design'; design: ForestToyDesign }
  | { type: 'finish' }
  | { type: 'restart' };

export const WATER_PORT = { north: 1, east: 2, south: 4, west: 8 } as const;
// Pond enters the middle-left tile. The center divides into three paths ending
// at flowers on the right. Blank upper/lower-left squares are garden decoration.
export const GARDEN_PIPES = [0, 6, 10, 10, 15, 10, 0, 3, 10] as const;
const opposite = [4, 8, 1, 2] as const;
const directions = [1, 2, 4, 8] as const;
const dx = [0, 1, 0, -1] as const;
const dy = [-1, 0, 1, 0] as const;

export function toyTurnCount(
  state: Pick<ForestToyState, 'kind' | 'difficulty'>,
): number {
  return state.kind === 'bridge' && state.difficulty !== 'simple' ? 8 : 4;
}
export function movableToyPieces(
  state: Pick<ForestToyState, 'kind' | 'difficulty'>,
): number[] {
  const count =
    state.difficulty === 'simple' ? 2 : state.difficulty === 'standard' ? 3 : 4;
  return state.kind === 'bridge'
    ? Array.from({ length: count }, (_, index) => index)
    : [1, 7, 2, 5].slice(0, count);
}
export function createForestToy(
  kind: ForestToyKind,
  difficulty: ForestToyDifficulty,
): ForestToyState {
  const safeKind = kind === 'garden' ? 'garden' : 'bridge';
  const safeDifficulty =
    difficulty === 'simple' || difficulty === 'challenge'
      ? difficulty
      : 'standard';
  const turns = Array.from(
    {
      length:
        safeKind === 'garden'
          ? 9
          : movableToyPieces({ kind: safeKind, difficulty: safeDifficulty })
              .length,
    },
    () => 0,
  );
  for (const [order, index] of movableToyPieces({
    kind: safeKind,
    difficulty: safeDifficulty,
  }).entries())
    turns[index] =
      safeKind === 'garden'
        ? order % 2
          ? 3
          : 1
        : safeDifficulty === 'simple'
          ? 1
          : [2, 3, 1, 6][order];
  return {
    version: 1,
    kind: safeKind,
    difficulty: safeDifficulty,
    turns,
    stage: 'puzzle',
    design: null,
    moves: 0,
    hintsUsed: 0,
    assistedPieces: 0,
  };
}

export function turnedWaterPorts(ports: number, turns: number): number {
  const normalized = ((turns % 4) + 4) % 4;
  let result = ports;
  for (let index = 0; index < normalized; index += 1)
    result = ((result << 1) & 15) | ((result >> 3) & 1);
  return result;
}

export type ForestToyView = {
  solved: boolean;
  connected: number[];
  flowers: boolean[];
  correct: number;
  total: number;
  hintIndex: number | null;
  hintSteps: number;
};
export function getForestToyView(state: ForestToyState): ForestToyView {
  const movable = movableToyPieces(state);
  const count = toyTurnCount(state);
  if (state.kind === 'bridge') {
    const aligned = state.turns.map((turn) => turn % (count / 2) === 0);
    const connected: number[] = [];
    for (let index = 0; index < aligned.length && aligned[index]; index += 1)
      connected.push(index);
    const hintIndex = movable.find((index) => !aligned[index]) ?? null;
    return {
      solved: aligned.every(Boolean),
      connected,
      flowers: [],
      correct: aligned.filter(Boolean).length,
      total: movable.length,
      hintIndex,
      hintSteps:
        hintIndex === null
          ? 0
          : count / 2 - (state.turns[hintIndex] % (count / 2)),
    };
  }
  const ports = GARDEN_PIPES.map((pipe, index) =>
    turnedWaterPorts(pipe, state.turns[index]),
  );
  const connected = new Set<number>();
  const queue = ports[3] & WATER_PORT.west ? [3] : [];
  while (queue.length) {
    const current = queue.shift()!;
    if (connected.has(current)) continue;
    connected.add(current);
    for (let direction = 0; direction < directions.length; direction += 1) {
      if (!(ports[current] & directions[direction])) continue;
      const x = (current % 3) + dx[direction],
        y = Math.floor(current / 3) + dy[direction];
      if (x < 0 || x > 2 || y < 0 || y > 2) continue;
      const neighbor = y * 3 + x;
      if (ports[neighbor] & opposite[direction]) queue.push(neighbor);
    }
  }
  const flowers = [2, 5, 8].map(
    (index) => connected.has(index) && Boolean(ports[index] & WATER_PORT.east),
  );
  const hintIndex =
    movable.find((index) => ports[index] !== GARDEN_PIPES[index]) ?? null;
  return {
    solved: flowers.every(Boolean),
    connected: [...connected],
    flowers,
    correct: flowers.filter(Boolean).length,
    total: 3,
    hintIndex,
    hintSteps:
      hintIndex === null
        ? 0
        : GARDEN_PIPES[hintIndex] === 10
          ? 2 - (state.turns[hintIndex] % 2)
          : 4 - (state.turns[hintIndex] % 4),
  };
}

export function transitionForestToy(
  state: ForestToyState,
  event: ForestToyEvent,
): ForestToyState {
  if (event.type === 'restart')
    return createForestToy(state.kind, state.difficulty);
  if (state.stage === 'complete') return state;
  if (event.type === 'finish')
    return state.stage === 'design' &&
      state.design &&
      getForestToyView(state).solved
      ? { ...state, stage: 'complete' }
      : state;
  if (event.type === 'design')
    return state.stage === 'design' &&
      (event.design === 'star' || event.design === 'heart')
      ? { ...state, design: event.design }
      : state;
  if (state.stage !== 'puzzle') return state;
  if (event.type === 'hint')
    return { ...state, hintsUsed: state.hintsUsed + 1 };
  const index =
    event.type === 'assist' ? getForestToyView(state).hintIndex : event.index;
  if (
    index === null ||
    !Number.isInteger(index) ||
    !movableToyPieces(state).includes(index)
  )
    return state;
  if (
    event.type === 'rotate' &&
    event.direction !== undefined &&
    event.direction !== 1 &&
    event.direction !== -1
  )
    return state;
  const turns = [...state.turns];
  const count = toyTurnCount(state);
  turns[index] =
    event.type === 'assist'
      ? 0
      : (turns[index] + (event.direction ?? 1) + count) % count;
  const next = {
    ...state,
    turns,
    moves: state.moves + 1,
    assistedPieces: state.assistedPieces + (event.type === 'assist' ? 1 : 0),
  };
  return getForestToyView(next).solved ? { ...next, stage: 'design' } : next;
}
