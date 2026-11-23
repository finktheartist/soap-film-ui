// Write every folder's README.md and index.html, registry.json and llms.txt from tools/spec.mjs.
//   node tools/docs.mjs          (run it after editing tools/spec.mjs, and after tools/build.mjs)
//   node tools/docs.mjs --check  (exits 1 if anything is out of date, and changes nothing)
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC, REPO, SITE, AUTHOR, COMMON_LIMITS } from './spec.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), check = process.argv.includes('--check');
let stale = 0;
const put = (rel, next) => {
  let was = ''; try { was = readFileSync(join(root, rel), 'utf8'); } catch {}
  if (next !== was) { stale++; if (!check) writeFileSync(join(root, rel), next); console.log(`${check ? 'stale' : 'wrote'} ${rel}`); }
};
const kb = (id) => Math.round(statSync(join(root, id, id + '.js')).size / 1024);
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
const COUNT = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][SPEC.length];

// what each demo page shows under the control, and any buttons it needs
const SHOW = {
  value: { row: '', js: "const show = () => say(`Value: ${el.value}`); el.addEventListener('input', show); el.addEventListener('change', show); show();" },
  confirm: { row: '<button class="pill" type="button" id="reset">Reset</button>', js: "el.addEventListener('confirm', () => say('Confirmed.')); document.getElementById('reset').addEventListener('click', () => { el.reset(); say(''); });" },
  refresh: { row: '', js: `// a pretend load that takes a second and brings one new row
const fresh = [{ initials: 'NP', name: 'Noa Park', preview: 'Approved the release checklist', time: 'now' }, { initials: 'DS', name: 'Design system', preview: 'Synced glass tokens to main', time: 'now' }, { initials: 'KS', name: 'Kai Soto', preview: 'Added a 60 fps capture preset', time: 'now' }];
let n = 0;
el.addEventListener('refresh', (e) => { say('Loading…'); e.detail.waitUntil(new Promise((r) => setTimeout(() => r(fresh[n++ % fresh.length]), 1000))); });
el.addEventListener('refreshed', (e) => say(e.detail.row ? 'New: ' + e.detail.row.name : 'Nothing new.'));` },
  action: { row: '', js: "el.addEventListener('action', (e) => say(`Action: ${e.detail.label}`)); el.addEventListener('toggle', (e) => say(e.detail.open ? 'Open.' : 'Closed.'));" },
  notes: { row: '<button class="pill" type="button" id="add">Add one</button><button class="pill" type="button" id="refill">Start over</button>', js: `const samples = [{ icon: 'bell', title: 'Focus mode', body: '3 updates held until 6:00', time: 'now' }, { icon: 'download', title: 'Download', body: 'soap-renders.zip received', time: 'now' }, { icon: 'calendar', title: 'Design review', body: 'Starts in 5 min · Studio B', time: 'now' }, { icon: 'check', title: 'Build passed', body: 'v2.4 deployed to staging', time: '3m' }, { icon: 'chat', title: 'Jo Reyes', body: 'Sent the final prototype', time: '1m' }];
let k = 0;
const add = document.getElementById('add');
document.getElementById('add').addEventListener('click', () => { if (!el.push(samples[k++ % samples.length])) say('Full: four at most.'); });
document.getElementById('refill').addEventListener('click', () => { el.items = samples.slice(2, 5); say(''); });
el.addEventListener('dismiss', (e) => say('Dismissed: ' + e.detail.title));
el.addEventListener('count', () => { add.disabled = el.full; });` },
  groups: { row: '<button class="pill" type="button" id="reset">Reset</button>', js: "const show = () => say(el.groups.map((g) => g.join(' + ')).join('  ·  ')); el.addEventListener('change', show); setTimeout(show, 0); document.getElementById('reset').addEventListener('click', () => { el.reset(); show(); });" },
};

const PAGE_CSS = `  :root { --ink: #16161A; --mute: #888894; --line: rgba(22, 22, 26, .12); --sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif; }
  html { background: #FFFFFF; overflow-x: clip; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: var(--ink); font: 400 15px/1.45 var(--sans); overflow-x: clip; }
  main { width: min(640px, 100vw - 32px); padding: 36px 0 56px; text-align: center; }
  h1 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -0.02em; }
  .sub { margin: 6px 0 0; color: var(--mute); }
  .stage { display: grid; justify-items: center; margin: 18px 0 6px; }
  .stage > * { width: 100%; }
  .hint { margin: 0 4px; color: var(--mute); font-size: 13px; }
  .said { margin: 10px 4px 0; min-height: 1.45em; font-variant-numeric: tabular-nums; }
  .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; margin: 12px 4px 0; }
  .pill { appearance: none; border: 1px solid var(--line); background: #FFFFFF; color: #555562; font: 600 12px/1 var(--sans); padding: 8px 14px; border-radius: 999px; cursor: pointer; }
  .pill:hover { color: var(--ink); } .pill[aria-pressed=false] { color: var(--mute); } .pill:disabled { opacity: .45; cursor: default; }
  a { color: inherit; } :focus-visible { outline: 2px solid rgba(22, 22, 26, .35); outline-offset: 3px; }
  code { font: 12.5px/1 ui-monospace, "SF Mono", Menlo, monospace; padding: 2px 6px; border-radius: 6px; background: #F4F4F6; }`;

for (const c of SPEC) {
  put(`${c.id}/README.md`, `# ${c.name}

${c.intro.join('\n\n')}

One of ${COUNT} controls in this repo. Same idea in each (an ordinary control made of soap film, with real thin-film colour and a fluid simulation running on it), different control.

## Run it

\`\`\`sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/${c.id}/
\`\`\`

\`?embed=1\` hides the heading and the hint.

## Use it

\`${c.id}.js\` is the whole component: one file of about ${kb(c.id)} KB with its shaders and simulation inside it, and no dependencies.

\`\`\`html
${c.use}
\`\`\`

\`\`\`js
${c.js}
\`\`\`

${c.attrs.length ? table(['attribute', 'what it sets', 'default'], c.attrs) + '\n\n' : ''}${c.notes.map((n) => `- ${n}`).join('\n')}
- **Sound.** It makes soft synthesized foley (no audio files) once the page has had a tap or a key. \`muted\` silences this one; \`SoapFilm.sound = false\` silences the page.

## What happens

${table(['you', 'it'], c.happens)}

## Limits

${[...c.limits, ...COMMON_LIMITS].map((l) => `- ${l}`).join('\n')}
`);

  const d = c.demo, s = SHOW[d.show];
  put(`${c.id}/index.html`, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%2390f0ff%22/%3E%3Cstop offset=%22.5%22 stop-color=%22%23ffb0f0%22/%3E%3Cstop offset=%221%22 stop-color=%22%23fff08a%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2213%22 fill=%22%23fff%22 stroke=%22url(%23g)%22 stroke-width=%223%22/%3E%3C/svg%3E">
<title>Soap Film ${c.name}</title>
<style>
${PAGE_CSS}
  .embed body { place-items: start center; min-height: 0; } .embed h1, .embed .sub, .embed .hint, .embed .back, .embed .row, .embed .said { display: none; } .embed main { padding: 0; } .embed .stage { margin: 0; }
</style>
</head>
<body>
<main>
  <h1>${c.name}</h1>
  <p class="sub">${c.sub} <code>&lt;${c.tag}&gt;</code></p>
  <div class="stage">
    ${d.html}
  </div>
  <p class="hint">${d.hint}</p>
  <p class="said" aria-live="polite"></p>
  <div class="row">${s.row}<button class="pill" type="button" id="sound" aria-pressed="true">Sound on</button></div>
  <p class="hint back"><a href="../gallery/">All ${COUNT}</a> · <a href="https://github.com/${REPO}/blob/main/${c.id}/README.md">Docs</a></p>
</main>
<script src="${c.id}.js"></script>
<script>
// This page's own wiring. The component is all in ${c.id}.js.
// ?embed=1 hides the heading, the hint and the buttons.
const Q = new URLSearchParams(location.search), el = document.getElementById('el'), said = document.querySelector('.said');
if (Q.get('embed') === '1') document.documentElement.classList.add('embed');
const say = (t) => { said.textContent = t; };
const sound = document.getElementById('sound');
sound.addEventListener('click', () => { SoapFilm.sound = !SoapFilm.sound; sound.setAttribute('aria-pressed', SoapFilm.sound); sound.textContent = SoapFilm.sound ? 'Sound on' : 'Sound off'; });
${s.js}
</script>
</body>
</html>
`);
}

// ---- the gallery: every control live on one page, with its install line and a prompt for a coding agent
const card = (c) => `  <section class="piece" data-c="${c.id}">
    <h2>${c.name}</h2>
    <p class="tag">&lt;${c.tag}&gt; · ${c.sub}</p>
    <div class="stage">
      ${c.demo.html.replace(' id="el"', '').replace(/\n {4}/g, '\n      ')}
    </div>
    <p class="said" aria-live="polite"></p>
    <div class="acts"><a class="pill" href="../${c.id}/">Try it</a><button class="pill" type="button" data-copy="cmd">Copy install</button><button class="pill" type="button" data-copy="prompt">Copy a prompt</button></div>
  </section>`;
const prompts = Object.fromEntries(SPEC.map((c) => [c.id, [
  `Add the Soap Film ${c.name.toLowerCase()} to my app. It is a single JavaScript file with no dependencies that defines a <${c.tag}> element: a ${c.desc[0].toLowerCase() + c.desc.slice(1)}`,
  `1. Get the file from @@SITE/${c.id}/${c.id}.js and save it in my project as ${c.id}.js. Do not rewrite it or split it up: its shaders and simulation are inside it.`,
  `2. Load it with a plain script tag (not type="module"), then use ${c.tag1}.`,
  `3. ${c.docs}`,
  `4. It needs WebGL2 and is drawn for a pure white background (#FFFFFF); put it on white. It fills the width it is given, up to 640 pixels, and sets its own height.`,
  `5. The README with every attribute, property and event is at https://github.com/${REPO}/blob/main/${c.id}/README.md. Read it before wiring anything up.`,
  `When you are done, show me where you put it and what listens to it. If something about it needs to look different, tell me instead of editing the shader or simulation code.`,
  ``,
  `These components were made with the soap-film-ui skill: @@SITE/skills/soap-film-ui/SKILL.md (install with: npx skills add ${REPO}). If I later ask for another control in the same style, use it.`,
].join('\n')]));
put('gallery/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%2390f0ff%22/%3E%3Cstop offset=%22.5%22 stop-color=%22%23ffb0f0%22/%3E%3Cstop offset=%221%22 stop-color=%22%23fff08a%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2213%22 fill=%22%23fff%22 stroke=%22url(%23g)%22 stroke-width=%223%22/%3E%3C/svg%3E">
<title>Soap Film UI</title>
<meta name="description" content="${COUNT[0].toUpperCase() + COUNT.slice(1)} UI controls made of soap film. Each is a single file with no dependencies.">
<meta property="og:title" content="Soap Film UI">
<meta property="og:description" content="${COUNT[0].toUpperCase() + COUNT.slice(1)} UI controls made of soap film: real thin-film colour, a fluid simulation stirred by your hand, bubbles that swell, coalesce, bud and pop.">
<meta property="og:image" content="${SITE}/gallery/title.jpg">
<style>
${PAGE_CSS}
  body { display: block; }
  header { width: min(1320px, 100vw - 32px); margin: 0 auto; padding: 56px 0 18px; text-align: center; }
  header h1 { font-size: clamp(30px, 6vw, 52px); letter-spacing: -0.035em; font-weight: 680; }
  header p { margin: 10px auto 0; max-width: 560px; color: #555562; font-size: 16px; }
  header .links { margin-top: 18px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  #grid { width: min(1320px, 100vw - 32px); margin: 0 auto; padding: 18px 0 64px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 560px), 1fr)); gap: 28px 40px; }
  .piece { display: grid; justify-items: center; align-content: start; text-align: center; padding: 22px 0 4px; border-top: 1px solid var(--line); }
  .piece h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.015em; }
  .tag { margin: 3px 0 0; color: var(--mute); font-size: 13px; }
  .piece .stage { width: 100%; max-width: 640px; margin: 10px 0 0; }
  .said { margin: 6px 0 0; min-height: 1.45em; color: #555562; font-size: 13px; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
  footer { width: min(1320px, 100vw - 32px); margin: 0 auto; padding: 0 0 48px; text-align: center; color: var(--mute); font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1>Soap Film UI</h1>
  <p>${COUNT[0].toUpperCase() + COUNT.slice(1)} ordinary controls made of soap film. Real thin-film colour, a fluid simulation your hand stirs, and bubbles that swell, coalesce, bud and pop. Each is one file with no dependencies.</p>
  <div class="links"><a class="pill" href="https://github.com/${REPO}">Code on GitHub</a><button class="pill" type="button" id="sound" aria-pressed="true">Sound on</button></div>
</header>
<main id="grid" style="width:min(1320px, 100vw - 32px);text-align:center">
${SPEC.map(card).join('\n')}
</main>
<footer>MIT licensed. Made by <a href="https://github.com/finktheartist">finktheartist</a>. Needs WebGL2; drawn for a white page.</footer>
${SPEC.map((c) => `<script src="../${c.id}/${c.id}.js"></script>`).join('\n')}
<script>
// The gallery's own wiring. Each control is all in its own file.
const REPO = '${REPO}';
const PROMPTS = ${JSON.stringify(prompts, null, 1)};
const site = new URL('..', location.href).href.replace(/\\/$/, '');
const sound = document.getElementById('sound');
sound.addEventListener('click', () => { SoapFilm.sound = !SoapFilm.sound; sound.setAttribute('aria-pressed', SoapFilm.sound); sound.textContent = SoapFilm.sound ? 'Sound on' : 'Sound off'; });
for (const card of document.querySelectorAll('.piece')) {
  const id = card.dataset.c, said = card.querySelector('.said'), el = card.querySelector('.stage > *');
  const say = (t) => { said.textContent = t; };
  card.querySelector('[data-copy=cmd]').addEventListener('click', (e) => copy(\`npx shadcn add \${REPO}/\${id}\`, say, 'Install command copied.'));
  card.querySelector('[data-copy=prompt]').addEventListener('click', (e) => copy(PROMPTS[id].replaceAll('@@SITE', site), say, 'Prompt copied.'));
  // what each control says under it
  el.addEventListener('change', () => say(el.groups ? el.groups.map((g) => g.join(' + ')).join('  ·  ') : 'Value: ' + el.value));
  el.addEventListener('confirm', () => say('Confirmed.'));
  el.addEventListener('action', (e) => say('Action: ' + e.detail.label));
  el.addEventListener('dismiss', (e) => say('Dismissed: ' + e.detail.title));
  el.addEventListener('refresh', (e) => { say('Loading…'); e.detail.waitUntil(new Promise((r) => setTimeout(() => r({ initials: 'NP', name: 'Noa Park', preview: 'Approved the release checklist', time: 'now' }), 900))); });
  el.addEventListener('refreshed', (e) => say(e.detail.row ? 'New: ' + e.detail.row.name : 'Nothing new.'));
  if (id === 'notifications') el.addEventListener('count', () => { if (el.count === 0) setTimeout(() => { el.items = [{ icon: 'calendar', title: 'Design review', body: 'Starts in 5 min · Studio B', time: 'now' }, { icon: 'chat', title: 'Jo Reyes', body: 'Sent the final prototype', time: '1m' }, { icon: 'check', title: 'Build passed', body: 'v2.4 deployed to staging', time: '3m' }]; }, 1400); });
}
// Copying needs the clipboard API, which plain http (other than localhost) does not have, so fall back to a selected textarea.
async function copy(text, say, done) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const t = Object.assign(document.createElement('textarea'), { value: text }); t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select();
    try { ok = document.execCommand('copy'); } catch {} t.remove();
  }
  say(ok ? done : 'Could not copy here.');
}
</script>
</body>
</html>
`);

put('registry.json', JSON.stringify({
  $schema: 'https://ui.shadcn.com/schema/registry.json', name: 'soap-film-ui', homepage: SITE,
  items: SPEC.map((c) => ({
    name: c.id, type: 'registry:file', title: `Soap Film ${c.name}`,
    description: `${c.desc} One WebGL2 file of about ${kb(c.id)} KB, no dependencies, defines <${c.tag}>.`,
    author: AUTHOR, categories: c.categories,
    files: [{ path: `${c.id}/${c.id}.js`, type: 'registry:file', target: `~/public/soap-film-ui/${c.id}.js` }],
    docs: `Soap Film ${c.name} is a plain script that registers a custom element. Load /soap-film-ui/${c.id}.js with a script tag (not a module), then use ${c.tag1}. ${c.docs} Drawn for a white page; needs WebGL2. More: ${SITE}`,
  })),
}, null, 2) + '\n');

put('llms.txt', `# Soap Film UI

> ${COUNT[0].toUpperCase() + COUNT.slice(1)} UI controls made of soap film: real thin-film interference colour, a fluid simulation stirred by your hand, and bubbles that swell, coalesce, bud and pop. Each is one plain script that registers a custom element, with its WebGL2 shaders and its simulation inside it: no dependencies, no build step, no other files to fetch. MIT licensed.

Live gallery: ${SITE}
Source: https://github.com/${REPO}

## Drop-in components

Each is one plain script that registers a custom element. Load it with a script tag, not as a module. Do not rewrite or split the file. Each carries a copy of the shared core; the first one loaded sets window.SoapFilm and the rest reuse it, so any mix shares one clock and one sound engine.

${SPEC.map((c) => `- [${c.name}](${SITE}/${c.id}/${c.id}.js): ${c.desc} Use ${c.tag1}. ${c.docs} [Docs](https://github.com/${REPO}/blob/main/${c.id}/README.md)`).join('\n')}

Install any one with the shadcn CLI: \`npx shadcn add ${REPO}/NAME\`, where NAME is ${SPEC.map((c) => c.id).join(', ')}. The file lands in \`public/soap-film-ui/\`.

They need WebGL2 and are drawn for a pure white page. Each fills the width it is given, up to 640 pixels. Each has a real input or button inside it for the keyboard and screen readers. They make soft synthesized sound after the first tap; SoapFilm.sound = false mutes the page, a muted attribute mutes one.

## The skill

- [soap-film-ui skill](${SITE}/skills/soap-film-ui/SKILL.md): the workflow and rules these were made by. Install with \`npx skills add ${REPO}\`.
- [core.js](${SITE}/skills/soap-film-ui/core.js): the shared core (one clock, the synthesized sound, a custom-element base class that builds and resizes a WebGL engine).
- [starter.html](${SITE}/skills/soap-film-ui/starter.html): the smallest whole example, a soap-film toggle with its own shader and fluid grid.
- [look.mjs](${SITE}/skills/soap-film-ui/look.mjs): stops the clock, steps an interaction to chosen moments and saves the frames side by side.

## How they were made

- [making-of/README.md](${SITE}/making-of/README.md): the physics behind each control and how the look was found.
`);
if (check && stale) process.exit(1);
