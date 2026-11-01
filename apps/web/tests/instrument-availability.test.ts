import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundPlan } from '@wanwu-v2/sound-rules/background';
import { LOCAL_INSTRUMENTS } from '@wanwu-v2/audio-engine/instruments';
import { instrumentUnavailable } from '../src/pages/compose/model/instrumentAvailability.ts';

const plan = () =>
  backgroundPlan({ seconds: 20, mood: null, seed: 'availability', sounding: [], textbook: null });

test('fixed audio and missing notes give specific unavailable reasons', () => {
  const instrument = LOCAL_INSTRUMENTS[0]!;
  assert.equal(instrumentUnavailable(plan(), true, [], instrument, []), 'audio');
  assert.equal(instrumentUnavailable(null, false, [], instrument, []), 'empty');
  assert.equal(instrumentUnavailable({ ...plan(), notes: [] }, false, [], instrument, []), 'empty');
});

test('availability uses the arranged parts: supplemented drums and shared harmonies remain selectable', () => {
  const piece = plan();
  piece.notes = piece.notes.filter((note) => note.part !== 'rhythm' && note.part !== 'melody');
  for (const item of LOCAL_INSTRUMENTS)
    assert.equal(instrumentUnavailable(piece, false, LOCAL_INSTRUMENTS, item, []), null, item.name);
  const incompatible = { id: 'incompatible', lead: [], can: [] };
  assert.equal(instrumentUnavailable(piece, false, LOCAL_INSTRUMENTS, incompatible, []), 'no-part');
});
