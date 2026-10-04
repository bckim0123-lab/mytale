import {
  MAX_COMPANION_BOOKS,
  MAX_COMPANION_SAVE_BYTES,
  sanitizeCompanionSave,
  type CompanionSave,
} from './companion-save';
import {
  artworkId,
  readDrawingAsset,
  validDrawingAsset,
  type DrawingAsset,
  type DrawingAssetMetadata,
} from './drawing-assets';

export const FAMILY_BACKUP_PART_PNG_BUDGET = 24 * 1024 * 1024;
export const FAMILY_BACKUP_MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ASSETS = 100;
const MAX_PNG_LENGTH = Math.floor(3 * 1024 * 1024 * 1.38);

export type FamilyBackupPartInfo = {
  bundleId: string;
  /** One-based file number. Counts describe this file, not the entire bundle. */
  index: number;
  total: number;
  assetCount: number;
  bookCount: number;
};
export type FamilyBackupPart = {
  index: number;
  assetIds: readonly string[];
  bookIds: readonly string[];
  pngLength: number;
};
export type FamilyBackupPlan = {
  bundleId: string;
  exportedAt: number;
  save: CompanionSave;
  metadata: readonly DrawingAssetMetadata[];
  parts: readonly FamilyBackupPart[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const boundedInteger = (value: unknown, minimum: number, maximum: number) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= minimum &&
  value <= maximum;
const validBundleId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);

/** Absent information is an ordinary v1 backup; malformed present info fails. */
export function parseFamilyBackupPartInfo(
  value: unknown,
): FamilyBackupPartInfo | null {
  if (value === undefined || value === null) return null;
  if (
    !isRecord(value) ||
    !validBundleId(value.bundleId) ||
    !boundedInteger(value.total, 1, MAX_ASSETS) ||
    !boundedInteger(value.index, 1, value.total as number) ||
    !boundedInteger(value.assetCount, 0, MAX_ASSETS) ||
    !boundedInteger(value.bookCount, 0, MAX_COMPANION_BOOKS)
  )
    throw new Error('분할 백업 정보를 확인하지 못했어요.');
  return {
    bundleId: value.bundleId,
    index: value.index as number,
    total: value.total as number,
    assetCount: value.assetCount as number,
    bookCount: value.bookCount as number,
  };
}

function metadataSnapshot(value: DrawingAssetMetadata): DrawingAssetMetadata {
  if (
    !isRecord(value) ||
    !/^[a-f0-9]{64}$/.test(value.id) ||
    !boundedInteger(value.createdAt, 1, Number.MAX_SAFE_INTEGER) ||
    !boundedInteger(value.pngLength, 1, MAX_PNG_LENGTH) ||
    (value.name !== undefined &&
      (typeof value.name !== 'string' || value.name.length > 24))
  )
    throw new Error('친구 보관함 정보를 확인하지 못했어요.');
  const snapshot: DrawingAssetMetadata = {
    id: value.id,
    createdAt: value.createdAt,
    pngLength: value.pngLength,
  };
  if (value.name !== undefined) snapshot.name = value.name;
  if (value.persona !== undefined) {
    const persona = value.persona;
    if (
      !isRecord(persona) ||
      typeof persona.likes !== 'string' ||
      persona.likes.length > 80 ||
      typeof persona.traits !== 'string' ||
      persona.traits.length > 80 ||
      typeof persona.ability !== 'string' ||
      persona.ability.length > 100 ||
      typeof persona.quirk !== 'string' ||
      persona.quirk.length > 100
    )
      throw new Error('친구의 이름과 취향 정보를 확인하지 못했어요.');
    snapshot.persona = {
      likes: persona.likes,
      traits: persona.traits,
      ability: persona.ability,
      quirk: persona.quirk,
    };
  }
  return snapshot;
}

function freezeSnapshot(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
}

function recordFor(save: CompanionSave, exportedAt: number) {
  return { format: 'drawing-friend-backup', version: 1, exportedAt, save };
}

/** Pure metadata-only planning. No artwork reads, writes or deletion occur here. */
export function createFamilyBackupPlan(
  save: CompanionSave,
  metadata: readonly DrawingAssetMetadata[],
  options: { bundleId: string; exportedAt: number },
): FamilyBackupPlan {
  if (
    !validBundleId(options.bundleId) ||
    !boundedInteger(options.exportedAt, 1, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(metadata) ||
    metadata.length > MAX_ASSETS
  )
    throw new Error('분할 백업으로 보관할 기록을 확인하지 못했어요.');
  const snapshot = sanitizeCompanionSave(structuredClone(save));
  if (!snapshot) throw new Error('백업할 모험 정보를 확인하지 못했어요.');
  if (
    new TextEncoder().encode(
      JSON.stringify(recordFor(snapshot, options.exportedAt)),
    ).byteLength > MAX_COMPANION_SAVE_BYTES
  )
    throw new Error('이야기와 설정이 너무 커서 안전한 백업을 만들지 못했어요.');
  const summaries = metadata
    .map(metadataSnapshot)
    .sort(
      (a, b) =>
        b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const byId = new Map(summaries.map((asset) => [asset.id, asset]));
  if (byId.size !== summaries.length)
    throw new Error('같은 친구의 정보가 중복되어 백업을 멈췄어요.');
  const activeId = snapshot.appearance.drawingAssetId;
  const required = [
    activeId,
    ...snapshot.storyBooks.map((book) => book.heroAppearance?.drawingAssetId),
  ];
  if (required.some((id) => id !== undefined && !byId.has(id)))
    throw new Error(
      '책에 필요한 친구 그림이 일부 없어요. 그림이 포함된 기존 백업을 먼저 가져와 주세요.',
    );
  const activeLength = activeId ? byId.get(activeId)!.pngLength : 0;
  const groups: { assetIds: string[]; pngLength: number }[] = [];
  let group = { assetIds: activeId ? [activeId] : [], pngLength: activeLength };
  for (const asset of summaries) {
    if (asset.id === activeId) continue;
    if (group.pngLength + asset.pngLength > FAMILY_BACKUP_PART_PNG_BUDGET) {
      groups.push(group);
      group = { assetIds: activeId ? [activeId] : [], pngLength: activeLength };
    }
    if (group.pngLength + asset.pngLength > FAMILY_BACKUP_PART_PNG_BUDGET)
      throw new Error('한 친구 그림이 분할 백업의 크기 제한을 넘었어요.');
    group.assetIds.push(asset.id);
    group.pngLength += asset.pngLength;
  }
  groups.push(group);
  const owner = new Map<string, number>();
  groups.forEach((part, index) => {
    for (const id of part.assetIds) if (!owner.has(id)) owner.set(id, index);
  });
  const parts: FamilyBackupPart[] = groups.map((part, index) => ({
    index: index + 1,
    assetIds: part.assetIds,
    pngLength: part.pngLength,
    bookIds: snapshot.storyBooks
      .filter((book) => {
        const heroId = book.heroAppearance?.drawingAssetId;
        return (heroId ? owner.get(heroId) : 0) === index;
      })
      .map((book) => book.id),
  }));
  const plan: FamilyBackupPlan = {
    bundleId: options.bundleId,
    exportedAt: options.exportedAt,
    save: snapshot,
    metadata: summaries,
    parts,
  };
  freezeSnapshot(plan);
  return plan;
}

/** Build only the requested file. This is not an atomic restore of a whole bundle. */
export async function buildFamilyBackupPart(
  plan: FamilyBackupPlan,
  index: number,
  options: {
    assertCurrent: () => void | Promise<void>;
    readAsset?: (id: string) => Promise<DrawingAsset | null>;
  },
): Promise<{ json: string; part: FamilyBackupPartInfo }> {
  if (!boundedInteger(index, 1, plan.parts.length))
    throw new Error('저장할 분할 백업 파일을 다시 골라 주세요.');
  const selected = plan.parts[index - 1];
  const readAsset = options.readAsset ?? readDrawingAsset;
  const assets: DrawingAsset[] = [];
  await options.assertCurrent();
  for (const id of selected.assetIds) {
    const summary = plan.metadata.find((asset) => asset.id === id);
    if (!summary) throw new Error('분할 백업의 친구 정보를 확인하지 못했어요.');
    await options.assertCurrent();
    const stored = await readAsset(id);
    await options.assertCurrent();
    if (
      !stored ||
      stored.id !== id ||
      !validDrawingAsset(stored) ||
      stored.png.length !== summary.pngLength ||
      (await artworkId(stored.png)) !== id
    )
      throw new Error(
        '친구 그림이 없거나 손상되어 이 백업 파일을 만들지 않았어요.',
      );
    await options.assertCurrent();
    const asset: DrawingAsset = {
      id,
      png: stored.png,
      createdAt: summary.createdAt,
    };
    // A name/persona edited after planning must not leak into an older snapshot.
    if (summary.name !== undefined) asset.name = summary.name;
    if (summary.persona !== undefined) asset.persona = { ...summary.persona };
    assets.push(asset);
  }
  const bookIds = new Set(selected.bookIds);
  const save = {
    ...plan.save,
    storyBooks: plan.save.storyBooks.filter((book) => bookIds.has(book.id)),
  };
  const part: FamilyBackupPartInfo = {
    bundleId: plan.bundleId,
    index,
    total: plan.parts.length,
    assetCount: assets.length,
    bookCount: save.storyBooks.length,
  };
  const json = JSON.stringify({
    format: 'drawing-friend-family-backup',
    version: 1,
    record: recordFor(save, plan.exportedAt),
    assets,
    part,
  });
  if (new TextEncoder().encode(json).byteLength > FAMILY_BACKUP_MAX_FILE_BYTES)
    throw new Error('이 백업 파일이 32MB를 넘어 만들지 않았어요.');
  await options.assertCurrent();
  return { json, part };
}
