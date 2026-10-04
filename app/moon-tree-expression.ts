/** A finite, replay-safe pose for the story's final living tree. No timers,
 * renderer, save data or random state: the existing world owns its clock. */
export function moonTreeExpression(
  ending: 'sky' | 'home' | null | undefined,
  secondsSinceChoice: number | null,
  reducedMotion: boolean,
) {
  if (ending !== 'sky' && ending !== 'home')
    return { eyeOpen: 0, stretch: 0, wave: 0 };
  // A restored ending (null) already happened. It must not wake up again.
  const elapsed =
    secondsSinceChoice === null
      ? 8
      : Number.isFinite(secondsSinceChoice)
        ? Math.max(0, secondsSinceChoice)
        : 0;
  const raw = reducedMotion ? 1 : Math.min(1, elapsed / 2.4);
  const progress = raw * raw * (3 - 2 * raw);
  // Two gentle branch waves, then a still, warm final pose. A home ending
  // waves goodbye; a sky ending opens the sleepy eyes and stretches instead.
  const wave =
    !reducedMotion && ending === 'home' && elapsed < 4
      ? Math.sin(elapsed * Math.PI) * Math.sin((elapsed / 4) * Math.PI) * 0.07
      : 0;
  return {
    eyeOpen: ending === 'sky' ? progress : 0,
    stretch: progress * (ending === 'sky' ? 0.14 : 0.06),
    wave,
  };
}
