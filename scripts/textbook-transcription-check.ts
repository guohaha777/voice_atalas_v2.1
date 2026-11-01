// End-to-end real-recording transcription check using an isolated browser and local model weights.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.argv[2] ?? 'artifacts/textbook-transcription');
await mkdir(out, { recursive: true });
const server = await createServer({
  root,
  configFile: false,
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'check-page',
      configureServer(s) {
        s.middlewares.use('/__check', (_q, r) => {
          r.setHeader('Content-Type', 'text/html');
          r.end('<!doctype html><title>Local transcription check</title>');
        });
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
  await page.goto(`http://127.0.0.1:${a.port}/__check`);
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('browser:', m.text().slice(0, 250));
  });
  for (const [name, tempo, meter] of [
    ['小鸟在唱歌', 96, 2],
    ['法国号', 136, 3],
  ] as const) {
    const started = Date.now();
    const result = await page.evaluate(
      async ({ root, name, tempo, meter }) => {
        const { decodeAudio } = await import(
          /* @vite-ignore */ `/@fs${root}apps/web/src/shared/audio/loadAudio.ts`
        );
        const { transcribeMelody } = await import(
          /* @vite-ignore */ `/@fs${root}apps/web/src/shared/inspiration/melody/transcribe.ts`
        );
        const response = await fetch(`/@fs${root}apps/web/public/builtin-teaching/${name}.mp3`);
        if (!response.ok) throw new Error('no-recording');
        const bytes = await response.arrayBuffer();
        const buffer = await decodeAudio(bytes.slice(0), 44100);
        return transcribeMelody(buffer, bytes, tempo, meter);
      },
      { root, name, tempo, meter },
    );
    await writeFile(resolve(out, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
    console.log(
      JSON.stringify({
        name,
        ms: Date.now() - started,
        status: result.status,
        confidence: result.confidence,
        phrases: result.phrases.length,
        notes: result.phrases.reduce((n, p) => n + p.notes.length, 0),
      }),
    );
  }
} finally {
  await browser?.close();
  await server.close();
}
