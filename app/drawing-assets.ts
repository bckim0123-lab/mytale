'use client';

import { COMPANION_SAVE_KEY, readCompanionSave } from './companion-save';

/** Only a finished, explicitly kept character is stored. Original photos never enter this DB. */
const DATABASE = 'drawing-friend-artworks';
const TABLE = 'characters';
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const WRITE_LOCK = `${COMPANION_SAVE_KEY}:write`;
const ASSET_EPOCH_KEY = 'drawing-friend-artworks-epoch';
export type DrawingAsset = {
  id: string;
  png: string;
  createdAt: number;
  name?: string;
  persona?: DrawingAssetPersona;
};
export type DrawingAssetPersona = {
  likes: string;
  traits: string;
  ability: string;
  quirk: string;
};
export type DrawingAssetWriteOptions = {
  expectedGeneration?: string;
  cancelled?: () => boolean;
  persona?: DrawingAssetPersona;
};
export type DrawingAssetClearOptions = {
  expectedGeneration?: string;
  preserveCurrentGeneration?: boolean;
};
type StoredDrawingAsset = DrawingAsset & { generation?: string };
type WriteContext = {
  generation: string;
  epoch: string;
  cancelled?: () => boolean;
};
let fallbackWrites: Promise<unknown> = Promise.resolve();

export function captureDrawingGeneration(): string {
  const state = readCompanionSave();
  if (state.status !== 'ready' && state.status !== 'empty')
    throw new Error(state.error);
  return state.snapshot.generation;
}

function assetEpoch(): string {
  try {
    return window.localStorage.getItem(ASSET_EPOCH_KEY) ?? 'initial';
  } catch {
    throw new Error('친구 그림의 저장 상태를 확인하지 못했어요.');
  }
}

function writeContext(options: DrawingAssetWriteOptions): WriteContext {
  const context = {
    generation: options.expectedGeneration ?? captureDrawingGeneration(),
    epoch: assetEpoch(),
    cancelled: options.cancelled,
  };
  assertCurrent(context);
  return context;
}

function assertCurrent(context: WriteContext): void {
  if (context.cancelled?.()) throw new Error('친구 그림 저장을 취소했어요.');
  if (
    captureDrawingGeneration() !== context.generation ||
    assetEpoch() !== context.epoch
  ) {
    throw new Error(
      '다른 창에서 기록을 지웠어요. 이전 그림을 다시 저장하지 않았어요.',
    );
  }
}

async function withWriteLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request)
    return navigator.locks.request(WRITE_LOCK, work);
  // Same-tab serialization remains available on old browsers without Web Locks.
  const pending = fallbackWrites.then(work, work);
  fallbackWrites = pending.catch(() => undefined);
  return pending;
}

function notifyArtworkChange(): void {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event('drawing-friend-artworks-changed'));
}

function publicAsset(asset: DrawingAsset): DrawingAsset {
  return {
    id: asset.id,
    png: asset.png,
    createdAt: asset.createdAt,
    ...(asset.name ? { name: asset.name } : {}),
    ...(asset.persona
      ? {
          persona: {
            likes: asset.persona.likes,
            traits: asset.persona.traits,
            ability: asset.persona.ability,
            quirk: asset.persona.quirk,
          },
        }
      : {}),
  };
}

function isVisibleAsset(
  asset: unknown,
  generation: string,
): asset is StoredDrawingAsset {
  if (!validDrawingAsset(asset)) return false;
  const stored = asset as StoredDrawingAsset;
  return (
    stored.generation === generation ||
    (!stored.generation && generation === 'initial')
  );
}

/** Inspect PNG IHDR before asking a browser to allocate a decoded bitmap. */
function boundedPng(png: string): boolean {
  try {
    const prefix = png.slice(png.indexOf(',') + 1, png.indexOf(',') + 49);
    const bytes = Uint8Array.from(atob(prefix), (ch) => ch.charCodeAt(0));
    if (
      bytes.length < 24 ||
      String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
    )
      return false;
    const header = new DataView(bytes.buffer);
    const width = header.getUint32(16),
      height = header.getUint32(20);
    return (
      width > 0 &&
      height > 0 &&
      width <= 4096 &&
      height <= 4096 &&
      width * height <= 4_194_304
    );
  } catch {
    return false;
  }
}

export function validDrawingAsset(value: unknown): value is DrawingAsset {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<DrawingAsset>;
  return (
    typeof item.id === 'string' &&
    /^[a-f0-9]{64}$/.test(item.id) &&
    typeof item.png === 'string' &&
    item.png.length <= MAX_IMAGE_BYTES * 1.38 &&
    /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(item.png) &&
    boundedPng(item.png) &&
    typeof item.createdAt === 'number' &&
    Number.isSafeInteger(item.createdAt) &&
    item.createdAt > 0 &&
    (item.name === undefined ||
      (typeof item.name === 'string' && item.name.length <= 24)) &&
    (item.persona === undefined || validPersona(item.persona))
  );
}

function validPersona(value: unknown): value is DrawingAssetPersona {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const persona = value as Partial<DrawingAssetPersona>;
  return (
    typeof persona.likes === 'string' &&
    persona.likes.length <= 80 &&
    typeof persona.traits === 'string' &&
    persona.traits.length <= 80 &&
    typeof persona.ability === 'string' &&
    persona.ability.length <= 100 &&
    typeof persona.quirk === 'string' &&
    persona.quirk.length <= 100
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let settled = false;
    request.onupgradeneeded = () =>
      request.result.createObjectStore(TABLE, { keyPath: 'id' });
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      settled = true;
      reject(new Error('친구 그림을 보관할 공간을 열지 못했어요.'));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error('다른 그림친구 창을 닫고 다시 시도해 주세요.'));
    };
  });
}

export async function artworkId(png: string): Promise<string> {
  const encoded = png.split(',')[1] ?? '';
  if (encoded.length > MAX_IMAGE_BYTES * 1.38)
    throw new Error('친구 그림이 너무 커요.');
  const bytes = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    throw new Error('친구 그림이 너무 커요.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}

export async function keepDrawingAsset(
  png: string,
  name?: string,
  options: DrawingAssetWriteOptions = {},
): Promise<DrawingAsset> {
  // Capture before SHA/decode awaits; a reset during that work invalidates this operation.
  const context = writeContext(options);
  const asset = {
    id: await artworkId(png),
    png,
    createdAt: Date.now(),
    ...(name ? { name: name.trim().slice(0, 24) } : {}),
    ...(options.persona ? { persona: options.persona } : {}),
  };
  if (!validDrawingAsset(asset))
    throw new Error('완성된 PNG 캐릭터 그림만 보관할 수 있어요.');
  await putAssets([asset], context);
  return publicAsset(asset);
}

export async function putDrawingAssets(
  assets: DrawingAsset[],
  options: DrawingAssetWriteOptions = {},
): Promise<void> {
  return putAssets(assets, writeContext(options));
}

async function putAssets(
  assets: DrawingAsset[],
  context: WriteContext,
): Promise<void> {
  if (assets.length > 100)
    throw new Error('한 번에 가져올 수 있는 친구 그림은 100개까지예요.');
  // Verify every checksum before opening the write transaction.
  const validated: DrawingAsset[] = [];
  for (const asset of assets) {
    assertCurrent(context);
    if (!validDrawingAsset(asset) || (await artworkId(asset.png)) !== asset.id)
      throw new Error('백업의 친구 그림이 손상되어 가져오지 않았어요.');
    validated.push(publicAsset(asset));
  }
  await withWriteLock(async () => {
    assertCurrent(context);
    const db = await openDatabase();
    try {
      assertCurrent(context);
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(TABLE, 'readwrite');
        const store = transaction.objectStore(TABLE);
        const request = store.getAll();
        request.onsuccess = () => {
          try {
            assertCurrent(context);
            const ids = new Set<string>(
              request.result
                .filter((asset: unknown) =>
                  isVisibleAsset(asset, context.generation),
                )
                .map((asset: DrawingAsset) => asset.id),
            );
            for (const asset of validated) ids.add(asset.id);
            if (ids.size > 100)
              throw new Error(
                '친구 보관함에 100명이 모였어요. 먼저 파일로 보관해 주세요. 기존 친구는 지우지 않았어요.',
              );
            for (const asset of validated)
              store.put({ ...asset, generation: context.generation });
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(
            new Error(
              '친구 그림을 저장하지 못했어요. 저장 공간을 확인해 주세요.',
            ),
          );
        transaction.onabort = () =>
          reject(
            new Error('친구 그림 저장이 중단됐어요. 기존 그림은 그대로예요.'),
          );
      });
    } finally {
      db.close();
    }
  });
  notifyArtworkChange();
}

export async function readDrawingAsset(
  id: string,
): Promise<DrawingAsset | null> {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  const generation = captureDrawingGeneration();
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(TABLE).objectStore(TABLE).get(id);
      request.onsuccess = () => {
        try {
          resolve(
            captureDrawingGeneration() === generation &&
              isVisibleAsset(request.result, generation)
              ? publicAsset(request.result)
              : null,
          );
        } catch {
          resolve(null);
        }
      };
      request.onerror = () =>
        reject(new Error('보관한 친구 그림을 읽지 못했어요.'));
    });
  } finally {
    db.close();
  }
}

export async function listDrawingAssets(): Promise<DrawingAsset[]> {
  const generation = captureDrawingGeneration();
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(TABLE).objectStore(TABLE).getAll();
      request.onsuccess = () => {
        try {
          resolve(
            captureDrawingGeneration() === generation
              ? request.result
                  .filter((asset: unknown) => isVisibleAsset(asset, generation))
                  .map(publicAsset)
                  .sort(
                    (a: DrawingAsset, b: DrawingAsset) =>
                      b.createdAt - a.createdAt,
                  )
              : [],
          );
        } catch {
          resolve([]);
        }
      };
      request.onerror = () => reject(new Error('친구 보관함을 읽지 못했어요.'));
    });
  } finally {
    db.close();
  }
}

export async function clearDrawingAssets(
  options: DrawingAssetClearOptions = {},
): Promise<void> {
  const generation = options.expectedGeneration ?? captureDrawingGeneration();
  await withWriteLock(async () => {
    if (captureDrawingGeneration() !== generation)
      throw new Error(
        '다른 창에서 기록이 다시 바뀌었어요. 그림 삭제를 다시 확인해 주세요.',
      );
    // Invalidate already-started standalone asset imports as well as metadata resets.
    // Preserve-current-generation resets must not cancel legitimate post-reset imports.
    if (!options.preserveCurrentGeneration)
      window.localStorage.setItem(ASSET_EPOCH_KEY, crypto.randomUUID());
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(TABLE, 'readwrite');
        const store = transaction.objectStore(TABLE);
        if (options.preserveCurrentGeneration) {
          const request = store.getAll();
          request.onsuccess = () => {
            for (const asset of request.result as StoredDrawingAsset[]) {
              if (asset.generation !== generation) store.delete(asset.id);
            }
          };
        } else store.clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(new Error('보관한 친구 그림을 지우지 못했어요.'));
        transaction.onabort = () =>
          reject(new Error('친구 그림 삭제가 중단됐어요.'));
      });
    } finally {
      db.close();
    }
  });
  notifyArtworkChange();
}

export async function portableArtwork(png: string): Promise<string> {
  // Normalize to a reasonably sized transparent PNG, without retaining metadata.
  if (
    !png.startsWith('data:image/png;base64,') ||
    !boundedPng(png) ||
    png.length > 12 * 1024 * 1024
  )
    throw new Error('크기가 적절한 PNG 캐릭터 그림이 필요해요.');
  const image = new Image();
  image.src = png;
  await image.decode();
  const scale = Math.min(
    1,
    720 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('친구 그림을 준비하지 못했어요.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export function downloadLocalFile(
  name: string,
  value: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
