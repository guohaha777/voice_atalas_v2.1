// 作品留住的背景: a saved piece keeps the composed notes it was heard with (AI 作曲 / 程序自编), and plays them back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isKeptBackground, KEPT_NOTES_MAX } from '@wanwu-v2/contracts/background';
import type { KeptBackground } from '@wanwu-v2/contracts/background';
import { WORK_CONTRACT_VERSION, parseSavedWork } from '@wanwu-v2/contracts/work';
import type { SavedWork } from '@wanwu-v2/contracts/work';
import { composeNotes, programBackground } from '@wanwu-v2/sound-rules/ai-compose';
import { backgroundPlan } from '@wanwu-v2/sound-rules/background';
import { keptBackground, keptPlan } from '@wanwu-v2/sound-rules/kept-background';
import { RULE_VERSIONS } from '@wanwu-v2/sound-rules/rules';
import { backgroundBrief, backgroundInput } from '../src/shared/background/backgroundLayer.ts';
import { exampleArrangement } from '../src/shared/creation/exampleWork.ts';
import { WorkShelf } from '../src/shared/creation/workShelf.ts';

const arrangement = {
  ...exampleArrangement('work:kept', new Date('2026-11-01')),
  origin: 'child' as const,
};
const brief = backgroundBrief(arrangement, [])!;
const made = programBackground(brief);
const kept = keptBackground(composeNotes(brief, made.plan), made.plan.mode, made.notes);
const work = (composed?: KeptBackground): SavedWork => ({
  version: WORK_CONTRACT_VERSION,
  id: arrangement.id,
  title: '留住的歌',
  arrangement,
  settings: {
    background: { enabled: true, instruments: [], volume: 0.5 },
    inspiration: { kind: 'none' },
  },
  rendering: {
    background: 'program',
    prompt: null,
    rules: { ...RULE_VERSIONS },
    ...(composed ? { composed } : {}),
  },
  visibility: 'private',
  share: null,
  savedAt: '2026-11-01T08:00:00.000Z',
});

test('the kept plan is exactly what 万物成曲 plays: the local frame with the composed music', () => {
  const local = backgroundPlan(backgroundInput(arrangement, { kind: 'none' }, []));
  // The way the page built it before the notes were kept with the piece.
  const before = {
    ...local,
    ...composeNotes(brief, made.plan),
    mode: made.plan.mode,
    notes: made.notes,
  };
  assert.deepEqual(keptPlan(local, kept), before);
  assert.notDeepEqual(
    keptPlan(local, kept).notes,
    local.notes,
    'the composed notes, not the rebuilt plain ones',
  );
});

test('a saved piece keeps its composed notes through the shelf; pieces without them still load', () => {
  assert.ok(isKeptBackground(kept));
  assert.ok(parseSavedWork(work(kept)));
  assert.ok(parseSavedWork(work()), 'older pieces have no composed notes');
  const shelf = new WorkShelf();
  assert.ok(shelf.put(work(kept)));
  assert.deepEqual(
    shelf.list().find((item) => item.id === arrangement.id)?.rendering.composed,
    kept,
  );
});

test('kept notes are checked like any background notes', () => {
  const bad = (change: Partial<KeptBackground>) => parseSavedWork(work({ ...kept, ...change }));
  assert.equal(bad({ notes: [{ ...kept.notes[0]!, midi: 60.5 }] }), null, 'a real pitch');
  assert.equal(
    bad({ notes: [{ ...kept.notes[0]!, part: 'voice' as 'melody' }] }),
    null,
    'a known part',
  );
  assert.equal(
    bad({ notes: [{ ...kept.notes[0]!, at: 59.9, length: 1 }] }),
    null,
    'inside the longest piece',
  );
  assert.equal(
    bad({ notes: Array.from({ length: KEPT_NOTES_MAX + 1 }, () => kept.notes[0]!) }),
    null,
    'a bounded size',
  );
  assert.equal(bad({ metre: 5 as 4 }), null);
  assert.equal(bad({ mode: 'lydian' as 'major' }), null);
  assert.equal(bad({ tempo: 0 }), null);
});
