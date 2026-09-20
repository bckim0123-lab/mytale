import {
  sanitizeForestState,
  type ForestState,
  type ForestDifficulty,
} from './forest-story';

export const COMPANION_SAVE_KEY = 'drawing-friend-companion-v1';
export const MAX_COMPANION_SAVE_BYTES = 512 * 1024;
export const MAX_COMPANION_BOOKS = 100;
const SAVE_SCHEMA = 2;
const LOCK_NAME = `${COMPANION_SAVE_KEY}:write`;
const kinds = ['sprout', 'bunny', 'cat', 'bear'] as const;
const accessories = ['star', 'flower', 'scarf'] as const;

export type CompanionKind = (typeof kinds)[number];
export type CompanionAccessory = (typeof accessories)[number];
export type CompanionAppearance = {
  kind: CompanionKind;
  bodyColor: string;
  accentColor: string;
  accessory: CompanionAccessory;
  pattern?: 'plain' | 'heart' | 'spots';
  earStyle?: 'upright' | 'floppy';
  /** Opaque SHA-256 key. Image bytes live in IndexedDB, never this record. */
  drawingAssetId?: string;
};

export type CompanionStoryChoices = {
  route: 'river' | 'garden';
  owl: 'listen' | 'invite';
  ending: 'sky' | 'home';
};

export type CompanionStoryBook = {
  id: string;
  title: string;
  pages: string[];
  createdAt: number;
  ending: string;
  /** A book remembers its own hero, even after the current friend is restyled. */
  heroName?: string;
  heroAppearance?: CompanionAppearance;
  choices?: CompanionStoryChoices;
  /** Explicit worlds belong to the original illustrated adventures, not the 3D forest plot. */
  illustrationTheme?:
    | 'forest'
    | 'ocean'
    | 'cloud'
    | 'space'
    | 'dino'
    | 'candy'
    | 'aurora'
    | 'garden';
  chapterTitles?: string[];
};

/** Only game choices and an optional local nickname belong in this record. */
export type CompanionSave = {
  version: 1;
  name: string;
  appearance: CompanionAppearance;
  completedAdventures: number;
  unlockedAccessories: CompanionAccessory[];
  equippedAccessory: CompanionAccessory;
  storyBooks: CompanionStoryBook[];
  forest: ForestState | null;
  updatedAt: number;
  persona?: { likes: string; traits: string; ability: string; quirk: string };
  playDifficulty?: ForestDifficulty;
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type CompanionSaveResult = { ok: true } | { ok: false; error: string };

/** A generation changes only on an explicit reset, invalidating every old tab. */
export type CompanionSnapshot = {
  generation: string;
  revision: number;
  save: CompanionSave | null;
};
export type CompanionReadResult =
  | { status: 'ready'; save: CompanionSave; snapshot: CompanionSnapshot }
  | { status: 'empty'; snapshot: CompanionSnapshot }
  | { status: 'corrupt' | 'future' | 'unavailable'; error: string };
export type CompanionWriteResult =
  | {
      ok: true;
      save: CompanionSave;
      snapshot: CompanionSnapshot;
      merged: boolean;
    }
  | {
      ok: false;
      code:
        | 'invalid'
        | 'corrupt'
        | 'future'
        | 'unavailable'
        | 'full'
        | 'conflict'
        | 'reset';
      error: string;
      latest?: CompanionSnapshot;
    };
export type CompanionWriteOptions = {
  /** Keep the snapshot from hydration/your last successful write, not a fresh read. */
  base: CompanionSnapshot;
  storage?: StorageLike;
};

const defaultAppearance: CompanionAppearance = {
  kind: 'sprout',
  bodyColor: '#f4dfc1',
  accentColor: '#91c6a2',
  accessory: 'star',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is CompanionKind {
  return typeof value === 'string' && kinds.includes(value as CompanionKind);
}

function isAccessory(value: unknown): value is CompanionAccessory {
  return (
    typeof value === 'string' &&
    accessories.includes(value as CompanionAccessory)
  );
}

function color(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value)) {
    return `#${value
      .slice(1)
      .split('')
      .map((digit) => digit.repeat(2))
      .join('')}`.toLowerCase();
  }
  return null;
}

/** Convert untrusted appearance inputs into a small, renderer-safe palette. */
export function safeAppearance(input: unknown): CompanionAppearance {
  const value = isRecord(input) ? input : {};
  return {
    kind: isKind(value.kind) ? value.kind : defaultAppearance.kind,
    bodyColor: color(value.bodyColor) ?? defaultAppearance.bodyColor,
    accentColor: color(value.accentColor) ?? defaultAppearance.accentColor,
    accessory: isAccessory(value.accessory)
      ? value.accessory
      : defaultAppearance.accessory,
    pattern:
      value.pattern === 'heart' || value.pattern === 'spots'
        ? value.pattern
        : 'plain',
    earStyle: value.earStyle === 'floppy' ? 'floppy' : 'upright',
    ...(typeof value.drawingAssetId === 'string' &&
    /^[a-f0-9]{64}$/.test(value.drawingAssetId)
      ? { drawingAssetId: value.drawingAssetId }
      : {}),
  };
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        code !== 127 && (code >= 32 || code === 9 || code === 10 || code === 13)
      );
    })
    .join('')
    .trim();
  // Preserve emoji families and combining marks as one visible character.
  const characters =
    typeof Intl.Segmenter === 'function'
      ? Array.from(
          new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(clean),
          (part) => part.segment,
        )
      : Array.from(clean);
  return characters.slice(0, limit).join('');
}

function isCount(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maximum
  );
}

function sanitizeBook(input: unknown): CompanionStoryBook | null {
  if (
    !isRecord(input) ||
    !Array.isArray(input.pages) ||
    !isCount(input.createdAt)
  )
    return null;
  const id = text(input.id, 80);
  const title = text(input.title, 80);
  const ending = text(input.ending, 300);
  if (
    !id ||
    !title ||
    !ending ||
    input.pages.length === 0 ||
    input.pages.length > 12 ||
    text(input.title, 81) !== title ||
    text(input.id, 81) !== id ||
    text(input.ending, 301) !== ending
  )
    return null;
  // A book is a keepsake: reject oversized content, never quietly cut its ending.
  const pages = Array.from(input.pages, (page) => {
    const bounded = text(page, 600);
    return bounded === text(page, 601) ? bounded : null;
  });
  if (pages.some((page) => !page)) return null;
  let chapterTitles: string[] | undefined;
  if (input.chapterTitles !== undefined) {
    if (
      !Array.isArray(input.chapterTitles) ||
      input.chapterTitles.length !== pages.length
    )
      return null;
    const titles = Array.from(input.chapterTitles, (chapter) => {
      const bounded = text(chapter, 80);
      return bounded && bounded === text(chapter, 81) ? bounded : null;
    });
    if (titles.some((chapter) => !chapter)) return null;
    chapterTitles = titles as string[];
  }
  const illustrationThemes = [
    'forest',
    'ocean',
    'cloud',
    'space',
    'dino',
    'candy',
    'aurora',
    'garden',
  ] as const;
  if (
    input.illustrationTheme !== undefined &&
    !illustrationThemes.includes(
      input.illustrationTheme as (typeof illustrationThemes)[number],
    )
  )
    return null;
  const heroName = text(input.heroName, 24);
  const choices = isRecord(input.choices) ? input.choices : null;
  const validChoices =
    choices &&
    (choices.route === 'river' || choices.route === 'garden') &&
    (choices.owl === 'listen' || choices.owl === 'invite') &&
    (choices.ending === 'sky' || choices.ending === 'home');
  return {
    id,
    title,
    pages: pages as string[],
    createdAt: input.createdAt,
    ending,
    ...(chapterTitles ? { chapterTitles } : {}),
    ...(input.illustrationTheme !== undefined
      ? {
          illustrationTheme:
            input.illustrationTheme as CompanionStoryBook['illustrationTheme'],
        }
      : {}),
    ...(heroName ? { heroName } : {}),
    ...(isRecord(input.heroAppearance)
      ? { heroAppearance: safeAppearance(input.heroAppearance) }
      : {}),
    ...(validChoices
      ? {
          choices: {
            route: choices.route as CompanionStoryChoices['route'],
            owl: choices.owl as CompanionStoryChoices['owl'],
            ending: choices.ending as CompanionStoryChoices['ending'],
          },
        }
      : {}),
  };
}

/** Explicit allowlists also prevent accidental persistence of images or chat. */
export function sanitizeCompanionSave(input: unknown): CompanionSave | null {
  if (!isRecord(input) || input.version !== 1) return null;
  const name = text(input.name, 24);
  const appearance = input.appearance;
  if (
    !name ||
    !isRecord(appearance) ||
    !isKind(appearance.kind) ||
    !color(appearance.bodyColor) ||
    !color(appearance.accentColor) ||
    !isAccessory(appearance.accessory) ||
    !isAccessory(input.equippedAccessory) ||
    !isCount(input.completedAdventures, 100_000) ||
    !isCount(input.updatedAt) ||
    !Array.isArray(input.unlockedAccessories) ||
    !Array.isArray(input.storyBooks) ||
    input.storyBooks.length > MAX_COMPANION_BOOKS
  )
    return null;

  const unlockedAccessories = [
    ...new Set(input.unlockedAccessories.filter(isAccessory)),
  ];
  if (!unlockedAccessories.includes('star'))
    unlockedAccessories.unshift('star');
  const equippedAccessory = unlockedAccessories.includes(
    input.equippedAccessory,
  )
    ? input.equippedAccessory
    : 'star';
  const storyBooks: CompanionStoryBook[] = [];
  const seenBooks = new Map<string, CompanionStoryBook>();
  // Validate every book. Capacity is reported before writing, never by truncation.
  for (const entry of input.storyBooks) {
    const book = sanitizeBook(entry);
    if (!book) return null;
    const previousBook = seenBooks.get(book.id);
    if (previousBook && !equal(previousBook, book)) return null;
    if (!previousBook) {
      storyBooks.push(book);
      seenBooks.set(book.id, book);
    }
  }
  storyBooks.sort((a, b) => b.createdAt - a.createdAt);
  const forest =
    input.forest === null ? null : sanitizeForestState(input.forest);
  if (input.forest !== null && forest === null) return null;

  return {
    version: 1,
    name,
    appearance: { ...safeAppearance(appearance), accessory: equippedAccessory },
    completedAdventures: input.completedAdventures,
    unlockedAccessories,
    equippedAccessory,
    storyBooks,
    forest,
    updatedAt: input.updatedAt,
    ...(input.playDifficulty === 'simple' ||
    input.playDifficulty === 'standard' ||
    input.playDifficulty === 'challenge'
      ? { playDifficulty: input.playDifficulty }
      : {}),
    ...(isRecord(input.persona)
      ? {
          persona: {
            likes: text(input.persona.likes, 80) ?? '',
            traits: text(input.persona.traits, 80) ?? '',
            ability: text(input.persona.ability, 100) ?? '',
            quirk: text(input.persona.quirk, 100) ?? '',
          },
        }
      : {}),
  };
}

export function createCompanionSave(
  overrides: Partial<CompanionSave> = {},
): CompanionSave {
  const initial: CompanionSave = {
    version: 1,
    name: '몽글',
    appearance: { ...defaultAppearance },
    completedAdventures: 0,
    unlockedAccessories: ['star'],
    equippedAccessory: 'star',
    storyBooks: [],
    forest: null,
    updatedAt: Date.now(),
  };
  return sanitizeCompanionSave({ ...initial, ...overrides }) ?? initial;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  // Accessing localStorage itself can throw in private/restricted browsers.
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function loadCompanionSave(storage?: StorageLike): CompanionSave | null {
  const result = readCompanionSave(storage);
  return result.status === 'ready' ? result.save : null;
}

export function readCompanionSave(storage?: StorageLike): CompanionReadResult {
  let raw: string | null;
  try {
    const target = resolveStorage(storage);
    if (!target)
      return {
        status: 'unavailable',
        error: '이 브라우저에서는 모험을 저장할 수 없어요.',
      };
    raw = target.getItem(COMPANION_SAVE_KEY);
  } catch {
    return {
      status: 'unavailable',
      error:
        '이 브라우저의 저장 공간에 접근할 수 없어요. 기록은 바꾸지 않았어요.',
    };
  }
  try {
    if (raw === null)
      return {
        status: 'empty',
        snapshot: { generation: 'initial', revision: 0, save: null },
      };
    if (byteLength(raw) > MAX_COMPANION_SAVE_BYTES)
      return {
        status: 'corrupt',
        error:
          '저장된 파일이 너무 커서 열지 못했어요. 원본은 그대로 보관하고 있어요.',
      };
    const parsed: unknown = JSON.parse(raw);
    if (
      isRecord(parsed) &&
      ((typeof parsed.schema === 'number' && parsed.schema > SAVE_SCHEMA) ||
        (typeof parsed.version === 'number' && parsed.version > 1))
    )
      return {
        status: 'future',
        error:
          '더 새로운 버전에서 저장한 모험이에요. 앱을 새로고침해 주세요. 기록은 바꾸지 않았어요.',
      };
    const envelope = isRecord(parsed) && parsed.schema === SAVE_SCHEMA;
    if (
      envelope &&
      (typeof parsed.generation !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(parsed.generation) ||
        !isCount(parsed.revision))
    )
      return {
        status: 'corrupt',
        error:
          '저장된 기록을 읽지 못했어요. 덮어쓰지 않고 그대로 보관하고 있어요.',
      };
    const generation = envelope ? (parsed.generation as string) : 'initial';
    const revision = envelope ? (parsed.revision as number) : 0;
    if (envelope && parsed.save === null)
      return {
        status: 'empty',
        snapshot: { generation, revision, save: null },
      };
    if (
      envelope &&
      isRecord(parsed.save) &&
      typeof parsed.save.version === 'number' &&
      parsed.save.version > 1
    )
      return {
        status: 'future',
        error:
          '더 새로운 버전에서 저장한 모험이에요. 앱을 새로고침해 주세요. 기록은 바꾸지 않았어요.',
      };
    const save = sanitizeCompanionSave(envelope ? parsed.save : parsed);
    if (!save)
      return {
        status: 'corrupt',
        error:
          '저장된 기록을 읽지 못했어요. 덮어쓰지 않고 그대로 보관하고 있어요.',
      };
    return { status: 'ready', save, snapshot: { generation, revision, save } };
  } catch {
    return {
      status: 'corrupt',
      error: '저장된 기록을 읽지 못했어요. 원본은 지우거나 덮어쓰지 않았어요.',
    };
  }
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Three-way field merge preserves changes from another tab and every new book. */
export function mergeCompanionChanges(
  incoming: CompanionSave,
  current: CompanionSave,
  base: CompanionSave | null,
): CompanionSave | null {
  let conflict = false;
  const field = <T>(next: T, stored: T, before: T | undefined): T => {
    if (equal(next, stored)) return next;
    if (equal(next, before)) return stored;
    if (equal(stored, before)) return next;
    // Without a base, only the compatibility entry point does an intentional replace.
    if (before === undefined && base === null) return next;
    conflict = true;
    return stored;
  };
  const books = new Map(current.storyBooks.map((book) => [book.id, book]));
  const oldBooks = new Map(base?.storyBooks.map((book) => [book.id, book]));
  for (const book of incoming.storyBooks) {
    const previous = books.get(book.id);
    if (!previous) books.set(book.id, book);
    else books.set(book.id, field(book, previous, oldBooks.get(book.id)));
  }
  const appearance: CompanionAppearance = {
    kind: field(
      incoming.appearance.kind,
      current.appearance.kind,
      base?.appearance.kind,
    ),
    bodyColor: field(
      incoming.appearance.bodyColor,
      current.appearance.bodyColor,
      base?.appearance.bodyColor,
    ),
    accentColor: field(
      incoming.appearance.accentColor,
      current.appearance.accentColor,
      base?.appearance.accentColor,
    ),
    accessory: field(
      incoming.equippedAccessory,
      current.equippedAccessory,
      base?.equippedAccessory,
    ),
    pattern: field(
      incoming.appearance.pattern,
      current.appearance.pattern,
      base?.appearance.pattern,
    ),
    earStyle: field(
      incoming.appearance.earStyle,
      current.appearance.earStyle,
      base?.appearance.earStyle,
    ),
    drawingAssetId: field(
      incoming.appearance.drawingAssetId,
      current.appearance.drawingAssetId,
      base?.appearance.drawingAssetId,
    ),
  };
  const merged: CompanionSave = {
    ...incoming,
    name: field(incoming.name, current.name, base?.name),
    appearance,
    equippedAccessory: appearance.accessory,
    forest: field(incoming.forest, current.forest, base?.forest),
    persona: field(incoming.persona, current.persona, base?.persona),
    playDifficulty: field(
      incoming.playDifficulty,
      current.playDifficulty,
      base?.playDifficulty,
    ),
    unlockedAccessories: [
      ...new Set([
        ...incoming.unlockedAccessories,
        ...current.unlockedAccessories,
      ]),
    ],
    completedAdventures: Math.max(
      incoming.completedAdventures,
      current.completedAdventures,
      books.size,
    ),
    storyBooks: [...books.values()],
    updatedAt: Math.max(incoming.updatedAt, current.updatedAt),
  };
  return conflict ? null : merged;
}

function writeCompanionSave(
  data: CompanionSave,
  storage?: StorageLike,
  base?: CompanionSnapshot,
): CompanionWriteResult {
  try {
    const target = resolveStorage(storage);
    const latest = readCompanionSave(storage);
    if (latest.status !== 'ready' && latest.status !== 'empty')
      return {
        ok: false,
        code: latest.status,
        error: latest.error,
      };
    if (!target)
      return {
        ok: false,
        code: 'unavailable',
        error: '기기 저장 공간에 접근할 수 없어요.',
      };
    if (
      (base && base.generation !== latest.snapshot.generation) ||
      (!base &&
        latest.status === 'empty' &&
        latest.snapshot.generation !== 'initial')
    )
      return {
        ok: false,
        code: 'reset',
        latest: latest.snapshot,
        error:
          '다른 창에서 기록을 지웠어요. 이전 기록을 되살리지 않도록 저장을 멈췄어요.',
      };
    if (data.storyBooks.length > MAX_COMPANION_BOOKS)
      return {
        ok: false,
        code: 'full',
        error:
          '동화책이 100권 모였어요. 먼저 파일로 보관해 주세요. 기존 책은 지우지 않았어요.',
      };
    let sanitized = sanitizeCompanionSave(data);
    if (!sanitized)
      return {
        ok: false,
        code: 'invalid',
        error: '모험 정보를 확인하지 못했어요. 기존 기록은 그대로 두었어요.',
      };
    const merged = Boolean(base && latest.snapshot.revision !== base.revision);
    if (latest.status === 'ready') {
      sanitized = mergeCompanionChanges(
        sanitized,
        latest.save,
        base ? (base.save ?? createCompanionSave()) : null,
      );
      if (!sanitized)
        return {
          ok: false,
          code: 'conflict',
          latest: latest.snapshot,
          error:
            '다른 창에서도 같은 친구나 모험을 바꿨어요. 어느 기록을 쓸지 확인할 때까지 저장을 멈췄어요.',
        };
    }
    if (sanitized.storyBooks.length > MAX_COMPANION_BOOKS)
      return {
        ok: false,
        code: 'full',
        error:
          '다른 창의 책까지 합치면 100권을 넘어요. 먼저 파일로 보관해 주세요. 기존 책은 지우지 않았어요.',
      };
    const safe = sanitizeCompanionSave(sanitized);
    if (!safe)
      return {
        ok: false,
        code: 'invalid',
        error:
          '합친 모험 정보를 확인하지 못했어요. 기존 기록은 그대로 두었어요.',
      };
    const snapshot = {
      generation: latest.snapshot.generation,
      revision: latest.snapshot.revision + 1,
      save: safe,
    };
    const serialized = JSON.stringify({ schema: SAVE_SCHEMA, ...snapshot });
    if (byteLength(serialized) > MAX_COMPANION_SAVE_BYTES)
      return {
        ok: false,
        code: 'full',
        error:
          '동화책 보관함이 가득 찼어요. 먼저 파일로 보관해 주세요. 기존 책은 지우지 않았어요.',
      };
    target.setItem(COMPANION_SAVE_KEY, serialized);
    return { ok: true, save: safe, snapshot, merged };
  } catch {
    return {
      ok: false,
      code: 'unavailable',
      error:
        '기기 저장 공간이 부족하거나 저장이 꺼져 있어요. 기록을 파일로 보관해 주세요. 기존 저장은 바꾸지 않았어요.',
    };
  }
}

async function withStorageLock<T>(work: () => T): Promise<T> {
  // Supported browsers serialize the entire read/merge/write transaction across tabs.
  // The fallback still rereads immediately before writing and rejects stale generations.
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(LOCK_NAME, work);
  }
  return work();
}

export async function persistCompanionSave(
  data: CompanionSave,
  options: CompanionWriteOptions,
): Promise<CompanionWriteResult> {
  return withStorageLock(() =>
    writeCompanionSave(data, options.storage, options.base),
  );
}

/** Compatibility wrapper. New UI code must use persistCompanionSave with its base snapshot. */
export function saveCompanionSave(
  data: CompanionSave,
  storage?: StorageLike,
): CompanionSaveResult {
  const result = writeCompanionSave(data, storage);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

function generationId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `reset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function clearCompanionSave(storage?: StorageLike): CompanionSaveResult {
  try {
    const target = resolveStorage(storage);
    if (!target)
      return {
        ok: false,
        error: '이 브라우저의 저장 공간에 접근할 수 없어요.',
      };
    // A tiny tombstone, not removeItem: an old tab cannot restore deleted books.
    target.setItem(
      COMPANION_SAVE_KEY,
      JSON.stringify({
        schema: SAVE_SCHEMA,
        generation: generationId(),
        revision: 0,
        save: null,
      }),
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: '저장된 모험을 지우지 못했어요. 다시 시도해 주세요.',
    };
  }
}

export async function resetCompanionSave(
  storage?: StorageLike,
): Promise<CompanionSaveResult> {
  return withStorageLock(() => clearCompanionSave(storage));
}

export type CompanionBackupResult =
  | { ok: true; json: string }
  | { ok: false; error: string };
export type CompanionImportResult =
  | { ok: true; save: CompanionSave }
  | { ok: false; error: string };

export function serializeCompanionBackup(
  data: CompanionSave,
): CompanionBackupResult {
  const save = sanitizeCompanionSave(data);
  if (!save)
    return {
      ok: false,
      error:
        '보관할 모험 정보를 확인하지 못했어요. 기존 기록은 바꾸지 않았어요.',
    };
  const json = JSON.stringify({
    format: 'drawing-friend-backup',
    version: 1,
    exportedAt: Date.now(),
    save,
  });
  if (byteLength(json) > MAX_COMPANION_SAVE_BYTES)
    return {
      ok: false,
      error: '보관 파일이 너무 커요. 기존 기록은 바꾸지 않았어요.',
    };
  return { ok: true, json };
}

/** Validation only; importing is a separate, explicit persist with a current base. */
export function parseCompanionBackup(json: string): CompanionImportResult {
  try {
    if (byteLength(json) > MAX_COMPANION_SAVE_BYTES)
      return {
        ok: false,
        error:
          '파일이 너무 커요. 512KB 이하의 그림친구 보관 파일을 골라 주세요.',
      };
    const parsed: unknown = JSON.parse(json);
    if (
      !isRecord(parsed) ||
      parsed.format !== 'drawing-friend-backup' ||
      parsed.version !== 1
    )
      return {
        ok: false,
        error: '이 버전에서 열 수 있는 그림친구 보관 파일이 아니에요.',
      };
    const save = sanitizeCompanionSave(parsed.save);
    if (!save)
      return {
        ok: false,
        error:
          '파일 속 모험 정보를 확인하지 못했어요. 지금 기록은 바꾸지 않았어요.',
      };
    return { ok: true, save };
  } catch {
    return {
      ok: false,
      error: '보관 파일을 읽지 못했어요. 지금 기록은 바꾸지 않았어요.',
    };
  }
}
