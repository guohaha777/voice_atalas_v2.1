import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveComposeBackground } from '../src/shared/background/composeBackground.ts';
import { exampleArrangement } from '../src/shared/creation/exampleWork.ts';
import { textbookTracks } from '../src/shared/inspiration/textbookTracks.ts';
import { isTextbookSnapshot } from '@wanwu-v2/contracts/textbook-compose';
import { parseSavedWork } from '@wanwu-v2/contracts/work';
import { workContent, parseWorkRecord } from '@wanwu-v2/contracts/cloud';
import { RULE_VERSIONS } from '@wanwu-v2/sound-rules/rules';
import { WorkShelf } from '../src/shared/creation/workShelf.ts';
const arrangement = {
  ...exampleArrangement('work:12345678-1234-1234-1234-123456789abc', new Date('2026-11-01')),
  origin: 'child' as const,
};
const track = textbookTracks[0]!,
  inspiration = { kind: 'textbook' as const, entryId: track.id };
const result = () => resolveComposeBackground(arrangement, inspiration, [track]);
test('a saved textbook layer keeps its exact frame, notes and source features across catalogue changes', () => {
  const made = result();
  assert.ok(isTextbookSnapshot(made.snapshot));
  const restored = resolveComposeBackground(
    arrangement,
    inspiration,
    [{ ...track, tempoBpm: 120 }],
    made.snapshot!,
  );
  assert.deepEqual(restored.plan, made.plan);
  assert.equal(restored.plan.tempo, 96);
  const moved = structuredClone(arrangement);
  moved.events[0]!.at += 0.02;
  assert.notEqual(
    resolveComposeBackground(moved, inspiration, [track], made.snapshot!).snapshot!.identity,
    made.snapshot!.identity,
  );
});
test('textbook snapshots survive local storage and bounded cloud projection without stripping the music', () => {
  const textbook = result().snapshot!;
  const work = {
    version: 'work-v1' as const,
    id: arrangement.id,
    title: '课本成曲',
    arrangement,
    settings: { background: { enabled: true, instruments: [], volume: 0.5 }, inspiration },
    rendering: {
      background: 'local-rules' as const,
      prompt: null,
      rules: { ...RULE_VERSIONS },
      textbook,
    },
    visibility: 'private' as const,
    share: null,
    savedAt: '2026-11-01T10:00:00.000Z',
  };
  assert.ok(parseSavedWork(work));
  const shelf = new WorkShelf();
  assert.ok(shelf.put(work));
  assert.deepEqual(shelf.get(work.id)!.rendering.textbook, textbook);
  // Cloud canonicalizes ids; use a valid cloud arrangement fixture rather than example source ids here.
  const valid = {
    ...arrangement,
    units: arrangement.units.map((u, i) => ({
      ...u,
      id: `unit:12345678-1234-1234-1234-${String(i + 1).padStart(12, '0')}`,
      sourceId: `source:12345678-1234-1234-1234-${String(i + 1).padStart(12, '0')}`,
    })),
  };
  valid.events = arrangement.events.map((e, i) => ({
    ...e,
    id: `event:12345678-1234-1234-1234-${String(i + 1).padStart(12, '0')}`,
    unitId: valid.units[arrangement.units.findIndex((u) => u.id === e.unitId)]!.id,
  }));
  const content = {
    id: work.id,
    title: work.title,
    arrangement: valid,
    settings: work.settings,
    rendering: work.rendering,
  };
  assert.ok(workContent(content));
  assert.ok(
    parseWorkRecord({
      ...content,
      revision: 2,
      state: 'saved',
      savedRevision: 2,
      updatedAt: work.savedAt,
    }),
  );
  assert.deepEqual(workContent(content)!.rendering!.textbook, textbook);
});
test('invalid or mismatched snapshot frames cannot be saved as successful textbook music', () => {
  const made = result().snapshot!;
  assert.equal(
    isTextbookSnapshot({
      ...made,
      music: {
        ...made.music,
        notes: [{ ...made.music.notes[0]!, at: made.music.seconds, length: 1 }],
      },
    }),
    false,
  );
  assert.equal(
    isTextbookSnapshot({ ...made, music: { ...made.music, duck: [{ at: NaN, gain: 1 }] } }),
    false,
  );
  assert.equal(isTextbookSnapshot({ ...made, music: { ...made.music, tempo: 120 } }), false);
  const missing = resolveComposeBackground(
    arrangement,
    { kind: 'textbook', entryId: 'missing' },
    [],
  );
  assert.equal(missing.error, 'missing-track');
  assert.equal(missing.plan.notes.length, 0);
});
test('uploaded music is preserved by its own feature and music snapshot, not a catalogue lookup', () => {
  const uploaded = { ...track, id: 'teaching:test', source: null };
  const inspiration = {
    kind: 'teaching-music' as const,
    musicId: uploaded.id,
    name: '本机歌曲',
    durationMs: 30000,
  };
  const made = resolveComposeBackground(arrangement, inspiration, [uploaded]);
  assert.ok(isTextbookSnapshot(made.snapshot));
  const restored = resolveComposeBackground(arrangement, inspiration, [], made.snapshot!);
  assert.deepEqual(restored.plan, made.plan);
});
