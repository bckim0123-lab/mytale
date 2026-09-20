/** Generate the same real mesh companions used by the app as portable GLBs.
 * Run: node scripts/build-creature-assets.mjs (no API, Blender, or downloads). */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';

class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;
  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((value) => {
        this.result = value;
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((value) => {
        this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}
globalThis.FileReader ??= NodeFileReader;
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.dirname(scriptsDir);
const tempDir = await fs.mkdtemp(path.join(scriptsDir, '.creature-build-'));
const assetDir = path.join(repoDir, 'public', 'characters');
try {
  for (const name of [
    'creature-types',
    'drawing-creature-rig',
    'creature-rig',
  ]) {
    const source = await fs.readFile(
      path.join(repoDir, 'app', `${name}.ts`),
      'utf8',
    );
    const compiled = ts
      .transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      })
      .outputText.replaceAll("'./creature-types'", "'./creature-types.mjs'")
      .replaceAll("'./drawing-creature-rig'", "'./drawing-creature-rig.mjs'");
    await fs.writeFile(path.join(tempDir, `${name}.mjs`), compiled);
  }
  const { createCreature, createCreatureAnimations, CREATURE_VARIANTS } =
    await import(pathToFileURL(path.join(tempDir, 'creature-rig.mjs')).href);
  await fs.mkdir(assetDir, { recursive: true });
  for (const [kind, appearance] of Object.entries(CREATURE_VARIANTS)) {
    const rig = createCreature(appearance);
    const clips = createCreatureAnimations();
    const data = await new GLTFExporter().parseAsync(rig.root, {
      binary: true,
      animations: clips,
      onlyVisible: true,
    });
    if (!(data instanceof ArrayBuffer)) throw new Error('Expected binary GLB');
    // Round-trip the asset through the actual production loader before saving.
    const loaded = await new GLTFLoader().parseAsync(data, '');
    let meshCount = 0,
      triangles = 0;
    loaded.scene.traverse((node) => {
      if (node.isMesh) {
        meshCount++;
        triangles += node.geometry.index
          ? node.geometry.index.count / 3
          : node.geometry.attributes.position.count / 3;
      }
    });
    const size = new Box3().setFromObject(loaded.scene).getSize(new Vector3());
    if (
      !meshCount ||
      loaded.animations.length !== 8 ||
      !loaded.scene.getObjectByName('HeadPivot')
    )
      throw new Error(`Invalid rig asset: ${kind}`);
    if (meshCount > 80)
      throw new Error(`Draw call budget exceeded: ${kind}: ${meshCount}`);
    await fs.writeFile(
      path.join(assetDir, `${kind}-v1.glb`),
      Buffer.from(data),
    );
    console.log(
      `${kind}: ${Math.round(data.byteLength / 1024)} KB, ${meshCount} meshes, ${triangles} triangles, ${loaded.animations.length} clips, ${size.y.toFixed(2)}m tall`,
    );
    rig.dispose();
    loaded.scene.traverse((node) => {
      if (node.isMesh) {
        node.geometry.dispose();
        for (const mat of Array.isArray(node.material)
          ? node.material
          : [node.material])
          mat.dispose();
      }
    });
  }
  // New personalization must work on every species, not just the marketing pose.
  // Keep the four default downloadable assets backward-compatible, then exercise
  // every optional shape in the live rig used by the game and the storybook.
  let checked = 0;
  for (const [kind, appearance] of Object.entries(CREATURE_VARIANTS)) {
    for (const pattern of ['plain', 'heart', 'spots']) {
      for (const earStyle of ['upright', 'floppy']) {
        const rig = createCreature({ ...appearance, pattern, earStyle });
        const label = `${kind}/${pattern}/${earStyle}`;
        try {
          if (pattern === 'heart' && !rig.root.getObjectByName('HeartTummy'))
            throw new Error(`Missing heart: ${label}`);
          if (pattern === 'spots' && !rig.root.getObjectByName('ForeheadSpot'))
            throw new Error(`Missing spots: ${label}`);
          let meshes = 0;
          rig.root.traverse((node) => {
            if (!node.isMesh) return;
            meshes++;
            for (const component of node.geometry.attributes.position.array) {
              if (!Number.isFinite(component))
                throw new Error(`Non-finite geometry: ${label}/${node.name}`);
            }
          });
          if (meshes > 80)
            throw new Error(
              `Personalized rig draw-call budget exceeded: ${label}`,
            );
          for (let frame = 0; frame < 180; frame++) {
            rig.update(1 / 60, frame / 60, {
              moving: frame < 90,
              speed: 1.5,
              action: frame < 90 ? 'idle' : 'wave',
            });
          }
          const size = new Box3()
            .setFromObject(rig.root)
            .getSize(new Vector3());
          if (
            ![size.x, size.y, size.z].every(
              (value) => Number.isFinite(value) && value > 0 && value < 4,
            )
          ) {
            throw new Error(`Invalid personalized rig bounds: ${label}`);
          }
          checked++;
        } finally {
          rig.dispose();
        }
      }
    }
  }
  console.log(
    `Personalization QA: ${checked} species/pattern/ear combinations, geometry and animated bounds passed`,
  );
} finally {
  if (
    path.dirname(tempDir) === scriptsDir &&
    path.basename(tempDir).startsWith('.creature-build-')
  ) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
