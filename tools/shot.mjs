// node tools/shot.mjs URL OUT.(png|jpg) W H [SCALE]   takes a screenshot of the top of a page, W by H CSS pixels.
// Env: CHROME (default chromium), JS (run in the page first), WAIT (ms after JS, default 1500).
// Used for gallery/title.jpg and the hub poster. Starts its own headless Chromium with the GPU on where there is one.
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [URL_, OUT, W = '1200', H = '750', SCALE = '1'] = process.argv.slice(2);
if (!OUT) { console.log('usage: node tools/shot.mjs URL OUT W H [SCALE]'); process.exit(1); }
const PORT = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PROFILE = mkdtempSync(join(tmpdir(), 'sf-shot-'));
const chrome = spawn(process.env.CHROME || 'chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', '--ignore-gpu-blocklist', '--enable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: +SCALE, mobile: false });
await send('Page.enable'); await send('Page.navigate', { url: URL_ }); await sleep(2500);
if (process.env.JS) await send('Runtime.evaluate', { expression: process.env.JS, awaitPromise: true });
await sleep(+(process.env.WAIT || 1500));
const jpg = /\.jpe?g$/i.test(OUT);
const { data } = await send('Page.captureScreenshot', { format: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 88 } : {}) });
writeFileSync(OUT, Buffer.from(data, 'base64'));
console.log(`wrote ${OUT}`);
ws.close(); chrome.kill(); await sleep(300); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
