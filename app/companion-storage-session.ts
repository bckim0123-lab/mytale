import {
  createCompanionSave,
  mergeCompanionChanges,
  persistCompanionSave,
  readCompanionSave,
  resetCompanionSave,
  sanitizeCompanionSave,
  type CompanionSave,
  type CompanionSaveResult,
  type CompanionSnapshot,
  type CompanionWriteOptions,
  type CompanionWriteResult,
  type StorageLike,
} from './companion-save';

export type CompanionStorageState = {
  save: CompanionSave;
  hydrated: boolean;
  saveError: string;
  blocked: boolean;
  saving: boolean;
};
type Update = CompanionSave | ((current: CompanionSave) => CompanionSave);
type Persist = (
  save: CompanionSave,
  options: CompanionWriteOptions,
) => Promise<CompanionWriteResult>;

/** Framework-independent transaction queue; the React hook only subscribes to it. */
export class CompanionStorageSession {
  private state: CompanionStorageState;
  private base: CompanionSnapshot | null = null;
  private listeners = new Set<(state: CompanionStorageState) => void>();
  private sequence = 0;
  private dirty = false;
  private pending: Promise<void> | null = null;
  private operation = false;

  constructor(
    private options: {
      initialName?: string;
      storage?: StorageLike;
      persist?: Persist;
    } = {},
  ) {
    this.state = {
      save: createCompanionSave({
        name: options.initialName?.trim() || '몽글',
      }),
      hydrated: false,
      saveError: '',
      blocked: false,
      saving: false,
    };
  }

  getState = (): CompanionStorageState => this.state;
  subscribe = (
    listener: (state: CompanionStorageState) => void,
  ): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<CompanionStorageState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.state);
  }

  hydrate = (): void => {
    if (this.state.hydrated) return;
    this.adoptStored();
  };

  private adoptStored(): void {
    const result = readCompanionSave(this.options.storage);
    if (result.status === 'ready' || result.status === 'empty') {
      this.base = result.snapshot;
      this.dirty = false;
      this.publish({
        save:
          result.status === 'ready'
            ? result.save
            : createCompanionSave({
                name: this.options.initialName?.trim() || '몽글',
              }),
        hydrated: true,
        blocked: false,
        saveError: '',
      });
    } else {
      this.publish({ hydrated: true, blocked: true, saveError: result.error });
    }
  }

  commitSave = (update: Update): void => {
    if (this.operation) return;
    const save =
      typeof update === 'function' ? update(this.state.save) : update;
    this.sequence += 1;
    this.dirty = true;
    this.publish({ save });
    void this.flush();
  };

  flush = (): Promise<void> => {
    if (this.pending) return this.pending;
    if (!this.dirty || !this.base || this.state.blocked || this.operation)
      return Promise.resolve();
    this.pending = Promise.resolve()
      .then(() => this.drain())
      .finally(() => {
        this.pending = null;
        // Commits made by subscribers during the final notification are not lost.
        if (this.dirty && !this.state.blocked && !this.operation)
          void this.flush();
      });
    return this.pending;
  };

  private async drain(): Promise<void> {
    while (this.dirty && this.base && !this.state.blocked && !this.operation) {
      const captured = this.state.save;
      const sequence = this.sequence;
      const data = { ...captured, name: captured.name.trim() || '몽글' };
      this.publish({ saving: true });
      let result: CompanionWriteResult;
      try {
        result = await (this.options.persist ?? persistCompanionSave)(data, {
          base: this.base,
          storage: this.options.storage,
        });
      } catch {
        result = {
          ok: false,
          code: 'unavailable',
          error:
            '기록을 저장하지 못했어요. 지금 모험은 화면에 남아 있어요. 파일로 보관해 주세요.',
        };
      }
      if (!result.ok) {
        this.publish({ saving: false, blocked: true, saveError: result.error });
        return;
      }
      const latest = this.state.save;
      this.base = result.snapshot;
      if (sequence === this.sequence) {
        this.dirty = false;
        this.publish({
          save: latest.name.trim()
            ? result.save
            : { ...result.save, name: latest.name },
          saving: false,
          saveError: '',
        });
      } else {
        // Rebase edits typed while the write was in flight onto its merged result.
        // Using the new snapshot without this step would overwrite the other tab.
        const rebased = mergeCompanionChanges(latest, result.save, captured);
        if (!rebased) {
          this.publish({
            saving: false,
            blocked: true,
            saveError:
              '저장하는 동안 다른 창에서도 같은 부분을 바꿨어요. 지금 기록을 파일로 보관한 뒤 다른 창의 기록을 확인해 주세요.',
          });
          return;
        }
        this.publish({ save: rebased, saving: false, saveError: '' });
      }
    }
  }

  handleStorageChange = (): void => {
    if (!this.state.hydrated || this.operation) return;
    // Preserve the base of unsaved edits. The transaction will merge/reject them.
    if (this.dirty || this.pending) {
      void this.flush();
      return;
    }
    this.adoptStored();
  };

  /** Explicitly discard in-memory edits only after an already-started write settles. */
  reloadLatest = async (): Promise<void> => {
    this.operation = true;
    await this.pending;
    this.adoptStored();
    this.operation = false;
  };

  /** Backup import is explicit; books already on this device are merged, not replaced. */
  restoreSave = async (
    incoming: CompanionSave,
    options: { expectedGeneration?: string } = {},
  ): Promise<CompanionSaveResult> => {
    // Bind the whole import, including its pending flush, to the generation in
    // which the user started it. A reset during that await must win.
    const expectedGeneration =
      options.expectedGeneration ?? this.base?.generation;
    const valid = sanitizeCompanionSave(incoming);
    if (!valid) return { ok: false, error: '가져올 기록을 확인하지 못했어요.' };
    await this.flush();
    if (this.state.blocked)
      return {
        ok: false,
        error:
          '먼저 저장 문제를 확인해 주세요. 파일을 가져와도 기존 기록을 덮어쓰지 않아요.',
      };
    const current = readCompanionSave(this.options.storage);
    if (current.status !== 'ready' && current.status !== 'empty') {
      this.publish({ blocked: true, saveError: current.error });
      return { ok: false, error: current.error };
    }
    if (
      expectedGeneration !== undefined &&
      current.snapshot.generation !== expectedGeneration
    ) {
      const error =
        '다른 창에서 기록을 지워 가져오기를 멈췄어요. 지운 기록을 다시 저장하지 않았어요.';
      this.publish({ blocked: true, saveError: error });
      return { ok: false, error };
    }
    this.base = current.snapshot;
    this.commitSave(valid);
    await this.flush();
    return this.state.blocked
      ? { ok: false, error: this.state.saveError }
      : { ok: true };
  };

  reset = async (): Promise<CompanionSaveResult> => {
    this.operation = true;
    await this.pending;
    const result = await resetCompanionSave(this.options.storage);
    if (result.ok) this.adoptStored();
    else this.publish({ saveError: result.error });
    this.operation = false;
    return result;
  };
}
