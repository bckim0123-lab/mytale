import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { getCompanionNavigationPath, isForestWalkablePoint } =
    await server.ssrLoadModule('/app/companion-world-runtime.ts');
  const { FOREST_LOCATIONS } = await server.ssrLoadModule(
    '/app/forest-story.ts',
  );
  const start = { x: 0, z: 3.3 };
  let verifiedRoutes = 0;

  // These fixed landmarks catch accidental collision/geometry misalignment.
  assert.equal(
    isForestWalkablePoint({ x: 4.2, z: -1.8 }, false),
    false,
    'The creek is impassable before construction.',
  );
  assert.equal(
    isForestWalkablePoint({ x: 4.2, z: -1.8 }, true),
    true,
    'The completed bridge must be walkable.',
  );
  assert.equal(
    isForestWalkablePoint({ x: 2, z: -1.8 }, true),
    false,
    'Building a bridge does not remove the whole creek.',
  );
  assert.equal(isForestWalkablePoint({ x: 7, z: -1.8 }, true), false);
  assert.equal(
    isForestWalkablePoint({ x: 4.2, z: 0.1 }, false),
    true,
    'The construction marker is on dry land.',
  );
  assert.equal(
    isForestWalkablePoint({ x: 4.2, z: -3.4 }, true),
    true,
    'The river gate is on the far bank.',
  );

  function assertSafePath(from, target, bridgeBuilt, exactDestination = true) {
    const original = JSON.stringify({ from, target });
    const route = getCompanionNavigationPath(from, target, bridgeBuilt);
    assert.ok(
      route.length > 0,
      `No route found: ${JSON.stringify({ from, target, bridgeBuilt })}`,
    );
    assert.equal(
      JSON.stringify({ from, target }),
      original,
      'Navigation must not mutate its inputs.',
    );
    let previous = from;
    for (const next of route) {
      assert.ok(
        isForestWalkablePoint(next, bridgeBuilt),
        'Every waypoint is on dry land or the bridge.',
      );
      const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
      const samples = Math.max(1, Math.ceil(distance / 0.01));
      for (let sample = 0; sample <= samples; sample++) {
        const fraction = sample / samples;
        const position = {
          x: previous.x + (next.x - previous.x) * fraction,
          z: previous.z + (next.z - previous.z) * fraction,
        };
        assert.ok(
          isForestWalkablePoint(position, bridgeBuilt),
          `Path crosses water: ${JSON.stringify({ from, target, bridgeBuilt, previous, next, position })}`,
        );
      }
      previous = next;
    }
    if (exactDestination)
      assert.deepEqual(
        route.at(-1),
        target,
        'A reachable hotspot must not silently redirect elsewhere.',
      );
    verifiedRoutes++;
    return route;
  }

  for (const bridgeBuilt of [false, true]) {
    // The +0.5 approach matches the runtime's walk-to interaction position.
    const points = [
      start,
      ...Object.values(FOREST_LOCATIONS).map(({ x, z }) => ({ x, z: z + 0.5 })),
    ].filter((point) => isForestWalkablePoint(point, bridgeBuilt));
    for (const from of points)
      for (const target of points) assertSafePath(from, target, bridgeBuilt);
  }

  const southBank = { x: 4.2, z: 0.1 };
  const northBank = { x: 4.2, z: -3.4 };
  const detour = assertSafePath(southBank, northBank, false);
  const crossing = assertSafePath(southBank, northBank, true);
  assert.ok(
    detour.length > crossing.length,
    'Bridge construction must open a direct crossing.',
  );
  assert.equal(crossing.length, 1);

  for (const target of [
    { x: 4.2, z: -1.8 },
    { x: 7, z: -2 },
    { x: 2, z: -1.5 },
    { x: 100, z: -100 },
  ]) {
    assertSafePath(start, target, false, false);
  }
  assert.equal(isForestWalkablePoint({ x: NaN, z: 0 }, false), false);
  assert.equal(isForestWalkablePoint({ x: 0, z: Infinity }, true), false);
  console.log(
    `Forest navigation smoke passed: ${verifiedRoutes} collision-safe routes, both bridge states and safe water/out-of-bounds destinations.`,
  );
} finally {
  await server.close();
}
