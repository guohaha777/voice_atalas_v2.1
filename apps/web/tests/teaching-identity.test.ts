import test from 'node:test';
import assert from 'node:assert/strict';
import { TeachingMusicStore } from '../src/shared/inspiration/teachingMusic.ts';
test('uploaded recordings with identical names and sizes remain distinct when their audio bytes differ', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  class AudioStub {
    duration = 12;
    preload = '';
    onloadedmetadata: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onloadedmetadata?.());
    }
  }
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: AudioStub });
  try {
    const store = new TeachingMusicStore();
    const file = (data: string) =>
      Object.assign(new Blob([data], { type: 'audio/wav' }), { name: '同名歌曲.wav' });
    const a = await store.pick(file('AAAA')),
      same = await store.pick(file('AAAA')),
      different = await store.pick(file('BBBB'));
    assert.equal(a.status, 'picked');
    assert.equal(same.status, 'picked');
    assert.equal(different.status, 'picked');
    if (!('music' in a) || !('music' in same) || !('music' in different))
      throw new Error('not-picked');
    assert.equal(a.music.id, same.music.id);
    assert.notEqual(a.music.id, different.music.id);
    assert.notEqual(a.music.audioToken, different.music.audioToken);
    store.remove(different.music.id);
  } finally {
    if (original) Object.defineProperty(globalThis, 'Audio', original);
    else delete (globalThis as Record<string, unknown>).Audio;
  }
});
