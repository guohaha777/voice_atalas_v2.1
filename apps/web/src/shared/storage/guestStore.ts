// A visitor's work kept on this device (IndexedDB), so a refresh or a new visit finds it again: the current work and its
// 万物成曲 settings (workSession), the 作品书架 (workShelf), and the visitor's sounds (sessionArchive — the original
// recording / file bytes, never the decoded buffers; an excerpt of a library example is fetched and cut again).
// Only while no account is signed in: signed-in work belongs to the cloud workspace, and an account's sounds are never
// written here. Nothing leaves the device. Storage that fails (private mode, full disk) is skipped: the page works as
// before, only without remembering.
import type { SoundSource } from '@wanwu-v2/contracts/sound';
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import type { ComposeSettings, SavedWork } from '@wanwu-v2/contracts/work';
import { sessionArchive } from '../creation/sourceArchive.ts';
import type { LocalOriginal } from '../creation/sourceArchive.ts';
import { workSession } from '../creation/workSession.ts';
import { workShelf } from '../creation/workShelf.ts';

export const GUEST_STORE_VERSION = 'guest-v1';
export type KeyValue = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
};
/** Turns a kept sound back into playable audio; null when it cannot (the sound then reports missing, as before). */
export type Decode = (
  source: SoundSource,
  original: LocalOriginal | null,
) => Promise<AudioBuffer | null>;
type KeptWork = {
  version: typeof GUEST_STORE_VERSION;
  arrangement: Arrangement | null;
  settings: ComposeSettings;
  sources: SoundSource[];
  shelf: SavedWork[];
  archive: SoundSource[];
};

const ORIGINAL = 'original:';

/** Puts the kept work back into the session, shelf and archive. Call once, before the pages read them. */
export async function restoreGuestWork(store: KeyValue, decode: Decode) {
  const kept = (await store.get('work')) as KeptWork | undefined;
  if (!kept || kept.version !== GUEST_STORE_VERSION) return false;
  for (const source of kept.archive ?? []) {
    try {
      const original =
        ((await store.get(ORIGINAL + source.id)) as LocalOriginal | undefined) ?? null;
      const buffer = await decode(source, original);
      if (buffer) sessionArchive.save(source, buffer, original ?? undefined);
    } catch {
      /* this sound stays missing; the rest still comes back */
    }
  }
  for (const work of [...(kept.shelf ?? [])].reverse()) workShelf.put(work);
  if (kept.arrangement)
    workSession.restoreDraft(kept.arrangement, kept.settings, kept.sources ?? []);
  return true;
}

/** Writes the work back whenever it changes (shortly after, in order). Returns a function that stops it. */
export function keepGuestWork(store: KeyValue, isGuest: () => boolean, delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | undefined,
    chain = Promise.resolve();
  const write = async () => {
    if (!isGuest()) return;
    const current = workSession.current();
    const own = current?.origin === 'child' ? current : null;
    const sources = own
      ? [...new Set(own.units.map((unit) => unit.sourceId))].flatMap((id) => {
          const source = workSession.source(id);
          return source ? [source] : [];
        })
      : [];
    const entries = sessionArchive.guestEntries();
    const kept: KeptWork = {
      version: GUEST_STORE_VERSION,
      arrangement: own,
      settings: workSession.settings(),
      sources,
      shelf: [...workShelf.list()],
      archive: entries.map((entry) => entry.source),
    };
    // Original bytes never change for a source id, so each is written once; ones no longer in the archive are removed.
    const stored = new Set((await store.keys()).filter((key) => key.startsWith(ORIGINAL)));
    for (const entry of entries) {
      const key = ORIGINAL + entry.source.id;
      if (entry.original && !stored.has(key)) await store.set(key, entry.original);
      stored.delete(key);
    }
    for (const key of stored) await store.delete(key);
    await store.set('work', kept);
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      chain = chain.then(write).catch(() => {});
    }, delayMs);
  };
  const off = [
    workSession.subscribe(schedule),
    workShelf.subscribe(schedule),
    sessionArchive.subscribe(schedule),
  ];
  return () => {
    clearTimeout(timer);
    for (const stop of off) stop();
  };
}

/** The browser's IndexedDB as a key-value store; null where it is not available. */
export function indexedDbStore(name = 'wanwu-guest', table = 'data'): KeyValue | null {
  if (typeof indexedDB === 'undefined') return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(table);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  /** One request in its own transaction. */
  const run = <T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) =>
    db().then(
      (database) =>
        new Promise<T>((resolve, reject) => {
          const request = act(database.transaction(table, mode).objectStore(table));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }),
    );
  return {
    get: (key) => run('readonly', (store) => store.get(key)),
    set: async (key, value) => {
      await run('readwrite', (store) => store.put(value, key));
    },
    delete: async (key) => {
      await run('readwrite', (store) => store.delete(key));
    },
    keys: async () => (await run('readonly', (store) => store.getAllKeys())).map(String),
  };
}
