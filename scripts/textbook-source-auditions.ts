// Export original excerpts and the automatically extracted line alone, for honest source-fidelity review.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url)),
  out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const source = resolve(process.argv[3]);
const server = await createServer({
  root,
  configFile: false,
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'source-review',
      configureServer(s) {
        s.middlewares.use('/__source', (_q, r) =>
          r.end('<!doctype html><title>Source review</title>'),
        );
      },
    },
  ],
});
await server.listen();
const a = server.httpServer!.address();
if (!a || typeof a === 'string') throw new Error('no-server');
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${a.port}/__source`);
  for (const [id, name] of [
    ['birds', '小鸟在唱歌'],
    ['horn', '法国号'],
  ] as const) {
    const melody = JSON.parse(await readFile(resolve(source, `${name}.json`), 'utf8'));
    const files = await page.evaluate(
      async ({ root, name, melody }) => {
        const { decodeAudio } = await import(
          /* @vite-ignore */ `/@fs${root}apps/web/src/shared/audio/loadAudio.ts`
        );
        const { pcm16Wave } = await import(
          /* @vite-ignore */ `/@fs${root}packages/audio-engine/src/pcm.ts`
        );
        const { renderBackground } = await import(
          /* @vite-ignore */ `/@fs${root}packages/audio-engine/src/background.ts`
        );
        const bytes = await (
          await fetch(`/@fs${root}apps/web/public/builtin-teaching/${name}.mp3`)
        ).arrayBuffer();
        const buffer = await decodeAudio(bytes, 22050),
          rate = buffer.sampleRate;
        const original = new Float32Array(Math.floor(melody.excerptSeconds * rate));
        for (let i = 0; i < original.length; i++)
          for (let c = 0; c < buffer.numberOfChannels; c++)
            original[i] +=
              (buffer.getChannelData(c)[Math.floor(melody.excerptStart * rate) + i] ?? 0) /
              buffer.numberOfChannels;
        const beat = 60 / melody.tempo,
          lead = melody.leadSeconds ?? 0;
        const notes = melody.phrases
          .flatMap((p: any) =>
            p.notes.map((n: any) => ({
              at: lead + n.atBeat * beat,
              length: Math.min(
                n.beats * beat * 0.9,
                melody.excerptSeconds - lead - n.atBeat * beat,
              ),
              midi: n.midi,
              accent: 0.6,
              part: 'melody',
            })),
          )
          .filter((n: any) => n.length > 0);
        const made = await renderBackground(
          {
            seconds: melody.excerptSeconds,
            fadeInSeconds: 0.02,
            fadeOutSeconds: 0.2,
            duck: [],
            notes,
          },
          { chord: [], bass: [], melody: ['original'], rhythm: [] },
          {},
        );
        const encode = (samples: Float32Array, rate: number) => {
          const bytes = pcm16Wave([samples], rate);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000)
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(binary);
        };
        return {
          original: encode(original, rate),
          extracted: encode(made.getChannelData(0), made.sampleRate),
        };
      },
      { root, name, melody },
    );
    for (const [kind, data] of Object.entries(files))
      await writeFile(resolve(out, `${id}-${kind}.wav`), Buffer.from(data, 'base64'));
    console.log(`${name}: original excerpt and extracted line exported`);
  }
} finally {
  await browser?.close();
  await server.close();
}
