import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundRenderCache } from '../src/pages/compose/model/backgroundRenderCache.ts';

test('switch instruments rerenders the same composition; returning to a selection reuses its own sound', async () => {
  const cache = backgroundRenderCache<object>();
  const piece = {};
  const original = {} as AudioBuffer;
  const bells = {} as AudioBuffer;
  let count = 0;
  const render = (buffer: AudioBuffer) => () => {
    count++;
    return Promise.resolve(buffer);
  };
  assert.equal(await cache.get(piece, 'original', render(original)), original);
  assert.equal(await cache.get(piece, 'bells', render(bells)), bells);
  assert.equal(await cache.get(piece, 'original', render(bells)), original);
  assert.equal(count, 2);
  assert.equal(
    await cache.get({}, 'bells', render(original)),
    original,
    'a new composition cannot reuse old notes',
  );
});

test('a failed instrument render is evicted so the next play can retry', async () => {
  const cache = backgroundRenderCache<object>();
  const piece = {};
  await assert.rejects(cache.get(piece, 'bells', () => Promise.reject(new Error('render failed'))));
  const buffer = {} as AudioBuffer;
  assert.equal(await cache.get(piece, 'bells', () => Promise.resolve(buffer)), buffer);
});
