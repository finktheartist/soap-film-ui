// node tools/test.mjs [URL]   drives every control in the gallery with real touch and key events at phone width,
// checks form values and sideways scroll, and exits 1 on a failure. Needs Chrome or Chromium (CHROME=... if it is
// somewhere unusual) and the repo being served: python3 -m http.server 8000, then the default URL works.
import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const URL_ = process.argv[2] || 'http://localhost:8000/gallery/';
const PORT = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PROFILE = mkdtempSync(join(tmpdir(), 'sf-'));
const chrome = spawn(process.env.CHROME || 'chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--hide-scrollbars', '--ignore-gpu-blocklist', '--enable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (Array.isArray(targets) && targets.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) logs.push('EVAL ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.enable'); await send('Page.navigate', { url: URL_ }); await sleep(1800);
const E = (tag) => `document.querySelector('${tag}')`;
const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap0 = async (x, y) => { await touch('touchStart', x, y); await sleep(60); await touch('touchEnd', x, y); };
const key = async (k, code) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, ...(k === 'Enter' ? { text: '\r' } : k === ' ' ? { text: ' ' } : {}) }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); };
const focus = (tag) => ev(`${E(tag)}.focus()`);
// count the events each element fires, so a check can ask whether change really reached the page
await ev(`window.__n = {}; for (const t of ['input', 'change', 'confirm', 'refresh', 'refreshed', 'action', 'dismiss', 'toggle']) document.addEventListener(t, (e) => { const k = e.target.localName + ' ' + t; __n[k] = (__n[k] || 0) + 1; })`);
const fired = (k) => ev(`__n[${JSON.stringify(k)}] || 0`);
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got !== undefined ? `  ->  ${got}` : ''}`); };
// a point in an element, given in the engine's own CSS pixels (from its hit-test helpers), in page coordinates
const pt = async (tag, expr) => JSON.parse(await ev(`(() => { const el = ${E(tag)}; el.scrollIntoView({ block: 'center' }); const e = el.engine, b = el.shadowRoot.querySelector('.box').getBoundingClientRect(); const p = (${expr}); return JSON.stringify([b.left + p[0], b.top + p[1]]); })()`));
const hold = async (x, y, ms) => { await touch('touchStart', x, y); await sleep(ms); await touch('touchEnd', x, y); };
const drag = async (x0, y0, x1, y1, steps = 10, gap = 30) => { await touch('touchStart', x0, y0); for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(gap); } await sleep(gap); await touch('touchEnd', x1, y1); };
const val = (tag, prop = 'value') => ev(`${E(tag)}.${prop}`);
for (let i = 0; i < 100 && !(await ev(`[...document.querySelectorAll('.piece .stage > *')].every((e) => e.engine)`)); i++) await sleep(100);
await sleep(600);
check('every control built its WebGL engine', (await ev(`[...document.querySelectorAll('.piece .stage > *')].filter((e) => !(e.engine && e.engine.gl && !e.engine.gl.isContextLost())).length`)) === 0, await ev(`[...document.querySelectorAll('.piece .stage > *')].filter((e) => !(e.engine && e.engine.gl && !e.engine.gl.isContextLost())).map((e) => e.localName + (e.engine ? ' lost' : ' none')).join(' ')`));

{ // slider: a sideways drag moves it, a vertical swipe does not, and the arrow keys do
  const [x0, y] = await pt('soap-slider', 'e.beadStagePos(0.4) && [e.beadStagePos(0.4).x, e.beadStagePos(0.4).y]'), [x1] = await pt('soap-slider', '[e.beadStagePos(0.95).x, 0]');
  await sleep(200); await drag(x0, y, x1, y); await sleep(300); const v1 = await val('soap-slider');
  check('slider: sideways drag raises it, with input and one change', v1 > 85 && (await fired('soap-slider input')) > 0 && (await fired('soap-slider change')) === 1, v1);
  await drag(x0, y, x0 + 3, y - 70, 6); await sleep(300);
  check('slider: a vertical swipe leaves it alone', (await val('soap-slider')) === v1, await val('soap-slider'));
  await focus('soap-slider'); await key('Home', 36); await sleep(500);
  check('slider: Home takes it to the start', (await val('soap-slider')) === 0, await val('soap-slider'));
}
{ // hold to send: a short hold does nothing, a long one confirms, and Space holds it too
  const [x, y] = await pt('soap-hold-button', '[e.pillCenterStagePos().x, e.pillCenterStagePos().y]');
  await sleep(200); await hold(x, y, 500); await sleep(400);
  check('hold: a short hold does not confirm', (await fired('soap-hold-button confirm')) === 0 && (await val('soap-hold-button', 'sent')) === false);
  await hold(x, y, 2600); await sleep(400);
  check('hold: holding to the end confirms', (await fired('soap-hold-button confirm')) === 1 && (await val('soap-hold-button', 'sent')) === true);
  await ev(`${E('soap-hold-button')}.reset()`); await focus('soap-hold-button');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' }); await sleep(2600);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await sleep(300);
  check('hold: Space held down confirms', (await fired('soap-hold-button confirm')) === 2);
}
{ // pull to refresh: a short pull cancels, a long one refreshes and waits for the page
  const [x, y] = await pt('soap-pull-refresh', '[e.feedGrabStagePos().x, e.feedGrabStagePos().y]');
  await sleep(200); await drag(x, y, x, y + 25, 6); await sleep(900);
  check('pull: a short pull does not refresh', (await fired('soap-pull-refresh refresh')) === 0);
  await drag(x, y, x, y + 200, 12); await sleep(300);
  check('pull: a long pull fires refresh', (await fired('soap-pull-refresh refresh')) === 1 && (await val('soap-pull-refresh', 'refreshing')) === true);
  await sleep(3200);
  check('pull: it pops and the new row is on top', (await fired('soap-pull-refresh refreshed')) === 1 && (await ev(`${E('soap-pull-refresh')}.items[0].name`)) === 'Noa Park', await ev(`${E('soap-pull-refresh')}.items[0].name`));
  await focus('soap-pull-refresh'); await key('Enter', 13); await sleep(300);
  check('pull: Enter on its button refreshes', (await fired('soap-pull-refresh refresh')) === 2);
}
{ // menu: a tap on the last bubble, then the arrow keys
  const [x, y] = await pt('soap-menu', '[e.bubbleCenterStagePos(4).x, e.bubbleCenterStagePos(4).y]');
  await sleep(200); await tap0(x, y); await sleep(400);
  check('menu: tap picks Profile', (await val('soap-menu')) === 'profile' && (await fired('soap-menu change')) === 1, await val('soap-menu'));
  await key('ArrowLeft', 37); await sleep(300);
  check('menu: ArrowLeft moves to Saved', (await val('soap-menu')) === 'saved', await val('soap-menu'));
}
{ // fab: tap the hub to open, then tap a bud for its action, and Escape closes
  const [x, y] = await pt('soap-fab', '[e.hubStagePos().x, e.hubStagePos().y]');
  await sleep(200); await tap0(x, y); await sleep(1400);
  check('fab: tap opens it', (await val('soap-fab', 'open')) === true && (await fired('soap-fab toggle')) === 1);
  const [bx, by] = await pt('soap-fab', '[e.budStagePos(1).x, e.budStagePos(1).y]');
  await tap0(bx, by); await sleep(400);
  check('fab: tap a bud fires action', (await fired('soap-fab action')) === 1);
  await key('Escape', 27); await sleep(300);
  check('fab: Escape closes it', (await val('soap-fab', 'open')) === false);
}
{ // notifications: a tap pops one, push adds one
  await sleep(300);
  const [x, y] = await pt('soap-notifications', '[e.pillPosByIndex(0).x, e.pillPosByIndex(0).y]');
  await tap0(x, y); await sleep(1200);
  check('notifications: a tap dismisses one', (await fired('soap-notifications dismiss')) === 1 && (await val('soap-notifications', 'count')) === 2, await val('soap-notifications', 'count'));
  await ev(`${E('soap-notifications')}.push({ icon: 'chat', title: 'Test', body: 'Pushed', time: 'now' })`); await sleep(400);
  check('notifications: push adds one', (await val('soap-notifications', 'count')) === 3);
}
{ // tags: drag one into another to group them
  const [x0, y0] = await pt('soap-tags', '[e.tagPos("audio").x, e.tagPos("audio").y]'), [x1, y1] = await pt('soap-tags', '[e.tagPos("design").x, e.tagPos("design").y]');
  await sleep(200); await drag(x0, y0, x1, y1, 16, 35); await sleep(800);
  const g = await ev(`JSON.stringify(${E('soap-tags')}.groups)`);
  check('tags: dragging Audio into Design groups them', (await fired('soap-tags change')) >= 1 && JSON.parse(g).some((x) => x.includes('audio') && x.includes('design')), g);
}
{ // dial: the arrow keys and a drag round the rim
  await focus('soap-dial'); const v0 = await val('soap-dial');
  await key('ArrowRight', 39); await key('ArrowRight', 39); await sleep(500);
  check('dial: two ArrowRights turn it up by two', (await val('soap-dial')) === v0 + 2, `${v0} -> ${await val('soap-dial')}`);
  const [bx, by] = await pt('soap-dial', '[e.beadStagePos().x, e.beadStagePos().y]'), [cx, cy] = await pt('soap-dial', '[e.cx, e.cy]');
  const v1 = await val('soap-dial'), r = Math.hypot(bx - cx, by - cy), a0 = Math.atan2(by - cy, bx - cx);
  await touch('touchStart', bx, by); for (let i = 1; i <= 12; i++) { const a = a0 + i * 0.12; await touch('touchMove', cx + Math.cos(a) * r, cy + Math.sin(a) * r); await sleep(30); } await touch('touchEnd', cx, cy); await sleep(600);
  check('dial: dragging clockwise round the rim turns it up, with change', (await val('soap-dial')) > v1 && (await fired('soap-dial change')) >= 1, `${v1} -> ${await val('soap-dial')}`);
}
{ // forms: the value controls are sent with a form
  const got = await ev(`(() => {
    const f = document.createElement('form');
    f.innerHTML = '<soap-slider name="s" value="20"></soap-slider><soap-dial name="d" value="70"></soap-dial><soap-menu name="m"><option value="home">Home</option><option value="search" selected>Search</option><option value="inbox">Inbox</option><option value="saved">Saved</option><option value="profile">Profile</option></soap-menu><soap-tags name="t"></soap-tags>';
    document.body.append(f); const out = JSON.stringify(Object.fromEntries(new FormData(f))); f.remove(); return out; })()`);
  check('forms: every value control is in the FormData', got === JSON.stringify({ s: '20', d: '70', m: 'search', t: 'design,urgent,audio,saved' }), got);
}
const wide = await ev('document.documentElement.scrollWidth'); check('no sideways scroll at 390', wide <= 390, wide);
check('every WebGL context still alive', (await ev(`[...document.querySelectorAll('.piece .stage > *')].every((e) => e.engine && !e.engine.gl.isContextLost())`)) === true);
check('no script errors', !logs.length, logs.join(' | '));
ws.close(); chrome.kill(); await sleep(300); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(fails ? 1 : 0);
