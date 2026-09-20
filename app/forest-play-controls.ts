import type { ForestState } from './forest-story';

/** Shared UI gate: a modal cannot skip materials, legacy progress or a finished craft. */
export function forestToyFor(
  state: ForestState,
  id: string,
): 'bridge' | 'garden' | null {
  if (
    state.edition !== 2 ||
    state.chapter !== 'crossing' ||
    state.collected.length !== 3
  )
    return null;
  if (state.route === 'river' && id === 'river-bridge' && !state.bridges)
    return 'bridge';
  if (state.route === 'garden' && id === 'garden-water' && !state.hasWater)
    return 'garden';
  return null;
}

export function forestToyStillCurrent(
  state: ForestState,
  opened: { kind: 'bridge' | 'garden'; moves: number; stateKey: string },
): boolean {
  return (
    JSON.stringify(state) === opened.stateKey &&
    state.moves === opened.moves &&
    forestToyFor(
      state,
      opened.kind === 'bridge' ? 'river-bridge' : 'garden-water',
    ) === opened.kind
  );
}
