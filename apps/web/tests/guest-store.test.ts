import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SoundSource, SoundUnitDraft } from '@wanwu-v2/contracts/sound';
import {
  DEFAULT_COMPOSE_SETTINGS,
  WORK_CONTRACT_VERSION,
  parseSavedWork,
} from '@wanwu-v2/contracts/work';
import { sessionArchive } from '../src/shared/creation/sourceArchive.ts';
import { workSession } from '../src/shared/creation/workSession.ts';
import { workShelf } from '../src/shared/creation/workShelf.ts';
import {
  GUEST_STORE_VERSION,
  keepGuestWork,
  restoreGuestWork,
} from '../src/shared/storage/guestStore.ts';
import type { KeyValue } from '../src/shared/storage/guestStore.ts';

const memory = (): KeyValue & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => {
      data.set(key, value);
    },
    delete: async (key) => {
      data.delete(key);
    },
    keys: async () => [...data.keys()],
  };
};
const source: SoundSource = {
  id: 'recording:11111111-1111-4111-8111-111111111111',
  kind: 'local-recording',
  label: '我的录音',
  durationMs: 1500,
  mimeType: 'audio/webm',
  provenance: {
    recordedBy: '小林',
    recordedOn: '2026-10-30',
    place: '操场',
    group: null,
    provenanceUrl: null,
  },
};
const unit: SoundUnitDraft = {
  version: 'sound-v1',
  id: 'unit:1',
  sourceId: source.id,
  name: '哗啦',
  maker: null,
  markerIndex: 0,
  shape: { pitch: 'high' },
  input: 'manual',
  createdAt: '2026-10-30T08:00:00.000Z',
};
const buffer = {
  duration: 1.5,
  length: 72000,
  sampleRate: 48000,
  numberOfChannels: 1,
} as unknown as AudioBuffer;
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test('a visitor work, shelf and recording are kept, and come back after a refresh', async () => {
  const store = memory();
  let guest = true;
  const stop = keepGuestWork(store, () => guest, 5);
  const blob = new Blob(['fake audio bytes'], { type: 'audio/webm' });
  sessionArchive.save(source, buffer, { blob });
  workSession.addUnit(unit, source, new Date('2026-10-30T08:01:00Z'));
  const arrangement = workSession.current()!;
  const saved = {
    version: WORK_CONTRACT_VERSION,
    id: arrangement.id,
    title: '我的小曲子 1',
    arrangement: {
      ...arrangement,
      events: [{ id: 'evt:1', unitId: unit.id, at: 0, row: 0, clip: { startMs: 0, endMs: 1500 } }],
    },
    settings: DEFAULT_COMPOSE_SETTINGS,
    rendering: {
      background: 'local-rules',
      prompt: null,
      rules: {
        analysis: 'analysis-v2',
        shaping: 'shaping-v3',
        background: 'background-v1',
        mix: 'mix-v1',
      },
    },
    visibility: 'private',
    share: null,
    savedAt: '2026-10-30T08:02:00.000Z',
  };
  assert.ok(parseSavedWork(saved), 'fixture is a valid saved work');
  workShelf.put(saved as never);
  await settle();
  const kept = store.data.get('work') as {
    version: string;
    arrangement: { units: unknown[] };
    archive: SoundSource[];
    shelf: unknown[];
  };
  assert.equal(kept.version, GUEST_STORE_VERSION);
  assert.equal(kept.arrangement.units.length, 1);
  assert.equal(kept.shelf.length, 1);
  assert.equal(kept.archive[0]!.id, source.id);
  assert.equal(
    (store.data.get('original:' + source.id) as { blob: Blob }).blob,
    blob,
    'the original bytes, not a decoded buffer',
  );
  // Signed in: nothing more is written.
  guest = false;
  workSession.reset();
  await settle();
  assert.equal((store.data.get('work') as { arrangement: unknown }).arrangement !== null, true);
  stop();

  // "Refresh": empty memory, then restore from the store.
  workSession.reset(true);
  for (const work of [...workShelf.list()]) workShelf.remove(work.id);
  const decoded: string[] = [];
  const restored = await restoreGuestWork(store, async (kept, original) => {
    decoded.push(kept.id);
    assert.equal(original?.blob, blob);
    return buffer;
  });
  assert.equal(restored, true);
  assert.deepEqual(decoded, [source.id]);
  assert.equal(workSession.current()?.units[0]?.name, '哗啦');
  assert.equal(workSession.source(source.id)?.label, '我的录音');
  assert.equal(workShelf.list().length, 1);
  assert.equal(sessionArchive.buffer(source.id), buffer);
});

test('an unknown or missing store restores nothing; a sound that cannot be decoded stays missing only itself', async () => {
  assert.equal(await restoreGuestWork(memory(), async () => buffer), false);
  const store = memory();
  store.data.set('work', { version: 'other' });
  assert.equal(await restoreGuestWork(store, async () => buffer), false);
  store.data.set('work', {
    version: GUEST_STORE_VERSION,
    arrangement: null,
    settings: DEFAULT_COMPOSE_SETTINGS,
    sources: [],
    shelf: [],
    archive: [{ ...source, id: 'recording:broken' }, source],
  });
  const restored = await restoreGuestWork(store, async (kept) => {
    if (kept.id === 'recording:broken') throw new Error('cannot decode');
    return buffer;
  });
  assert.equal(restored, true);
  assert.equal(sessionArchive.buffer('recording:broken'), null);
});
