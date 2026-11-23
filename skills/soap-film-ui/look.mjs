// look.mjs: stop the clock, step an interaction to chosen moments and save the frames side by side.
//   node look.mjs URL SELECTOR OUT.png "t:js; t:js; ..." "t1,t2,t3,..."
// Each "t:js" runs js at t seconds, with `el` as the element and `e` as its engine; each time in the list is a frame.
// Example, the hold button half way and at the pop:
//   node look.mjs http://localhost:8000/hold-button/ soap-hold-button out.png "0:e.setHolding(true)" "0,0.6,1.2,1.8,2.0,2.4"
// Needs Chromium (CHROME=... if it is somewhere unusual) and playwright-core (npm i playwright-core), and ImageMagick
// for the sheet. On a machine with a GPU, the --enable-gpu flags keep WebGL from dropping its context on long runs.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(process.env.PW || import.meta.url);
const { chromium } = require('playwright-core');
const [url, sel, out, script = '', when = '0,0.5,1,1.5,2'] = process.argv.slice(2);
if (!out) { console.log('usage: node look.mjs URL SELECTOR OUT.png "t:js; ..." "t1,t2,..."'); process.exit(1); }
const acts = script.split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf(':'); return { t: +s.slice(0, i), js: s.slice(i + 1) }; });
const times = when.split(',').map(Number);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await b.newPage({ viewport: { width: +(process.env.W || 760), height: 900 }, deviceScaleFactor: 2 });
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction((s) => document.querySelector(s)?.engine, sel);
await page.evaluate(() => { SoapFilm.clock.manual = true; });
const dir = mkdtempSync(join(tmpdir(), 'look-')), files = [];
const step = (dt) => page.evaluate((n) => { for (let i = 0; i < n; i++) SoapFilm.clock.advance(1 / 60); }, Math.round(dt * 60));
let now = 0;
const done = new Set();
for (const t of times) {
  for (const a of acts) {
    if (done.has(a) || a.t > t) continue;
    await step(a.t - now); now = a.t;
    await page.evaluate(([s, js]) => { const el = document.querySelector(s), e = el.engine; (0, eval)('(el, e) => { ' + js + ' }')(el, e); }, [sel, a.js]);
    done.add(a);
  }
  await step(t - now); now = t;
  const f = join(dir, `f${files.length}.png`);
  await page.locator(sel).screenshot({ path: f });
  files.push(f);
}
execFileSync('magick', ['montage', ...files.flatMap((f, i) => ['-label', `${times[i]}s`, f]), '-tile', `${Math.min(files.length, 4)}x`, '-geometry', '+6+6', '-background', '#ffffff', out]);
rmSync(dir, { recursive: true, force: true });
console.log(`${out}: ${files.length} frames${errs.length ? '; errors: ' + errs.join(' | ') : ''}`);
await b.close();
