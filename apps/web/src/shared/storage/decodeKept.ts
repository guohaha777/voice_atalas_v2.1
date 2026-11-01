// How a kept sound becomes audio again (guestStore.ts): a recording or file is decoded from its original bytes and cut
// to the chosen part; an excerpt of a library example (`example:bird#1200-4800`) is fetched again and cut to its range.
import type { SoundSource } from '@wanwu-v2/contracts/sound';
import { decodeAudio, loadAudio } from '../audio/loadAudio.ts';
import { sliceBuffer } from '../audio/sliceBuffer.ts';
import { EXAMPLE_TIMEOUT_MS, exampleSourceUrl } from '../creation/exampleSounds.ts';
import type { LocalOriginal } from '../creation/sourceArchive.ts';

export async function decodeKept(
  source: SoundSource,
  original: LocalOriginal | null,
): Promise<AudioBuffer | null> {
  if (original) {
    const buffer = await decodeAudio(await original.blob.arrayBuffer());
    return original.selection
      ? sliceBuffer(buffer, original.selection.startMs, original.selection.endMs)
      : buffer;
  }
  const excerpt = /^(example:[^#]+)#(\d+)-(\d+)$/.exec(source.id),
    url = excerpt ? exampleSourceUrl(excerpt[1]!) : null;
  if (!excerpt || !url) return null;
  return sliceBuffer(
    await loadAudio(url, { timeoutMs: EXAMPLE_TIMEOUT_MS }),
    Number(excerpt[2]),
    Number(excerpt[3]),
  );
}
