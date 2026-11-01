import test from 'node:test';
import assert from 'node:assert/strict';
import { isBackgroundBrief } from '@wanwu-v2/contracts/background';
import { exampleArrangement } from '../src/shared/creation/exampleWork.ts';
import { backgroundBrief } from '../src/shared/background/backgroundLayer.ts';
import { backgroundCacheKey } from '../src/shared/background/compositionIdentity.ts';

const example = () => exampleArrangement('work:identity', new Date('2026-10-22'));
const brief = (arrangement = example()) => backgroundBrief(arrangement, [])!;
const key = (arrangement = example()) => backgroundCacheKey(brief(arrangement));

test('unchanged music reuses its identity across visits; visual and descriptive edits do not compose again', () => {
  const a = example(),
    b = structuredClone(a);
  b.id = 'work:another-visit';
  b.updatedAt = new Date().toISOString();
  b.origin = 'child';
  b.rows = 5;
  b.events = b.events.map((event) => ({
    ...event,
    id: event.id + '-new',
    row: (event.row + 1) % 5,
  }));
  b.units = b.units.map((unit) => ({
    ...unit,
    name: '另一个名字',
    maker: '另一个记录人',
    markerIndex: unit.markerIndex + 3,
  }));
  assert.equal(key(a), key(b));
  assert.equal(backgroundCacheKey({ ...brief(a), instruments: ['organ'], attempt: 5 }), key(a));
});

test('a different recording, excerpt, feature, order, timing, mood or length gets its own background', () => {
  const a = example();
  const changes = [
    (b: typeof a) => {
      b.units[0]!.sourceId = 'recording:another-source';
    },
    (b: typeof a) => {
      b.events[0]!.clip.startMs += 500;
      b.events[0]!.clip.endMs += 500;
    },
    (b: typeof a) => {
      b.units[0]!.shape.intensity = 'loud';
    },
    (b: typeof a) => {
      b.events[0]!.at += 0.0001;
    },
    (b: typeof a) => {
      const first = b.events[0]!,
        second = b.events[1]!;
      [first.unitId, second.unitId] = [second.unitId, first.unitId];
    },
    (b: typeof a) => {
      b.mood = { kind: 'preset', id: 'curious' };
    },
    (b: typeof a) => {
      b.spanSeconds = 45;
    },
  ];
  for (const change of changes) {
    const b = structuredClone(a);
    change(b);
    assert.notEqual(key(a), key(b), change.toString());
  }
  const b = structuredClone(a);
  b.units[0]!.sourceId = 'recording:another-source';
  assert.deepEqual(
    brief(a).sounds,
    brief(b).sounds,
    'same measured buckets still distinguish different recordings',
  );
});

test('new cache identity separates old results and rule revisions without sending source ids to the model', () => {
  const request = brief();
  assert.ok(isBackgroundBrief(request));
  assert.equal(isBackgroundBrief({ ...request, identity: 'recording:raw-id' }), false);
  assert.match(request.identity!, /^ai:[a-f0-9]{16}$/);
  for (const unit of example().units) assert.ok(!JSON.stringify(request).includes(unit.sourceId));
  const old = JSON.stringify({
    seconds: request.seconds,
    mood: request.mood,
    sounds: request.sounds,
  });
  assert.notEqual(backgroundCacheKey(request), old);
  assert.notEqual(
    backgroundCacheKey({ ...request, rules: { ...request.rules, shaping: 'new-version' } }),
    backgroundCacheKey(request),
  );
});
