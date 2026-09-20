import { sanitizeForestState, type ForestState } from './forest-story';

export const COMPANION_SAVE_KEY = 'drawing-friend-companion-v1';
const MAX_SAVE_BYTES = 64 * 1024;
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
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type CompanionSaveResult = { ok: true } | { ok: false; error: string };

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
  if (!id || !title || !ending || input.pages.length === 0) return null;
  const pages = input.pages.slice(0, 12).map((page) => text(page, 600));
  if (pages.some((page) => !page)) return null;
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
    !Array.isArray(input.storyBooks)
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
  const seenBookIds = new Set<string>();
  // Validate all retained books, then preserve the ten most recent, regardless
  // of whether the caller appends or prepends new stories.
  for (const entry of input.storyBooks) {
    const book = sanitizeBook(entry);
    if (!book) return null;
    if (!seenBookIds.has(book.id)) {
      storyBooks.push(book);
      seenBookIds.add(book.id);
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
    storyBooks: storyBooks.slice(0, 10),
    forest,
    updatedAt: input.updatedAt,
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
  try {
    const raw = resolveStorage(storage)?.getItem(COMPANION_SAVE_KEY);
    if (!raw || byteLength(raw) > MAX_SAVE_BYTES) return null;
    return sanitizeCompanionSave(JSON.parse(raw));
  } catch {
    // A failed read must never prevent playing or overwrite the existing save.
    return null;
  }
}

export function saveCompanionSave(
  data: CompanionSave,
  storage?: StorageLike,
): CompanionSaveResult {
  try {
    const target = resolveStorage(storage);
    if (!target)
      return { ok: false, error: '이 브라우저에서는 모험을 저장할 수 없어요.' };
    const sanitized = sanitizeCompanionSave(data);
    if (!sanitized)
      return {
        ok: false,
        error: '모험 정보를 확인하지 못했어요. 다시 시도해 주세요.',
      };
    const serialized = JSON.stringify(sanitized);
    if (byteLength(serialized) > MAX_SAVE_BYTES) {
      return {
        ok: false,
        error:
          '동화책 보관함이 가득 찼어요. 책을 정리한 뒤 다시 저장해 주세요.',
      };
    }
    target.setItem(COMPANION_SAVE_KEY, serialized);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        '기기 저장 공간이 부족하거나 저장이 꺼져 있어요. 지금 모험은 계속할 수 있어요.',
    };
  }
}

export function clearCompanionSave(storage?: StorageLike): CompanionSaveResult {
  try {
    const target = resolveStorage(storage);
    if (!target)
      return {
        ok: false,
        error: '이 브라우저의 저장 공간에 접근할 수 없어요.',
      };
    target.removeItem(COMPANION_SAVE_KEY);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: '저장된 모험을 지우지 못했어요. 다시 시도해 주세요.',
    };
  }
}
