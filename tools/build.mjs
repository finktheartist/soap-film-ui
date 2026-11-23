// Put each component file together from its parts, so each file works on its own.
//   <id>/<id>.js = a header + core.js (with src/sound.js inside it) + src/engines/<id>.js + src/elements/<id>.js
//   node tools/build.mjs          (run it after editing core.js or anything in src/)
//   node tools/build.mjs --check  (exits 1 if any file is out of date, and changes nothing)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC } from './spec.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8').trim();
const check = process.argv.includes('--check');

const src = read('core.js');
if (!src.includes('// @@sound')) throw new Error('core.js: no @@sound marker');
export const core = src.replace(/\/\/ @@sound[^\n]*/, () => read('src/sound.js'));

let stale = 0;
const put = (rel, next) => {
  let was = ''; try { was = readFileSync(join(root, rel), 'utf8'); } catch {}
  if (next !== was) { stale++; if (!check) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), next); } console.log(`${check ? 'stale' : 'wrote'} ${rel} (${Math.round(next.length / 1024)} KB)`); }
};
const wrapLines = (s, n = 112) => s.split(' ').reduce((a, w) => { const l = a[a.length - 1]; if ((l + ' ' + w).length > n) a.push(w); else a[a.length - 1] = l ? l + ' ' + w : w; return a; }, ['']);

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const c of SPEC) {
    const head = [`Soap Film ${c.name}: ${c.desc}`, '', `One file, no dependencies. Load it with a script tag and use ${c.tag1}. ${c.docs}`, '',
      'Made of four parts, put together by tools/build.mjs in github.com/finktheartist/soap-film-ui: the shared core (the clock,',
      'the sound and the element base class), the engine (its shaders and its soap-film simulation) and the element.']
      .flatMap((l) => (l ? wrapLines(l) : [''])).map((l) => ('// ' + l).trimEnd()).join('\n');
    const body = `${head}
(() => {
'use strict';
// >>> soap core (core.js and src/sound.js; edit those, not this)
${core}
// <<< soap core
if (customElements.get('${c.tag}')) return;
// >>> engine (src/engines/${c.id}.js)
${read(`src/engines/${c.id}.js`)}
// <<< engine
// >>> element (src/elements/${c.id}.js)
${read(`src/elements/${c.id}.js`)}
// <<< element
})();
`;
    put(`${c.id}/${c.id}.js`, body);
  }
  put('skills/soap-film-ui/core.js', core + '\n');
  if (check && stale) process.exit(1);
}
