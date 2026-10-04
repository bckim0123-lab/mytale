import sharp from 'sharp';
import { access } from 'node:fs/promises';

const [drawingPath, resultPath] = process.argv.slice(2);
if (!drawingPath || !resultPath)
  throw new Error(
    'Supply the original synthetic drawing and the actual approved API result.',
  );
const assets = [
  [drawingPath, 'public/practice-whale-drawing-v1.webp'],
  [resultPath, 'public/practice-whale-result-v1.webp'],
];
for (const [source, destination] of assets) {
  const exists = await access(destination).then(
    () => true,
    () => false,
  );
  if (exists)
    throw new Error(
      `Choose a new versioned filename instead of replacing ${destination}`,
    );
  // Format compression only: no crop, recoloring, compositing or invented result.
  const output = await sharp(source)
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(destination);
  console.log(
    JSON.stringify({
      destination,
      width: output.width,
      height: output.height,
      bytes: output.size,
    }),
  );
}
