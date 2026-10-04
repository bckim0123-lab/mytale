import { spawnSync } from 'node:child_process';

const npm = process.env.npm_execpath;
if (!npm) {
  console.error('Run this gate with npm run check:offline.');
  process.exit(1);
}
// A deployment may have real provider credentials. Never give them, or the
// opt-in HTTP/live-test flags, to regression-check subprocesses.
const env = {
  ...process.env,
  OPENAI_API_KEY: '',
  TEST_BASE_URL: '',
  TEST_LIVE_AI: '0',
  WRANGLER_SEND_METRICS: 'false',
};
const checks = [
  'typecheck',
  'lint:app',
  'test:safety',
  'test:privacy',
  'test:adventure',
  'test:generation',
  'test:character-quality',
  'test:companion',
  'test:creature',
  'test:forest-play',
];
for (const check of checks) {
  const result = spawnSync(process.execPath, [npm, 'run', check], {
    env,
    stdio: 'inherit',
    timeout: 180_000,
  });
  if (result.error || result.status !== 0) {
    console.error(`Release check failed: ${check}${result.error ? ` (${result.error.code})` : ''}`);
    process.exit(result.status || 1);
  }
}
console.log('All offline release checks passed. No live-provider test flags or keys were passed to the checks.');
