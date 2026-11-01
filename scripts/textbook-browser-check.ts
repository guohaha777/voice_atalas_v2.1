// Isolated browser profile on the development origin. Only synthetic/example work is seeded.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const origin = process.argv[2] ?? 'http://127.0.0.1:5295';
const out = resolve(process.argv[3] ?? 'artifacts/textbook-browser');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // No account/API/model side effects in the UI check. Local music inference remains fully real.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', reason: 'not-open', requestId: 'textbook-test' }),
    }),
  );
  await page.goto(origin);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const { exampleArrangement } = await import('/src/shared/creation/exampleWork.ts');
    const { indexedDbStore } = await import('/src/shared/storage/guestStore.ts');
    const a = {
      ...exampleArrangement('work:textbook-ui', new Date('2026-11-01')),
      origin: 'child' as const,
    };
    await indexedDbStore()!.set('work', {
      version: 'guest-v1',
      arrangement: a,
      settings: {
        background: { enabled: true, instruments: [], volume: 0.5 },
        inspiration: { kind: 'textbook', entryId: 'tb:ry1:u2:birds-singing' },
      },
      sources: [],
      shelf: [],
      archive: [],
    });
    localStorage.setItem('wanwu-textbook-switch', 'on');
  });
  console.log('fixture seeded');
  await page.goto(origin + '/compose');
  await page
    .getByText('已自动提取旋律，和你的声音一起创作。', { exact: false })
    .waitFor({ timeout: 90000 });
  console.log('real built-in transcription ready in compose');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '保存这首作品', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  console.log((await page.getByRole('dialog').innerText()).slice(-200));
  const save = page
    .getByRole('dialog')
    .getByRole('button', { name: /放进.*书架|保存|更新/ })
    .last();
  await save.click();
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
  // Persist before a real reload; the shelf and draft are written by the app's normal guest persistence.
  const readStored = () =>
    page.evaluate(async () => {
      const request = indexedDB.open('wanwu-guest', 1);
      const db = await new Promise<IDBDatabase>((r, j) => {
        request.onsuccess = () => r(request.result);
        request.onerror = () => j(request.error);
      });
      const data = await new Promise<any>((r, j) => {
        const q = db.transaction('data').objectStore('data').get('work');
        q.onsuccess = () => r(q.result);
        q.onerror = () => j(q.error);
      });
      db.close();
      return JSON.stringify(data);
    });
  let data: any;
  for (let attempt = 0; attempt < 30; attempt++) {
    data = JSON.parse(await readStored());
    if (data?.shelf?.[0]?.rendering?.textbook?.references?.length) break;
    await page.waitForTimeout(100);
  }
  console.log('persisted shelf entries:', data?.shelf?.length);
  if (!data?.shelf?.[0]) throw new Error('not-persisted:' + JSON.stringify(data).slice(0, 300));
  const saved = data.shelf[0];
  if (!saved.rendering.textbook.references.length) throw new Error('source-references-not-saved');
  await writeFile(resolve(out, 'saved-work.json'), JSON.stringify(saved, null, 2) + '\n');
  await page.reload();
  await page
    .getByText('已自动提取旋律，和你的声音一起创作。', { exact: false })
    .waitFor({ timeout: 30000 });
  const reopened = JSON.parse(await readStored()).shelf[0].rendering.textbook.music;
  if (JSON.stringify(reopened) !== JSON.stringify(saved.rendering.textbook!.music))
    throw new Error('reopened-music-changed');
  for (const width of [375, 700, 701, 900, 901, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    if (overflow) {
      console.log(
        await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .map((e) => ({
              tag: e.tagName,
              cls: e.className,
              right: e.getBoundingClientRect().right,
              width: e.getBoundingClientRect().width,
              text: e.textContent?.slice(0, 25),
            }))
            .filter((e) => e.right > innerWidth + 1)
            .slice(-18),
        ),
      );
      throw new Error(`overflow:${width}`);
    }
    await page.screenshot({ path: resolve(out, `compose-${width}.png`), fullPage: true });
  }
  await page.goto(origin + '/works');
  await page
    .getByRole('button', { name: /听一听|播放/ })
    .first()
    .click();
  await page.getByRole('button', { name: '停一停', exact: true }).waitFor({ timeout: 20000 });
  console.log('shelf playback started');
  // Upload a real existing teaching recording through the actual UI, then save its extracted music.
  await page.goto(origin + '/compose');
  await page.getByRole('button', { name: /换课本歌曲/ }).click();
  await page.getByRole('tab', { name: '上传歌曲', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles(resolve('apps/web/public/builtin-teaching/法国号.mp3'));
  await page
    .getByRole('button', { name: '加入教学音乐', exact: true })
    .waitFor({ timeout: 120000 });
  await page.getByRole('button', { name: '加入教学音乐', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '用这个', exact: true })
    .last()
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .getByText('已自动提取旋律，和你的声音一起创作。', { exact: false })
    .waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: '保存这首作品', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /放进.*书架|保存|更新/ })
    .last()
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  let uploaded: any;
  for (let attempt = 0; attempt < 30; attempt++) {
    const stored = JSON.parse(await readStored());
    uploaded = stored?.shelf?.[0];
    if (uploaded?.settings?.inspiration?.kind === 'teaching-music') break;
    await page.waitForTimeout(100);
  }
  if (
    uploaded?.settings?.inspiration?.kind !== 'teaching-music' ||
    !uploaded.rendering.textbook.references.length
  )
    throw new Error('uploaded-melody-not-kept');
  await writeFile(
    resolve(out, 'saved-uploaded-work.json'),
    JSON.stringify(uploaded, null, 2) + '\n',
  );
  console.log('real upload, melody extraction, selection and save passed');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    resolve(out, 'report.json'),
    JSON.stringify(
      {
        status: 'pass',
        browser: browser.version(),
        savedNotes: saved.rendering.textbook!.music.notes.length,
        sourceReferences: saved.rendering.textbook!.references.length,
        checks: [
          'built-in-transcription',
          'compose-playback',
          'normal-save',
          'reload-identical-music',
          'shelf-play',
          'real-file-upload-transcribe-select-save',
          '375/700/701/900/901/1440-no-horizontal-overflow',
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log('PASS: compose, save, reload, shelf and responsive widths');
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true });
    await writeFile(resolve(out, 'failure.txt'), await page.locator('body').innerText());
  }
  throw error;
} finally {
  await browser.close();
}
