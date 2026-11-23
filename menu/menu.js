// Soap Film Bubble menu: A bar of five bubbles where the chosen one is bigger. Pick another and a soap bridge
// joins them and the size flows across, as if the soap were poured from one to the other; across several, the big
// bubble seems to travel down the bar.
//
// One file, no dependencies. Load it with a script tag and use <soap-menu>…</soap-menu>. Put five <option>s
// inside, with values home, search, inbox, saved and profile for the icons. Read el.value and listen for change.
// Works in forms with a name.
//
// Made of four parts, put together by tools/build.mjs in github.com/finktheartist/soap-film-ui: the shared core
// (the clock,
// the sound and the element base class), the engine (its shaders and its soap-film simulation) and the element.
(() => {
'use strict';
// >>> soap core (core.js and src/sound.js; edit those, not this)
// Soap Film UI core. Every component file carries a copy of this, stamped in by tools/build.mjs.
// The first file loaded sets window.SoapFilm and the others reuse it, so any mix of them on a page shares
// one clock and one sound engine.
//
//   SoapFilm.sound = false            mute every control on the page (or put a `muted` attribute on one)
//   SoapFilm.clock.manual = true      stop the clock; then SoapFilm.clock.advance(1 / 60) steps every control
//   SoapFilm.Base                     the custom-element base class each control extends
const SoapFilm = window.SoapFilm || (window.SoapFilm = (() => {
// Tactile synthesized wet-membrane foley for Soap Film UI prototype
// (Placeholder Web Audio synthesis; easily swappable for recorded/ElevenLabs foley.)

class SoapAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.glideNode = null;
    this.glideGain = null;
    this.glideFilter = null;
    this.tensionOsc = null;
    this.tensionGain = null;
    this.noiseBuf = null;
  }

  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._buildNoiseBuffer();
      this._buildContinuousNodes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setEnabled(v) {
    this.enabled = !!v;
    if (!this.enabled && this.glideGain && this.ctx) {
      this.glideGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    }
    if (!this.enabled && this.tensionGain && this.ctx) {
      this.tensionGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    }
  }

  _buildNoiseBuffer() {
    const sr = this.ctx.sampleRate;
    const len = sr * 2;
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.032;
      b2 = 0.950 * b2 + w * 0.048;
      data[i] = (b0 + b1 + b2 + w * 0.18) * 1.4;
    }
    this.noiseBuf = buf;
  }

  _buildContinuousNodes() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 3.2;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    this.glideNode = src;
    this.glideFilter = filter;
    this.glideGain = gain;

    // Soft elastic membrane tension tone while dimpling
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 280;
    const tGain = ctx.createGain();
    tGain.gain.value = 0;
    osc.connect(tGain);
    tGain.connect(ctx.destination);
    osc.start();
    this.tensionOsc = osc;
    this.tensionGain = tGain;
  }

  updateGlide(speedNorm) {
    if (!this.enabled || !this.ctx || !this.glideGain) return;
    const s = Math.max(0, Math.min(1, speedNorm));
    const now = this.ctx.currentTime;
    const targetGain = s > 0.02 ? Math.pow(s, 1.15) * 0.095 : 0;
    const targetFreq = 950 + s * 2200;
    this.glideGain.gain.setTargetAtTime(targetGain, now, 0.035);
    this.glideFilter.frequency.setTargetAtTime(targetFreq, now, 0.04);
  }

  updateTension(depthNorm) {
    if (!this.enabled || !this.ctx || !this.tensionGain) return;
    const d = Math.max(0, Math.min(1, depthNorm));
    const now = this.ctx.currentTime;
    this.tensionGain.gain.setTargetAtTime(d > 0.02 ? d * 0.028 : 0, now, 0.04);
    this.tensionOsc.frequency.setTargetAtTime(240 + d * 340, now, 0.04);
  }

  playPop(intensity = 1.0) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const amp = 0.65 + 0.35 * Math.min(1.2, intensity);

    // 1. Crisp hollow bubble-cavity upward chirp
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(1480, now + 0.024);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.001, now);
    oGain.gain.linearRampToValueAtTime(0.24 * amp, now + 0.003);
    oGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.036);

    osc.connect(oGain);
    oGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);

    // 2. Snappy film-snap transient
    const snap = ctx.createBufferSource();
    snap.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2600, now);
    bp.Q.value = 1.8;

    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.22 * amp, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

    snap.connect(bp);
    bp.connect(sGain);
    sGain.connect(ctx.destination);
    snap.start(now, Math.random() * 1.2, 0.04);

    // 3. Microscopic airborne mist shimmer
    const mist = ctx.createBufferSource();
    mist.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(5200, now + 0.006);

    const mGain = ctx.createGain();
    mGain.gain.setValueAtTime(0.0001, now);
    mGain.gain.linearRampToValueAtTime(0.065 * amp, now + 0.012);
    mGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.095);

    mist.connect(hp);
    hp.connect(mGain);
    mGain.connect(ctx.destination);
    mist.start(now, Math.random() * 1.2, 0.12);
  }

  playRefilm() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Silky capillary curtain sweep
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(480, now);
    bp.frequency.exponentialRampToValueAtTime(1650, now + 0.24);
    bp.Q.value = 3.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0005, now);
    gain.gain.linearRampToValueAtTime(0.068, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.30);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now, Math.random() * 1.0, 0.34);

    // Tiny liquid lock ping at end of curtain
    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(980, now + 0.21);
    ping.frequency.exponentialRampToValueAtTime(1240, now + 0.27);
    const pGain = ctx.createGain();
    pGain.gain.setValueAtTime(0.0001, now + 0.20);
    pGain.gain.linearRampToValueAtTime(0.025, now + 0.22);
    pGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.31);
    ping.connect(pGain);
    pGain.connect(ctx.destination);
    ping.start(now + 0.20);
    ping.stop(now + 0.33);
  }

  playSnap(isOn) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isOn ? 520 : 680, now);
    osc.frequency.exponentialRampToValueAtTime(isOn ? 940 : 410, now + 0.045);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.055, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0006, now + 0.06);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  playTap(pitch = 780) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.25, now + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.022, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.055);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Delicate staggered crystalline micro-bubbles fizzing up at the edges on settle
  playFizz(intensity = 0.8) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const n = Math.max(3, Math.min(6, Math.round(3 + intensity * 3)));
    for (let i = 0; i < n; i++) {
      const t0 = now + 0.03 + i * 0.052 + Math.random() * 0.025;
      const baseF = 1150 + Math.random() * 1450;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseF, t0);
      osc.frequency.exponentialRampToValueAtTime(baseF * 1.55, t0 + 0.018);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0004, t0);
      g.gain.linearRampToValueAtTime(0.016 * Math.min(1.2, intensity), t0 + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0003, t0 + 0.024);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.03);
    }
  }

  // Wet Plateau-Rayleigh catenoid pinch-off: hollow liquid bloop + tiny satellite ping
  playPinchOff() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Resonant liquid detachment bloop
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.052);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.095);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    // 2. Tiny wet filament snap click
    if (this.noiseBuf) {
      const snap = ctx.createBufferSource();
      snap.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1900, now);
      bp.Q.value = 2.6;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.09, now);
      sg.gain.exponentialRampToValueAtTime(0.0008, now + 0.022);
      snap.connect(bp);
      bp.connect(sg);
      sg.connect(ctx.destination);
      snap.start(now, Math.random() * 1.1, 0.03);
    }

    // 3. Delicate high harmonic satellite-droplet ping 22ms after snap
    const sat = ctx.createOscillator();
    sat.type = 'sine';
    sat.frequency.setValueAtTime(1180, now + 0.022);
    sat.frequency.exponentialRampToValueAtTime(1640, now + 0.055);
    const satG = ctx.createGain();
    satG.gain.setValueAtTime(0.0004, now + 0.022);
    satG.gain.linearRampToValueAtTime(0.042, now + 0.028);
    satG.gain.exponentialRampToValueAtTime(0.0004, now + 0.068);
    sat.connect(satG);
    satG.connect(ctx.destination);
    sat.start(now + 0.022);
    sat.stop(now + 0.075);
  }

  // Soft liquid passing bloop as traveling mass crosses an intermediate menu bubble
  playPassBubble(stepIdx = 0) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const base = 360 + Math.min(4, stepIdx) * 55;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.48, now + 0.055);
    osc.frequency.exponentialRampToValueAtTime(base * 1.12, now + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0006, now);
    g.gain.linearRampToValueAtTime(0.065, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0006, now + 0.12);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  // Warm buoyant arrival bloop + delicate meniscus pinch when mass finishes inflating target bubble
  playArriveBubble() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.065);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.010);
    g.gain.exponentialRampToValueAtTime(0.0007, now + 0.15);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);

    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(1120, now + 0.03);
    ping.frequency.exponentialRampToValueAtTime(1480, now + 0.07);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0004, now + 0.03);
    pg.gain.linearRampToValueAtTime(0.028, now + 0.038);
    pg.gain.exponentialRampToValueAtTime(0.0004, now + 0.085);
    ping.connect(pg);
    pg.connect(ctx.destination);
    ping.start(now + 0.03);
    ping.stop(now + 0.095);
  }

  // Delicate ascending liquid mitosis pinch-off as each orbiting bud snaps free
  playBudSplit(idx = 0) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const scale = [1.0, 1.12, 1.25, 1.38][Math.max(0, Math.min(3, idx))];

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360 * scale, now);
    osc.frequency.exponentialRampToValueAtTime(840 * scale, now + 0.048);
    osc.frequency.exponentialRampToValueAtTime(680 * scale, now + 0.092);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0006, now);
    g.gain.linearRampToValueAtTime(0.095, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0006, now + 0.105);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.115);

    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(1180 * scale, now + 0.018);
    ping.frequency.exponentialRampToValueAtTime(1540 * scale, now + 0.052);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0003, now + 0.018);
    pg.gain.linearRampToValueAtTime(0.024, now + 0.024);
    pg.gain.exponentialRampToValueAtTime(0.0003, now + 0.068);
    ping.connect(pg);
    pg.connect(ctx.destination);
    ping.start(now + 0.018);
    ping.stop(now + 0.075);
  }

  // Warm velvety coalescence swell as buds re-absorb into the central hub
  playBudMerge() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.075);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.155);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, now);
    g.gain.linearRampToValueAtTime(0.115, now + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0007, now + 0.18);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  // Soft velvety cushion-bloop when two foam bubbles touch and flatten a Plateau wall
  playFoamTouch() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(290, now);
    osc.frequency.exponentialRampToValueAtTime(470, now + 0.045);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.105);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0005, now);
    g.gain.linearRampToValueAtTime(0.075, now + 0.010);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.115);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.125);
  }

  // Warm liquid coalescence swell when two tag bubbles fuse into a larger group
  playTagMerge(size = 2) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const base = Math.max(240, 440 - (size - 2) * 55);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base * 1.35, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.82, now + 0.065);
    osc.frequency.exponentialRampToValueAtTime(base * 1.12, now + 0.15);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0007, now + 0.17);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  // Crisp wet tear-split bloop when pulling a tag free from a merged bubble
  playTagSplit() {
    if (!this.enabled || !this.ctx) return;
    this.playPinchOff();
  }

  // Whisper-soft liquid glass micro-tick for rotary soap dial detents
  playDialTick(norm = 0.5) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const f = 680 + Math.max(0, Math.min(1, norm)) * 520;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 1.22, now + 0.018);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0003, now);
    g.gain.linearRampToValueAtTime(0.018, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0003, now + 0.024);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.028);
  }
}

const shared = new SoapAudio();
let soundOn = true;
// each control talks to the shared engine through this, so a muted one, or a muted page, stays quiet
const audioFor = (el) => new Proxy(shared, {
  get(t, k) {
    const v = t[k];
    if (typeof v !== 'function') return v;
    return (...a) => ((k === 'unlock' || (soundOn && !el.hasAttribute('muted'))) ? v.apply(t, a) : undefined);
  },
});
const hush = () => { try { shared.updateGlide(0); shared.updateTension(0); } catch {} };

// one clock for every control on the page; a control off screen is not stepped or drawn
const live = new Set();
let last = 0, raf = 0;
const clock = {
  manual: false,
  time: 0,
  advance(dt) { clock.time += dt; for (const el of live) el.tick(dt, true); },
  resume() { clock.manual = false; wake(); },
};
const frame = (now) => {
  raf = 0;
  if (clock.manual) { last = 0; return; }
  const dt = last ? Math.min(0.033, (now - last) / 1000) : 1 / 60;
  last = now; clock.time += dt;
  for (const el of live) if (el.visible) el.tick(dt);
  if (live.size) raf = requestAnimationFrame(frame);
};
const wake = () => { if (!raf && !clock.manual && live.size) { last = 0; raf = requestAnimationFrame(frame); } };
document.addEventListener('visibilitychange', () => { last = 0; });

const CSS = `:host{display:block;width:100%;max-width:640px;-webkit-tap-highlight-color:transparent;color:#16161A}
:host([hidden]){display:none}
.box{position:relative;width:100%;user-select:none;-webkit-user-select:none;border-radius:18px;outline:none}
.box:has(:focus-visible){outline:2px solid rgba(22,22,26,.28);outline-offset:3px}
.mount{position:absolute;inset:0}
.sr{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;opacity:0;pointer-events:none;appearance:none;background:none}
.fail{position:absolute;inset:0;display:grid;place-items:center;font:500 13px/1.3 system-ui,sans-serif;color:#888894;text-align:center;padding:12px}`;

class Base extends HTMLElement {
  // a subclass sets: static size(w) -> height in CSS pixels, static touch (the touch-action), static css,
  // create(mount, opts) -> the engine, overlay() -> the real control's HTML, and wire() to hook it up
  static touch = 'none';
  static minWidth = 260;
  constructor() { super(); this.attachShadow({ mode: 'open', delegatesFocus: true }); this.visible = true; }
  // focus goes to the real control inside (for a group, the chosen one)
  focus(o) { (this.focusTarget?.() || this.shadowRoot.querySelector('input, button'))?.focus(o); }

  connectedCallback() {
    if (!this.box) {
      const C = this.constructor;
      this.shadowRoot.innerHTML = `<style>${CSS}${C.css || ''}</style><div class="box" part="stage" style="touch-action:${C.touch}"><div class="mount"></div>${this.overlay ? this.overlay() : ''}</div>`;
      this.box = this.shadowRoot.querySelector('.box');
      this.mount = this.shadowRoot.querySelector('.mount');
      this.$ = (s) => this.shadowRoot.querySelector(s);
      for (const n of ['pointerdown', 'keydown']) this.box.addEventListener(n, () => shared.unlock(), true);
      this.wire?.();
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this);
    this.io = new IntersectionObserver((es) => { this.visible = es[es.length - 1].isIntersecting; });
    this.io.observe(this);
    this.resize(true);
    live.add(this); wake();
  }

  disconnectedCallback() {
    live.delete(this);
    this.ro?.disconnect(); this.io?.disconnect();
    clearTimeout(this.later);
    this.drop();
  }

  // the engines draw at a fixed size, so a new width means a new engine; the control's state is carried over
  resize(now) {
    const w = Math.max(this.constructor.minWidth, Math.round(this.getBoundingClientRect().width) || 640);
    if (this.engine && Math.abs(w - this.w) < 4) return;
    clearTimeout(this.later);
    if (now || !this.engine) this.build(w);
    else this.later = setTimeout(() => this.build(w), 180);
  }

  build(w) {
    const keep = this.engine && this.save ? this.save() : undefined;
    this.drop();
    const h = Math.round(this.constructor.size(w));
    this.w = w; this.h = h;
    this.box.style.height = h + 'px';
    try {
      this.engine = this.create(this.mount, { width: w, height: h, dpr: Math.min(window.devicePixelRatio || 1, 2), audio: this.audio || (this.audio = audioFor(this)) });
      this.engine.wrap.style.width = w + 'px';
      this.engine.step(1 / 60); this.engine.render();
      this.restore?.(keep);
    } catch (e) {
      this.engine = null;
      this.mount.innerHTML = '<div class="fail">This control needs WebGL2, which this browser could not start.</div>';
      console.warn(this.localName + ':', e);
    }
  }

  drop() {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    try { e.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
    e.wrap?.remove();
  }

  tick(dt) {
    const e = this.engine;
    if (!e) return;
    try { this.beforeStep?.(dt); e.step(dt); e.render(); }
    catch (err) { console.error(this.localName + ':', err); live.delete(this); }
  }

  // pointer position in the engine's CSS pixels
  local(ev) { const r = this.box.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  emit(type, detail) { return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })); }
  attr(name, d) { const v = this.getAttribute(name); return v === null ? d : v; }
  num(name, d) { const v = parseFloat(this.getAttribute(name)); return Number.isFinite(v) ? v : d; }
  // <option> children, for the controls that take a list
  options() { return [...this.querySelectorAll(':scope > option')].map((o) => ({ value: o.value || o.textContent.trim(), label: o.textContent.trim(), o })); }
  get muted() { return this.hasAttribute('muted'); }
  set muted(v) { this.toggleAttribute('muted', !!v); if (v) hush(); }
}

return {
  version: '1.0.0',
  Base,
  clock,
  get sound() { return soundOn; },
  set sound(v) { soundOn = !!v; if (!soundOn) hush(); },
  audio: shared,
  esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  define(tag, C) { if (!customElements.get(tag)) customElements.define(tag, C); },
};
})());
// <<< soap core
if (customElements.get('soap-menu')) return;
// >>> engine (src/engines/menu.js)
// ============================================================================
// SOAP FILM · BUBBLE MENU (CONSERVATION-OF-MASS TRAVELING LIQUID TRANSFER)
// ============================================================================
// A 5-item floating soap-bubble navigation bar where the selected bubble is
// buoyantly larger than the rest. Selecting another item connects adjacent
// bubbles via glossy catenoid liquid bridges and pumps the excess bubble mass
// from the old selection into the new one (old shrinks, new inflates).
// Selecting across intermediate items sends the big bubble visibly traveling
// across the menu—sequentially fusing, swelling each bubble it passes through,
// and pinching off behind it with damped capillary jelly wobble.

const VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSim;      // R: thickness, G: z-wave, B: shimmer
uniform vec2 uRes;
uniform vec2 uSize;
uniform float uTime;

// 5 menu bubbles:
// uBubbles[i] = (cx, cy, radius, wobbleAmp)
// uBubMeta[i] = (wobPhase, massFrac 0..1, stretchX, dNmOffset)
#define NUM_BUBBLES 5
uniform vec4 uBubbles[NUM_BUBBLES];
uniform vec4 uBubMeta[NUM_BUBBLES];

// Pairwise catenoid liquid bridge smooth-min radii (0 = disconnected, >0 = fused liquid neck)
uniform vec4 uBridgeK;       // (k01, k12, k23, k34)

// Traveling excess-mass liquid bolus gliding across active bridges
uniform vec4 uPulse;         // (pulseX, pulseY, pulseR, pulseAlpha)
uniform float uTravelSpeed;  // 0..1 normalized transfer intensity

// Delicate 3D WebGL2 pinch-off micro-droplets shed when bridges snap free
#define MAX_DAUGHTERS 10
uniform int uDaughterCount;
uniform vec4 uDPos[MAX_DAUGHTERS]; // (x, y, radius, alpha)
uniform vec4 uDOpt[MAX_DAUGHTERS]; // (dNm, wobAmp, wobPhase, age)

float smin(float a, float b, float k) {
  float kk = max(k, 0.0005);
  float h = clamp(0.5 + 0.5 * (b - a) / kk, 0.0, 1.0);
  return mix(b, a, h) - kk * h * (1.0 - h);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// High-chroma stylized-physical thin-film interference spectrum (matches Soap Film family)
vec3 bubbleIridescence(float dNm, float cosTheta) {
  float nFilm = 1.333;
  float opd = 2.0 * nFilm * dNm * cosTheta;

  const float WL[6] = float[6](645.0, 595.0, 545.0, 500.0, 465.0, 430.0);
  const vec3 WRGB[6] = vec3[6](
    vec3(0.76, 0.06, 0.00),
    vec3(0.48, 0.36, 0.00),
    vec3(0.10, 0.56, 0.06),
    vec3(0.00, 0.44, 0.34),
    vec3(0.02, 0.14, 0.68),
    vec3(0.28, 0.02, 0.58)
  );

  vec3 col = vec3(0.0);
  float coh = exp(-max(0.0, dNm - 160.0) * 0.00042);
  for (int i = 0; i < 6; i++) {
    float phase = 6.2831853 * opd / WL[i];
    float s = sin(phase * 0.5);
    float r = mix(0.5, s * s, coh);
    col += WRGB[i] * r;
  }
  col *= vec3(1.12, 1.04, 1.16);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.58);
  col = pow(clamp(col, 1e-4, 1.25), vec3(0.92));

  float newton = smoothstep(14.0, 62.0, dNm);
  return clamp(col * newton, 0.0, 1.25);
}

vec3 bubbleSpeculars(vec3 N, float NdotV, vec2 pNorm, float time, float starBoost) {
  vec3 V = vec3(0.0, 0.0, 1.0);

  vec3 L1 = normalize(vec3(-0.56, 0.78, 0.48));
  vec3 H1 = normalize(L1 + V);
  float ndh1 = max(0.0, dot(N, H1));
  float arc1 = smoothstep(0.85, 0.94, ndh1) * 0.78 + smoothstep(0.955, 0.990, ndh1) * 0.98;

  vec3 L2 = normalize(vec3(0.68, -0.56, 0.44));
  vec3 H2 = normalize(L2 + V);
  float ndh2 = max(0.0, dot(N, H2));
  float arc2 = smoothstep(0.88, 0.96, ndh2) * 0.52;

  float skyArc = smoothstep(0.22, 0.90, -pNorm.x * 0.55 + pNorm.y * 0.85) * smoothstep(0.16, 0.80, 1.0 - NdotV) * 0.26;

  // Optical 4-ray + diagonal diamond starburst glint on upper-left shoulder
  vec2 starCenter = vec2(-0.42, 0.50);
  vec2 dStar = (pNorm - starCenter) * 3.4;
  float rStar = length(dStar);
  float rayH = exp(-abs(dStar.y) * 26.0) * exp(-abs(dStar.x) * 4.0);
  float rayV = exp(-abs(dStar.x) * 26.0) * exp(-abs(dStar.y) * 4.0);
  vec2 dDiag = vec2(dStar.x + dStar.y, dStar.x - dStar.y) * 0.7071;
  float rayD = (exp(-abs(dDiag.y) * 34.0) * exp(-abs(dDiag.x) * 7.0)
              + exp(-abs(dDiag.x) * 34.0) * exp(-abs(dDiag.y) * 7.0)) * 0.50;
  float coreDot = exp(-rStar * rStar * 22.0);
  float twinkle = 0.82 + 0.18 * sin(time * (4.6 + starBoost * 4.8) + pNorm.x * 2.0);
  float starburst = (coreDot * 0.98 + (rayH + rayV + rayD) * smoothstep(0.82, 0.0, rStar) * 0.90)
                  * twinkle * smoothstep(0.35, 0.80, ndh1 + 0.20) * starBoost;

  return vec3(clamp(arc1 + arc2 + skyArc + starburst, 0.0, 1.55), skyArc, starburst);
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

// Photorealistic 3D WebGL2 pinch-off satellite micro-bubble
vec4 evalDaughterBubble(vec2 p, vec4 posR, vec4 opt, float px) {
  float r = posR.z;
  float a = posR.w;
  if (r <= 0.001 || a <= 0.002) return vec4(0.0);

  vec2 dp = p - posR.xy;
  float wobAmp = opt.y;
  float rPad = r * (1.0 + abs(wobAmp) * 1.18) + px * 3.0;
  if (dot(dp, dp) > rPad * rPad) return vec4(0.0);

  float ang = atan(dp.y, dp.x);
  float phase = opt.z;
  float wob = wobAmp * (0.72 * cos(2.0 * ang + phase) + 0.28 * sin(3.0 * ang - phase * 1.35));
  float rEff = max(0.0025, r * (1.0 + wob));
  float dist = length(dp);
  float sd = dist - rEff;
  float mask = smoothstep(px * 1.35, -px * 1.35, sd);
  if (mask <= 0.001) return vec4(0.0);

  vec2 nXY = dp / max(rEff, 0.004);
  float r2 = clamp(dot(nXY, nXY), 0.0, 0.992);
  float nz = sqrt(max(0.06, 1.0 - r2));
  vec2 swirlN = 0.055 * vec2(
    sin(nXY.y * 3.8 + uTime * 2.4 + phase),
    cos(nXY.x * 3.4 - uTime * 2.1 + phase * 1.3)
  );
  vec3 N = normalize(vec3(nXY + swirlN * (1.0 - r2 * 0.55), nz));
  float NdotV = clamp(N.z, 0.06, 1.0);
  float fres = pow(max(1e-4, 1.0 - NdotV), 2.20);
  float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.7);

  float drainGrad = (0.5 - 0.5 * nXY.y) * 165.0;
  float swirlBand = 115.0 * sin(nXY.x * 2.5 - nXY.y * 3.0 + uTime * 2.0 + phase);
  float dNm = opt.x + drainGrad + swirlBand + fres * 230.0;
  float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
  float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
  vec3 irid = bubbleIridescence(dNm, cosTheta);

  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L1 = normalize(vec3(-0.56, 0.78, 0.46));
  vec3 H1 = normalize(L1 + V);
  float ndh1 = max(0.0, dot(N, H1));
  float spec1 = smoothstep(0.84, 0.94, ndh1) * 0.76 + smoothstep(0.955, 0.992, ndh1) * 0.98;

  vec3 L2 = normalize(vec3(0.66, -0.58, 0.44));
  vec3 H2 = normalize(L2 + V);
  float ndh2 = max(0.0, dot(N, H2));
  float spec2 = smoothstep(0.87, 0.96, ndh2) * 0.52;

  float skyArc = smoothstep(0.20, 0.88, -nXY.x * 0.55 + nXY.y * 0.85) * smoothstep(0.18, 0.82, 1.0 - NdotV) * 0.24;

  float rNorm = sqrt(r2);
  float rimOff = max(0.055, min(0.16, px * 1.15 / max(rEff, 0.004)));
  float icArg = (1.0 - rNorm - rimOff) / max(0.042, rimOff * 0.72);
  float innerContour = exp(-(icArg * icArg));
  float hairOff = min(0.045, px * 0.48 / max(rEff, 0.004));
  float ohArg = (1.0 - rNorm - hairOff) / max(0.024, px * 0.55 / max(rEff, 0.004));
  float outerHair = exp(-(ohArg * ohArg));

  vec3 contourCol = mix(vec3(0.34, 0.39, 0.65), irid * 0.64 + vec3(0.16, 0.15, 0.32), 0.52);
  vec3 domeCol = mix(vec3(0.95, 0.97, 1.0), irid * 0.94 + vec3(0.14, 0.16, 0.24), 0.88);
  vec3 col = mix(vec3(0.98, 0.99, 1.0), domeCol, clamp(0.12 + fres * 0.82, 0.0, 1.0));
  col = mix(col, contourCol, clamp(innerContour * 0.54 + razorRim * 0.44, 0.0, 0.78));
  float crescent = smoothstep(0.10, 0.76, fres) * (1.0 - outerHair * 0.62);
  col = mix(col, clamp(irid * 1.12 + vec3(0.08, 0.07, 0.12), 0.0, 1.0), crescent * 0.68);
  col = mix(col, vec3(1.0, 0.998, 1.0), clamp((spec1 + spec2 + skyArc) * 0.96 + outerHair * 0.84, 0.0, 0.99));

  float alpha = clamp(0.048 + fres * 0.76 + innerContour * 0.48 + outerHair * 0.72 + (spec1 + spec2 + skyArc) * 0.88, 0.0, 0.95);
  return vec4(col * (alpha * mask * a), alpha * mask * a);
}

// ============================================================================
// 5-BUBBLE SELECTIVE LIQUID-BRIDGE METABALL SDF
// ============================================================================
float sdSingleBubble(vec2 p, vec4 bub, vec4 meta) {
  vec2 bp = p - bub.xy;
  float r = max(0.02, bub.z);
  float ang = atan(bp.y, bp.x);
  float rNorm = length(bp) / r;
  float wobFade = smoothstep(0.08, 0.46, rNorm);

  // Subtle horizontal teardrop elongation toward the active connecting neck
  float sx = 1.0 + abs(meta.z) * 0.16;
  vec2 sp = vec2(bp.x / sx, bp.y * sqrt(sx));
  float baseD = (length(sp) - r) * sqrt(sx);

  // Authentic damped quadrupole + octupole pinch-off jelly oscillation
  float ph = meta.x;
  float wob = bub.w * (0.72 * cos(2.0 * ang + ph) + 0.28 * sin(3.0 * ang - ph * 1.35)) * r * wobFade;
  // Subtle living ambient breath ripple
  float breath = 0.0022 * sin(2.0 * ang + uTime * 2.2 + meta.w * 0.02) * wobFade;
  return baseD - wob - breath;
}

float sdMenuSoap(
  vec2 p,
  out vec2 outSmoothCenter,
  out float outSmoothR,
  out float outMassMix,
  out float outBridgeF
) {
  float d[NUM_BUBBLES];
  for (int i = 0; i < NUM_BUBBLES; i++) {
    d[i] = sdSingleBubble(p, uBubbles[i], uBubMeta[i]);
  }

  float dMin = d[0];
  for (int i = 1; i < NUM_BUBBLES; i++) {
    dMin = min(dMin, d[i]);
  }

  // C-infinity softmax weighting across all 5 bubbles -> ZERO Voronoi jump seams anywhere!
  vec2 cSum = vec2(0.0);
  float rSum = 0.0;
  float mSum = 0.0;
  float wSum = 0.0;
  for (int i = 0; i < NUM_BUBBLES; i++) {
    float wi = exp(-max(0.0, d[i] - dMin) * 16.0);
    cSum += uBubbles[i].xy * wi;
    rSum += uBubbles[i].z * wi;
    mSum += uBubMeta[i].y * wi;
    wSum += wi;
  }
  float invW = 1.0 / max(1e-5, wSum);
  outSmoothCenter = cSum * invW;
  outSmoothR = rSum * invW;
  outMassMix = mSum * invW;

  float dTotal = dMin;
  outBridgeF = 0.0;

  // Selective smooth-min liquid bridges ONLY between adjacent pairs actively transferring mass!
  float ks[4] = float[4](uBridgeK.x, uBridgeK.y, uBridgeK.z, uBridgeK.w);
  for (int k = 0; k < 4; k++) {
    float kk = ks[k];
    if (kk > 0.002) {
      float dPair = smin(d[k], d[k + 1], kk);
      float neckBand = exp(-abs(d[k] - d[k + 1]) / max(0.024, kk * 0.85)) * smoothstep(0.002, 0.050, kk);

      // Traveling liquid transfer bolus smoothly pumping volume across the midpoint gap!
      if (uPulse.w > 0.01) {
        float midX = 0.5 * (uBubbles[k].x + uBubbles[k + 1].x);
        float nearMid = smoothstep(0.32, 0.02, abs(uPulse.x - midX));
        if (nearMid > 0.01) {
          float rP = uPulse.z * (0.45 + 0.55 * nearMid);
          vec2 pp = p - uPulse.xy;
          float dP = (length(vec2(pp.x * 0.82, pp.y * 1.18)) - rP) * 0.90;
          dPair = smin(dPair, dP, kk * 0.80 * nearMid);
          float pArg = length(pp) / max(0.05, rP * 1.8);
          neckBand = max(neckBand, exp(-(pArg * pArg)) * nearMid * uPulse.w);
        }
      }

      dTotal = min(dTotal, dPair);
      outBridgeF = max(outBridgeF, neckBand);
    }
  }

  return dTotal;
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);

  // Fast bounding-box early-out covering the 5-bubble menu dock + soft ground shadows
  bool inMenuBox = (abs(p.x) < 1.62) && (p.y < 0.48) && (p.y > -0.44);

  if (inMenuBox) {
    vec2 smoothC;
    float smoothR, massMix, bridgeF;
    float sdBubble = sdMenuSoap(p, smoothC, smoothR, massMix, bridgeF);

    // --- 1. SEAMLESS AIRY FLOATING SHADOWS BENEATH EACH SOAP BUBBLE ---
    {
      float shAcc = 0.0;
      for (int i = 0; i < NUM_BUBBLES; i++) {
        float m = uBubMeta[i].y;
        vec2 shPos = uBubbles[i].xy + vec2(0.014, -(0.044 + 0.018 * m));
        float rSh = uBubbles[i].z * (1.28 + 0.14 * m);
        float dSh = length(p - shPos);
        if (dSh < rSh * 1.45) {
          float s = smoothstep(rSh * 1.35, uBubbles[i].z * 0.18, dSh) * (0.034 + 0.022 * m);
          shAcc = max(shAcc, s);
        }
      }
      if (shAcc > 0.001) {
        outCol = over(vec4(vec3(0.24, 0.26, 0.44) * shAcc, shAcc), outCol);
      }
    }

    // --- 2. 3D VOLUMETRIC IRIDESCENT BUBBLES + SEAMLESS LIQUID MASS-TRANSFER BRIDGES ---
    float orbMask = smoothstep(px * 1.75, -px * 1.75, sdBubble);
    if (orbMask > 0.001) {
      float eps = 0.004;
      vec2 dC;
      float dR, dM, dB;
      // Unnormalized compound SDF gradient vanishes smoothly to (0,0) at the saddle center of any liquid bridge!
      // Softly normalizing with +0.025 yields a 100% C-infinity, ZERO-SEAM 3D normal field across fused bubbles!
      vec2 rawGrad = vec2(
        sdMenuSoap(p + vec2(eps, 0.0), dC, dR, dM, dB) - sdMenuSoap(p - vec2(eps, 0.0), dC, dR, dM, dB),
        sdMenuSoap(p + vec2(0.0, eps), dC, dR, dM, dB) - sdMenuSoap(p - vec2(0.0, eps), dC, dR, dM, dB)
      ) / (2.0 * eps);
      float gradLen = length(rawGrad);
      vec2 gSmooth = rawGrad / sqrt(dot(rawGrad, rawGrad) + 0.025);

      float dIn = max(0.0, -sdBubble);
      float scaleSafe = max(0.018, mix(smoothR, max(0.036, smoothR * 0.62), bridgeF * 0.65));
      float rho = clamp(1.0 - dIn / scaleSafe, 0.0, 0.998);

      // Continuous normalized position inside smooth bubble center (smoothly fades inside bridge saddle)
      vec2 pNorm = (p - smoothC) / max(vec2(smoothR), vec2(0.04));

      // Sample live 2D Navier-Stokes fluid streaming continuously across all 5 bubbles!
      vec2 simUv = clamp(((p - vec2(0.0, 0.04)) / vec2(3.10, 1.05)) + 0.5, 0.004, 0.996);
      vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
      vec4 simC = texture(uSim, simUv);
      float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
      float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
      float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
      float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
      vec2 gradZ = vec2(zR - zL, zU - zD) * 5.6;

      // World-space continuous capillary swirl (ZERO per-bubble phase jump across fused necks!)
      vec2 swirlTilt = (0.032 + 0.042 * massMix + 0.050 * bridgeF) * vec2(
        sin(p.y * 14.0 + p.x * 3.2 + uTime * 2.5),
        cos(p.x * 11.0 - p.y * 4.5 - uTime * 2.2)
      );

      // At saddle center of a liquid neck, gradLen -> 0 naturally flattens the normal toward camera (0,0,1)!
      float saddleFlat = clamp(gradLen, 0.0, 1.0);
      float domeR = mix(rho, rho * saddleFlat, bridgeF * 0.72);
      float rimSteep = pow(clamp(domeR, 1e-4, 0.995), 1.06) * (0.88 + 0.14 * massMix + 0.06 * bridgeF);

      vec2 nXY = gSmooth * rimSteep + swirlTilt - gradZ;
      float nXY2 = dot(nXY, nXY);
      vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float NdotV = clamp(dot(N, V), 0.06, 1.0);
      float slopeMag = length(gradZ);

      float fres = pow(max(1e-4, 1.0 - NdotV), 2.22);
      float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.7);

      // Resolution-adaptive crisp optical rim contour along bubbles AND connecting necks!
      float rimOff = max(0.050, min(0.20, px * 1.25 / scaleSafe));
      float normDepth = clamp(dIn / scaleSafe, 0.0, 1.0);
      float ioArg = (normDepth - rimOff) / max(0.036, rimOff * 0.68);
      float innerOutline = exp(-(ioArg * ioArg));
      float hairOff = min(0.048, px * 0.52 / scaleSafe);
      float owArg = (normDepth - hairOff) / max(0.022, px * 0.55 / scaleSafe);
      float outerWhiteHair = exp(-(owArg * owArg));

      // World-space continuous thin-film thickness -> 100% seamless unbroken rainbow sheet across bridges!
      float flowWave = 0.5 + 0.5 * sin(p.x * 4.2 - p.y * 6.4 + simC.r * 3.5 + uTime * (0.85 + 1.8 * uTravelSpeed));
      float dNmBase = mix(145.0, 735.0, simC.r * 0.66 + flowWave * 0.34);
      float dNm = dNmBase + p.x * 105.0 + fres * 235.0 + bridgeF * 155.0 + massMix * 48.0;

      float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
      float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
      vec3 irid = bubbleIridescence(dNm, cosTheta);

      // Diamond starburst glint on the plump active bubble (fades cleanly off the bridge saddle)
      float starBoost = (0.18 + 0.90 * massMix) * (1.0 - smoothstep(0.10, 0.55, bridgeF));
      vec3 specInfo = bubbleSpeculars(N, NdotV, pNorm, uTime, starBoost);
      float specArc = specInfo.x;

      vec2 spGrid = (p + vec2(simC.r * 0.32, -simC.g * 0.25)) * 22.0;
      vec2 spCell = floor(spGrid);
      vec2 spF = fract(spGrid) - 0.5;
      float spRnd = hash21(spCell);
      float spDot = smoothstep(0.16, 0.02, length(spF)) * step(0.94 - (massMix * 0.02 + bridgeF * 0.025), spRnd)
                  * (0.45 + 0.55 * sin(uTime * 6.0 + spRnd * 40.0))
                  * (0.30 + 0.65 * fres + simC.b + bridgeF * 0.45);

      float chromaRich = 0.66 + 0.34 * max(massMix, bridgeF);
      vec3 contourCol = mix(vec3(0.38, 0.42, 0.68), irid * 0.65 + vec3(0.18, 0.16, 0.36), 0.52);
      vec3 domeColor = mix(vec3(0.94, 0.97, 1.0), irid * 0.94 + vec3(0.15, 0.18, 0.26), 0.88 * chromaRich);

      vec3 col = mix(vec3(0.97, 0.98, 1.0), domeColor, clamp(0.14 + fres * 0.80 + bridgeF * 0.34 + slopeMag * 0.42 + massMix * 0.14, 0.0, 1.0));
      col = mix(col, contourCol, clamp(innerOutline * (0.48 + 0.14 * massMix) + razorRim * 0.45 + bridgeF * 0.14, 0.0, 0.82));
      float crescentBand = smoothstep(0.08, 0.76, max(fres, bridgeF * 0.66)) * (1.0 - outerWhiteHair * 0.62);
      col = mix(col, clamp(irid * 1.14 + vec3(0.09, 0.07, 0.13), 0.0, 1.0), crescentBand * (0.56 + 0.18 * max(massMix, bridgeF)));

      float whiteGlow = clamp(specArc * 0.96 + outerWhiteHair * 0.86 + spDot * 0.90, 0.0, 0.99);
      col = mix(col, vec3(1.0, 0.998, 1.0), whiteGlow);

      // Crystal-clear hollow glass center so each monochrome menu icon shines sharply through!
      float iconClear = exp(-dot(pNorm, pNorm) * 2.2) * (1.0 - fres * 0.85) * (1.0 - bridgeF) * 0.065;
      float alpha = clamp(
        (0.075 - iconClear) + fres * (0.72 + 0.12 * massMix) + innerOutline * (0.46 + 0.12 * massMix)
        + outerWhiteHair * 0.74 + specArc * 0.88 + bridgeF * 0.24 + slopeMag * 0.28,
        0.0, 0.96
      );
      outCol = over(vec4(col * (alpha * orbMask), alpha * orbMask), outCol);
    }
  }

  // --- 3. DELICATE 3D WEBGL2 PINCH-OFF SATELLITE MICRO-BUBBLES ---
  for (int i = 0; i < MAX_DAUGHTERS; i++) {
    if (i >= uDaughterCount) break;
    vec4 posR = uDPos[i];
    if (posR.z <= 0.001 || posR.w <= 0.002) continue;
    vec4 db = evalDaughterBubble(p, posR, uDOpt[i], px);
    if (db.a > 0.001) outCol = over(db, outCol);
  }

  fragColor = outCol;
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function createProgram(gl) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

const DEFAULT_ITEMS = [
  { id: 'home',    label: 'Home' },
  { id: 'search',  label: 'Search' },
  { id: 'inbox',   label: 'Inbox' },
  { id: 'saved',   label: 'Saved' },
  { id: 'profile', label: 'Profile' },
];

class SoapBubbleMenu {
  constructor(container, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;
    this.audio = opts.audio || null;
    this.items = opts.items || DEFAULT_ITEMS;
    this.count = 5;
    this.onSelect = opts.onSelect || (() => {});

    // Responsive sizing scaled cleanly to stage width
    const scale = Math.min(1.0, (this.width - 28) / 512);
    this.spacingCss = 98 * scale;
    this.rIdleCss = 27.5 * scale;
    this.rActiveCss = 43.5 * scale;
    this.baseYCss = this.height * 0.475;
    this.labelYCss = this.baseYCss + this.rActiveCss + 24 * scale;
    this.iconScaleBase = scale;

    this.baseXCss = [];
    for (let i = 0; i < this.count; i++) {
      this.baseXCss.push(this.width * 0.5 + (i - 2) * this.spacingCss);
    }

    this.wrap = document.createElement('div');
    this.wrap.style.cssText = `position:relative;width:${this.width}px;height:${this.height}px;user-select:none;-webkit-user-select:none;touch-action:none;`;
    container.appendChild(this.wrap);

    this.underCanvas = document.createElement('canvas');
    this.underCanvas.width = this.width * this.dpr;
    this.underCanvas.height = this.height * this.dpr;
    this.underCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.wrap.appendChild(this.underCanvas);
    this.underCtx = this.underCanvas.getContext('2d');

    this.glCanvas = document.createElement('canvas');
    this.glCanvas.width = this.width * this.dpr;
    this.glCanvas.height = this.height * this.dpr;
    this.glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.wrap.appendChild(this.glCanvas);

    this._initGL();

    // 2D Navier-Stokes fluid grid (80x36 matching horizontal menu aspect!)
    this.nx = 80;
    this.ny = 36;
    const N = this.nx * this.ny;
    this.thick = new Float32Array(N);
    this.thickTmp = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vy = new Float32Array(N);
    this.vxTmp = new Float32Array(N);
    this.vyTmp = new Float32Array(N);
    this.div = new Float32Array(N);
    this.press = new Float32Array(N);
    this.pressTmp = new Float32Array(N);
    this.curl = new Float32Array(N);
    this.z = new Float32Array(N);
    this.zPrev = new Float32Array(N);
    this.zTmp = new Float32Array(N);
    this.shimmer = new Float32Array(N);
    this.texData = new Uint8Array(N * 4);

    this.maxDaughters = 10;
    this.bubPosBuf = new Float32Array(this.count * 4);
    this.bubMetaBuf = new Float32Array(this.count * 4);
    this.dPosBuf = new Float32Array(this.maxDaughters * 4);
    this.dOptBuf = new Float32Array(this.maxDaughters * 4);

    this.reset(opts.initialIndex ?? 0);
  }

  _toNdcX(cx) { return (cx / this.width * 2 - 1) * this.aspect; }
  _toNdcY(cy) { return 1 - (cy / this.height * 2); }
  _pxToNdc(px) { return px * (2 / this.height); }

  _initGL() {
    const gl = this.glCanvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.prog = createProgram(gl);
    this.vao = gl.createVertexArray();

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const names = [
      'uSim', 'uRes', 'uSize', 'uTime',
      'uBridgeK', 'uPulse', 'uTravelSpeed', 'uDaughterCount',
    ];
    this.u = {};
    for (const n of names) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.u.uBubbles = gl.getUniformLocation(this.prog, 'uBubbles') || gl.getUniformLocation(this.prog, 'uBubbles[0]');
    this.u.uBubMeta = gl.getUniformLocation(this.prog, 'uBubMeta') || gl.getUniformLocation(this.prog, 'uBubMeta[0]');
    this.u.uDPos = gl.getUniformLocation(this.prog, 'uDPos') || gl.getUniformLocation(this.prog, 'uDPos[0]');
    this.u.uDOpt = gl.getUniformLocation(this.prog, 'uDOpt') || gl.getUniformLocation(this.prog, 'uDOpt[0]');
  }

  reset(initialIdx = 0) {
    this.time = 1.0;
    this.selected = Math.max(0, Math.min(this.count - 1, initialIdx));
    this.hovered = -1;

    // Traveling mass-packet transport state
    this.pulseIdx = this.selected;
    this.startIdx = this.selected;
    this.targetIdx = this.selected;
    this.transferring = false;
    this.moveT = 0;
    this.moveDur = 0.56;
    this.travelDir = 0;
    this.travelSpeed = 0;
    this.lastPassedIdx = this.selected;

    // Per-bubble spring physics (position, radius, damped capillary wobble)
    const dNmSeeds = [0, 75, 165, 250, 330];
    this.bubbles = [];
    for (let i = 0; i < this.count; i++) {
      const isSel = i === this.selected;
      this.bubbles.push({
        xCss: this.baseXCss[i],
        xVel: 0,
        yCss: this.baseYCss - (isSel ? 3.5 : 0),
        yVel: 0,
        rCss: isSel ? this.rActiveCss : this.rIdleCss,
        rVel: 0,
        massFrac: isSel ? 1.0 : 0.0,
        wobAmp: 0,
        wobPhase: i * 1.3,
        wobFreq: 13.5 + i * 0.7,
        stretchX: 0,
        dNmOff: dNmSeeds[i],
      });
    }

    // Smooth-min liquid bridge strength per adjacent pair (0-1, 1-2, 2-3, 3-4)
    this.bridgeK = [0, 0, 0, 0];
    this.prevBridgeK = [0, 0, 0, 0];
    this.floatBubbles = [];

    this._seedFilm();
  }

  bubbleCenterStagePos(idx) {
    const i = Math.max(0, Math.min(this.count - 1, idx));
    return { x: this.baseXCss[i], y: this.baseYCss };
  }

  hitTest(sx, sy) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.count; i++) {
      const b = this.bubbles[i];
      const d = Math.hypot(sx - b.xCss, sy - b.yCss);
      if (d <= Math.max(b.rCss + 8, this.rIdleCss + 12) && d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    return best;
  }

  setHovered(idx) {
    if (idx !== this.hovered) {
      this.hovered = idx;
      if (idx >= 0 && idx !== this.selected) {
        this.bubbles[idx].wobAmp = Math.max(this.bubbles[idx].wobAmp, 0.055);
      }
    }
  }

  select(idx) {
    const clamped = Math.max(0, Math.min(this.count - 1, idx));
    this.audio?.unlock();

    if (clamped === this.targetIdx && !this.transferring) {
      // Gentle playful jelly squish if clicking the already-selected bubble
      this.bubbles[clamped].wobAmp = 0.14;
      this.bubbles[clamped].rVel += 55;
      this.audio?.playTap(720);
      return;
    }

    this.selected = clamped;
    this.startIdx = this.pulseIdx;
    this.targetIdx = clamped;
    this.moveT = 0;
    const hops = Math.max(0.25, Math.abs(this.targetIdx - this.startIdx));
    // Smooth scaling: 1 hop = 0.58s, 2 hops = 0.85s, 3 hops = 1.12s, 4 hops = 1.38s
    this.moveDur = 0.58 + 0.27 * Math.max(0, hops - 1);
    this.travelDir = Math.sign(this.targetIdx - this.startIdx) || 1;
    this.transferring = true;
    this.lastPassedIdx = Math.round(this.pulseIdx);

    // Tactile launch pulse on departure bubble
    const dep = Math.round(this.pulseIdx);
    if (this.bubbles[dep]) {
      this.bubbles[dep].wobAmp = Math.max(this.bubbles[dep].wobAmp, 0.10);
    }
    this.audio?.playTap(660);
    this.onSelect(clamped, this.items[clamped]);
  }

  _spawnPinchDroplets(pairIdx, dir) {
    // 1-2 microscopic 3D satellite droplets born right where the liquid neck snaps free!
    const midX = this._toNdcX(0.5 * (this.baseXCss[pairIdx] + this.baseXCss[pairIdx + 1]));
    const midY = this._toNdcY(this.baseYCss);
    const n = 2;
    for (let i = 0; i < n; i++) {
      if (this.floatBubbles.length >= this.maxDaughters) this.floatBubbles.shift();
      const sideY = i === 0 ? 1 : -1;
      this.floatBubbles.push({
        x: midX - dir * 0.03 + (Math.random() - 0.5) * 0.025,
        y: midY + sideY * (0.045 + Math.random() * 0.03) + 0.04,
        vx: -dir * (0.05 + Math.random() * 0.09) + (Math.random() - 0.5) * 0.06,
        vy: 0.24 + Math.random() * 0.14,
        r: i === 0 ? (0.021 + Math.random() * 0.007) : (0.012 + Math.random() * 0.006),
        dNm: 220 + Math.random() * 280,
        wobAmp: 0.22,
        wobPhase: Math.random() * Math.PI * 2,
        wobFreq: 17.0 + Math.random() * 6.0,
        driftPhase: Math.random() * Math.PI * 2,
        driftAmp: 0.035,
        buoyancy: 0.14,
        drag: 2.5,
        age: 0,
        life: 1.0,
        decay: 1.25 + Math.random() * 0.45,
      });
    }
  }

  _seedFilm() {
    const { nx, ny } = this;
    const ph = 0.85;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const u = i / (nx - 1);
        const idx = j * nx + i;
        const wave = 0.24 * Math.sin(u * 7.5 + ph) * Math.sin(v * Math.PI)
                   + 0.16 * Math.cos(u * 4.2 - v * 3.1 + ph * 0.7);
        this.thick[idx] = Math.max(0.08, Math.min(0.92, 0.22 + (1.0 - v) * 0.44 + wave));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        this.vx[idx] = Math.sin(v * Math.PI * 2 + ph) * 0.45;
        this.vy[idx] = Math.cos(u * Math.PI * 3 - ph) * 0.35;
      }
    }
    this._injectVortex(-0.5, 0.05, 0.35, 2.2);
    this._injectVortex(0.0, -0.05, 0.35, -2.2);
    this._injectVortex(0.5, 0.05, 0.35, 2.2);
    for (let s = 0; s < 12; s++) this._stepFluid(0.025);
  }

  _injectTravelJet(ndcX, strength) {
    // Injects a horizontal rainbow Marangoni flow jet right at the moving transfer bolus!
    const { nx, ny, vx, vy, thick, shimmer } = this;
    const uCenter = (ndcX / 3.10) + 0.5;
    const gx = uCenter * (nx - 1);
    const gy = 0.5 * (ny - 1);
    const rx = nx * 0.14;
    const ry = ny * 0.34;
    const i0 = Math.max(1, Math.floor(gx - rx * 2));
    const i1 = Math.min(nx - 2, Math.ceil(gx + rx * 2));
    const j0 = Math.max(1, Math.floor(gy - ry * 2));
    const j1 = Math.min(ny - 2, Math.ceil(gy + ry * 2));
    for (let j = j0; j <= j1; j++) {
      const dy = (j - gy) / ry;
      for (let i = i0; i <= i1; i++) {
        const dx = (i - gx) / rx;
        const w = Math.exp(-(dx * dx + dy * dy) * 1.8);
        if (w < 0.02) continue;
        const idx = j * nx + i;
        vx[idx] += strength * w;
        vy[idx] += Math.sin(dx * 3.5 + this.time * 5.0) * Math.abs(strength) * 0.32 * w;
        const freshD = 0.28 + 0.38 * Math.sin(dy * 3.2 + this.time * 4.2);
        thick[idx] += (freshD - thick[idx]) * Math.min(0.18, w * 0.12);
        shimmer[idx] = Math.min(1, shimmer[idx] + w * 0.06);
      }
    }
  }

  _injectVortex(lx, ly, radiusLocal, strength) {
    const gx = (lx * 0.5 + 0.5) * (this.nx - 1);
    const gy = (ly * 0.5 + 0.5) * (this.ny - 1);
    const rx = radiusLocal * 0.35 * this.nx;
    const ry = radiusLocal * 0.5 * this.ny;
    const i0 = Math.max(1, Math.floor(gx - rx * 1.8));
    const i1 = Math.min(this.nx - 2, Math.ceil(gx + rx * 1.8));
    const j0 = Math.max(1, Math.floor(gy - ry * 1.8));
    const j1 = Math.min(this.ny - 2, Math.ceil(gy + ry * 1.8));
    for (let j = j0; j <= j1; j++) {
      const dy = (j - gy) / Math.max(1, ry);
      for (let i = i0; i <= i1; i++) {
        const dx = (i - gx) / Math.max(1, rx);
        const w = Math.exp(-(dx * dx + dy * dy) * 2.4) * strength;
        const idx = j * this.nx + i;
        this.vx[idx] += -dy * w;
        this.vy[idx] += dx * w;
      }
    }
  }

  _impulseZ(ndcX, amp, radiusNdc) {
    const gx = ((ndcX / 3.10) + 0.5) * (this.nx - 1);
    const gy = 0.5 * (this.ny - 1);
    const rx = (radiusNdc / 3.10) * this.nx;
    const ry = (radiusNdc / 1.05) * this.ny;
    const i0 = Math.max(1, Math.floor(gx - rx * 2));
    const i1 = Math.min(this.nx - 2, Math.ceil(gx + rx * 2));
    const j0 = Math.max(1, Math.floor(gy - ry * 2));
    const j1 = Math.min(this.ny - 2, Math.ceil(gy + ry * 2));
    for (let j = j0; j <= j1; j++) {
      const dy = (j - gy) / Math.max(1, ry);
      for (let i = i0; i <= i1; i++) {
        const dx = (i - gx) / Math.max(1, rx);
        const w = Math.exp(-(dx * dx + dy * dy) * 2.2);
        const idx = j * this.nx + i;
        this.z[idx] += amp * w;
        this.shimmer[idx] = Math.min(1, this.shimmer[idx] + Math.abs(amp) * w * 1.15);
      }
    }
  }

  _stepFluid(h) {
    const { nx, ny, vx, vy, vxTmp, vyTmp, div, press, pressTmp, curl, thick, thickTmp } = this;
    const advScale = h * 8.2;

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        curl[idx] = 0.5 * ((vy[idx + 1] - vy[idx - 1]) - (vx[idx + nx] - vx[idx - nx]));
      }
    }
    const vortAmp = 1.8 * h;
    for (let j = 2; j < ny - 2; j++) {
      const row = j * nx;
      for (let i = 2; i < nx - 2; i++) {
        const idx = row + i;
        const dwDx = Math.abs(curl[idx + 1]) - Math.abs(curl[idx - 1]);
        const dwDy = Math.abs(curl[idx + nx]) - Math.abs(curl[idx - nx]);
        const len = Math.hypot(dwDx, dwDy) + 1e-5;
        vx[idx] += (dwDy / len) * curl[idx] * vortAmp;
        vy[idx] -= (dwDx / len) * curl[idx] * vortAmp;
      }
    }

    const damp = Math.exp(-1.1 * h);
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        let x = Math.max(0.5, Math.min(nx - 1.501, i - vx[idx] * advScale));
        let y = Math.max(0.5, Math.min(ny - 1.501, j - vy[idx] * advScale));
        const i0 = x | 0, j0 = y | 0;
        const fx = x - i0, fy = y - j0;
        const r0 = j0 * nx + i0, r1 = r0 + nx;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        vxTmp[idx] = (vx[r0] * w00 + vx[r0 + 1] * w10 + vx[r1] * w01 + vx[r1 + 1] * w11) * damp;
        vyTmp[idx] = (vy[r0] * w00 + vy[r0 + 1] * w10 + vy[r1] * w01 + vy[r1 + 1] * w11) * damp;
      }
    }
    vx.set(vxTmp);
    vy.set(vyTmp);

    for (let i = 0; i < nx; i++) {
      vx[i] = 0; vy[i] = 0;
      const top = (ny - 1) * nx + i;
      vx[top] = 0; vy[top] = 0;
    }
    for (let j = 0; j < ny; j++) {
      const L = j * nx;
      vx[L] = 0; vy[L] = 0;
      vx[L + nx - 1] = 0; vy[L + nx - 1] = 0;
    }

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        div[idx] = -0.5 * (vx[idx + 1] - vx[idx - 1] + vy[idx + nx] - vy[idx - nx]);
        press[idx] *= 0.85;
      }
    }
    for (let iter = 0; iter < 5; iter++) {
      for (let j = 1; j < ny - 1; j++) {
        const row = j * nx;
        for (let i = 1; i < nx - 1; i++) {
          const idx = row + i;
          pressTmp[idx] = 0.25 * (div[idx] + press[idx - 1] + press[idx + 1] + press[idx - nx] + press[idx + nx]);
        }
      }
      press.set(pressTmp);
    }
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        vx[idx] -= 0.5 * (press[idx + 1] - press[idx - 1]);
        vy[idx] -= 0.5 * (press[idx + nx] - press[idx - nx]);
      }
    }

    const drain = 0.14 * h;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        let x = Math.max(0.001, Math.min(nx - 1.002, i - vx[idx] * advScale));
        let y = Math.max(0.001, Math.min(ny - 1.002, j - vy[idx] * advScale));
        const i0 = x | 0, j0 = y | 0;
        const fx = x - i0, fy = y - j0;
        const r0 = j0 * nx + i0, r1 = r0 + nx;
        let val =
          thick[r0] * (1 - fx) * (1 - fy) +
          thick[r0 + 1] * fx * (1 - fy) +
          thick[r1] * (1 - fx) * fy +
          thick[r1 + 1] * fx * fy;
        const strat = 0.22 + (1.0 - v) * 0.44;
        val += (strat - val) * drain;
        thickTmp[idx] = Math.max(0.05, Math.min(0.95, val));
      }
    }
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        const avg = 0.25 * (thickTmp[idx - 1] + thickTmp[idx + 1] + thickTmp[idx - nx] + thickTmp[idx + nx]);
        thick[idx] = thickTmp[idx] + (avg - thickTmp[idx]) * 0.12;
      }
    }
    for (let i = 0; i < nx; i++) {
      thick[i] = thickTmp[i];
      thick[(ny - 1) * nx + i] = thickTmp[(ny - 1) * nx + i];
    }
    for (let j = 0; j < ny; j++) {
      thick[j * nx] = thickTmp[j * nx];
      thick[j * nx + nx - 1] = thickTmp[j * nx + nx - 1];
    }
  }

  step(dt) {
    const h = Math.min(dt, 0.033);
    this.time += h;

    // 1. Advance traveling mass packet (pulseIdx) smoothly across bubbles
    if (this.transferring) {
      this.moveT += h;
      const u = Math.min(1.0, this.moveT / this.moveDur);
      // Smooth quadratic ease-in-out -> silky steady cruise speed across intermediate bubbles!
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) * 0.5;
      const deriv = u < 0.5 ? 4 * u : 4 * (1 - u);
      this.pulseIdx = this.startIdx + (this.targetIdx - this.startIdx) * e;
      const dist = Math.abs(this.targetIdx - this.startIdx);
      this.travelSpeed = Math.min(1.2, (dist * deriv / this.moveDur) * 0.34);

      // Fire soft passing-bubble foley & ripple whenever the big bubble crests an intermediate item
      const nearest = Math.round(this.pulseIdx);
      if (nearest !== this.lastPassedIdx && nearest !== this.targetIdx && Math.abs(this.pulseIdx - nearest) < 0.18) {
        this.lastPassedIdx = nearest;
        this.bubbles[nearest].wobAmp = Math.max(this.bubbles[nearest].wobAmp, 0.080);
        this.audio?.playPassBubble(Math.abs(nearest - Math.round(this.startIdx)));
      }

      // Inject horizontal Marangoni rainbow jet surfing along with the moving mass!
      const pXCss = this.baseXCss[0] + this.pulseIdx * this.spacingCss;
      this._injectTravelJet(this._toNdcX(pXCss), this.travelDir * (2.6 + this.travelSpeed * 2.2) * h * 18);

      if (u >= 1.0) {
        this.pulseIdx = this.targetIdx;
        this.transferring = false;
        this.travelSpeed = 0;
        const dst = this.bubbles[this.targetIdx];
        dst.wobAmp = Math.max(dst.wobAmp, 0.125);
        dst.rVel += 58; // juicy arrival overshoot inflation bounce without hitting neighbors!
        this._impulseZ(this._toNdcX(this.baseXCss[this.targetIdx]), 0.30, 0.32);
        this.audio?.playArriveBubble();
      }
    } else {
      this.travelSpeed *= Math.exp(-8.0 * h);
      // Gentle living ambient shimmer inside the active bubble
      const activeNdcX = this._toNdcX(this.baseXCss[this.selected]);
      const lx = (activeNdcX / 1.55);
      this._injectVortex(lx, Math.sin(this.time * 1.4) * 0.15, 0.36, 0.42 * h * 14);
    }

    // 2. Exact conservation-of-mass distribution across all 5 bubbles!
    const rawW = new Float32Array(this.count);
    let wSum = 0;
    for (let i = 0; i < this.count; i++) {
      const dist = Math.abs(i - this.pulseIdx);
      const q = Math.max(0, 1.0 - dist / 1.04);
      const w = q * q * (3.0 - 2.0 * q);
      rawW[i] = w;
      wSum += w;
    }

    const rIdle2 = this.rIdleCss * this.rIdleCss;
    const excessArea = this.rActiveCss * this.rActiveCss - rIdle2;

    // 3. Pairwise catenoid liquid bridges ONLY along pairs the traveling mass is crossing!
    for (let k = 0; k < 4; k++) {
      this.prevBridgeK[k] = this.bridgeK[k];
      let targetK = 0;
      if (this.transferring) {
        const mid = k + 0.5;
        const dMid = Math.abs(this.pulseIdx - mid);
        const lo = Math.min(this.startIdx, this.targetIdx) - 0.15;
        const hi = Math.max(this.startIdx, this.targetIdx) + 0.15;
        if (mid >= lo && mid <= hi && dMid < 0.62) {
          const q = 1.0 - dMid / 0.62;
          const bell = q * q * (3.0 - 2.0 * q);
          targetK = 0.215 * bell;
        }
      }
      // Fast responsive liquid connection on rise, crisp snapping pinch-off on fall
      const rate = targetK > this.bridgeK[k] ? 24.0 : 21.0;
      this.bridgeK[k] += (targetK - this.bridgeK[k]) * Math.min(1, h * rate);
      if (this.bridgeK[k] < 0.0015 && targetK === 0) this.bridgeK[k] = 0;

      // Detect exact bridge pinch-off transition -> launch juicy capillary jelly recoil + tiny satellite droplets!
      if (this.prevBridgeK[k] >= 0.044 && this.bridgeK[k] < 0.044 && targetK < this.bridgeK[k]) {
        this.bubbles[k].wobAmp = Math.max(this.bubbles[k].wobAmp, 0.105);
        this.bubbles[k + 1].wobAmp = Math.max(this.bubbles[k + 1].wobAmp, 0.115);
        this._spawnPinchDroplets(k, this.travelDir || 1);
      }
    }

    // 4. Update each bubble's spring radius, lateral bridge tug, buoyant lift & capillary wobble
    for (let i = 0; i < this.count; i++) {
      const b = this.bubbles[i];
      const frac = wSum > 1e-4 ? rawW[i] / wSum : (i === this.selected ? 1.0 : 0.0);
      b.massFrac = frac;

      // Exact area-conserving target radius + subtle hover curiosity swell
      const hoverBoost = (!this.transferring && i === this.hovered && i !== this.selected) ? 2.4 : 0;
      const targetR = Math.sqrt(rIdle2 + excessArea * frac) + hoverBoost;

      // Lateral magnetic reach toward any active connecting bridge!
      let tugX = 0;
      if (i < 4 && this.bridgeK[i] > 0.004) tugX += (this.bridgeK[i] / 0.215) * 9.5;
      if (i > 0 && this.bridgeK[i - 1] > 0.004) tugX -= (this.bridgeK[i - 1] / 0.215) * 9.5;
      if (!this.transferring && i === this.hovered && i !== this.selected) {
        tugX += Math.sign(this.selected - i) * 2.2;
      }

      const targetX = this.baseXCss[i] + tugX;
      // Plumper bubbles float buoyantly slightly higher + gentle serene idle breathing bob
      const idleBob = Math.sin(this.time * 2.1 + i * 1.15) * (1.2 + frac * 1.0);
      const hoverLift = (i === this.hovered && i !== this.selected) ? -2.2 : 0;
      const targetY = this.baseYCss - frac * 4.2 + hoverLift + idleBob;

      b.rVel += ((targetR - b.rCss) * 235 - b.rVel * 17.5) * h;
      b.rCss = Math.max(14, b.rCss + b.rVel * h);

      b.xVel += ((targetX - b.xCss) * 220 - b.xVel * 18.0) * h;
      b.xCss += b.xVel * h;

      b.yVel += ((targetY - b.yCss) * 165 - b.yVel * 14.5) * h;
      b.yCss += b.yVel * h;

      const targetStretch = Math.max(-1, Math.min(1, tugX / 9.0));
      b.stretchX += (targetStretch - b.stretchX) * Math.min(1, h * 16);

      b.wobPhase += b.wobFreq * h;
      b.wobAmp *= Math.exp(-4.2 * h);
    }

    // 5. Update fluid & wave heightfield texture
    this._stepFluid(h);
    const { nx, ny, z, zPrev, zTmp, shimmer } = this;
    const c2 = 0.22;
    const dampZ = 0.945;
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        const lap = z[idx - 1] + z[idx + 1] + z[idx - nx] + z[idx + nx] - 4.0 * z[idx];
        zTmp[idx] = Math.max(-1.0, Math.min(1.0, (2.0 * z[idx] - zPrev[idx] + c2 * lap) * dampZ * 0.988));
        shimmer[idx] *= Math.exp(-2.8 * h);
      }
    }
    zPrev.set(z);
    z.set(zTmp);

    const data = this.texData;
    for (let k = 0; k < nx * ny; k++) {
      const p4 = k * 4;
      data[p4] = Math.max(0, Math.min(255, (this.thick[k] * 255) | 0));
      data[p4 + 1] = Math.max(0, Math.min(255, ((z[k] * 0.5 + 0.5) * 255) | 0));
      data[p4 + 2] = Math.max(0, Math.min(255, (shimmer[k] * 255) | 0));
      data[p4 + 3] = 255;
    }

    // 6. Pinch-off satellite micro-bubbles
    for (let i = this.floatBubbles.length - 1; i >= 0; i--) {
      const b = this.floatBubbles[i];
      b.age += h;
      const df = Math.exp(-b.drag * h);
      b.vx *= df;
      b.vy = b.vy * df + b.buoyancy * h;
      b.x += (b.vx + Math.sin(this.time * 2.6 + b.driftPhase) * b.driftAmp) * h;
      b.y += b.vy * h;
      b.wobPhase += b.wobFreq * h;
      b.wobAmp *= Math.exp(-3.0 * h);
      b.life -= b.decay * h;
      if (b.life <= 0) this.floatBubbles.splice(i, 1);
    }
  }

  _drawIcon(ctx, id, cx, cy, sz, strokeCol, lineW) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = strokeCol;
    ctx.fillStyle = strokeCol;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const s = sz * 0.5;

    if (id === 'home') {
      ctx.beginPath();
      ctx.moveTo(-s * 0.92, -s * 0.08);
      ctx.lineTo(0, -s * 0.90);
      ctx.lineTo(s * 0.92, -s * 0.08);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-s * 0.66, -s * 0.18);
      ctx.lineTo(-s * 0.66, s * 0.72);
      ctx.quadraticCurveTo(-s * 0.66, s * 0.86, -s * 0.50, s * 0.86);
      ctx.lineTo(s * 0.50, s * 0.86);
      ctx.quadraticCurveTo(s * 0.66, s * 0.86, s * 0.66, s * 0.72);
      ctx.lineTo(s * 0.66, -s * 0.18);
      ctx.stroke();
    } else if (id === 'search') {
      ctx.beginPath();
      ctx.arc(-s * 0.14, -s * 0.14, s * 0.64, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.34, s * 0.34);
      ctx.lineTo(s * 0.84, s * 0.84);
      ctx.stroke();
    } else if (id === 'inbox') {
      // Crisp open inbox tray icon
      const w = s * 0.84, h = s * 0.74, r = s * 0.22;
      ctx.beginPath();
      ctx.moveTo(-w + r, -h);
      ctx.lineTo(w - r, -h);
      ctx.quadraticCurveTo(w, -h, w, -h + r);
      ctx.lineTo(w, h - r);
      ctx.quadraticCurveTo(w, h, w - r, h);
      ctx.lineTo(-w + r, h);
      ctx.quadraticCurveTo(-w, h, -w, h - r);
      ctx.lineTo(-w, -h + r);
      ctx.quadraticCurveTo(-w, -h, -w + r, -h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-w, s * 0.10);
      ctx.lineTo(-s * 0.34, s * 0.10);
      ctx.lineTo(-s * 0.20, s * 0.34);
      ctx.lineTo(s * 0.20, s * 0.34);
      ctx.lineTo(s * 0.34, s * 0.10);
      ctx.lineTo(w, s * 0.10);
      ctx.stroke();
    } else if (id === 'saved') {
      // Crisp bookmark ribbon icon
      ctx.beginPath();
      ctx.moveTo(-s * 0.58, -s * 0.84);
      ctx.lineTo(s * 0.58, -s * 0.84);
      ctx.quadraticCurveTo(s * 0.68, -s * 0.84, s * 0.68, -s * 0.72);
      ctx.lineTo(s * 0.68, s * 0.84);
      ctx.lineTo(0, s * 0.38);
      ctx.lineTo(-s * 0.68, s * 0.84);
      ctx.lineTo(-s * 0.68, -s * 0.72);
      ctx.quadraticCurveTo(-s * 0.68, -s * 0.84, -s * 0.58, -s * 0.84);
      ctx.closePath();
      ctx.stroke();
    } else if (id === 'profile') {
      ctx.beginPath();
      ctx.arc(0, -s * 0.34, s * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s * 0.92, s * 0.74, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawUnderIcons() {
    const ctx = this.underCtx;
    const dpr = this.dpr;
    const W = this.underCanvas.width;
    const H = this.underCanvas.height;
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < this.count; i++) {
      const b = this.bubbles[i];
      const item = this.items[i];
      const m = Math.max(0, Math.min(1, (b.rCss - this.rIdleCss) / Math.max(1, this.rActiveCss - this.rIdleCss)));
      const isHov = i === this.hovered;

      // Icon scales organically with the bubble's live inflated radius!
      const iconSz = (18.5 + m * 5.2) * this.iconScaleBase * dpr;
      const lineW = (1.75 + m * 0.35) * this.iconScaleBase * dpr;
      const inkAlpha = 0.52 + m * 0.40 + (isHov ? 0.14 : 0);
      const strokeCol = `rgba(22, 24, 38, ${Math.min(0.95, inkAlpha)})`;

      this._drawIcon(ctx, item.id, b.xCss * dpr, b.yCss * dpr, iconSz, strokeCol, lineW);

      // Subtle minimal label neatly anchored beneath each bubble
      const labelAlpha = 0.42 + m * 0.50 + (isHov ? 0.16 : 0);
      const fontWeight = m > 0.5 ? 600 : 500;
      ctx.font = `${fontWeight} ${11.5 * this.iconScaleBase * dpr}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(24, 26, 40, ${Math.min(0.94, labelAlpha)})`;
      ctx.fillText(item.label, this.baseXCss[i] * dpr, (this.labelYCss - m * 1.5) * dpr);
    }
  }

  render() {
    this._drawUnderIcons();

    const { gl, u } = this;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.texData);

    for (let i = 0; i < this.count; i++) {
      const b = this.bubbles[i];
      const o = i * 4;
      this.bubPosBuf[o]     = this._toNdcX(b.xCss);
      this.bubPosBuf[o + 1] = this._toNdcY(b.yCss);
      this.bubPosBuf[o + 2] = this._pxToNdc(b.rCss);
      this.bubPosBuf[o + 3] = b.wobAmp;

      this.bubMetaBuf[o]     = b.wobPhase;
      this.bubMetaBuf[o + 1] = b.massFrac;
      this.bubMetaBuf[o + 2] = b.stretchX;
      this.bubMetaBuf[o + 3] = b.dNmOff;
    }

    // Traveling liquid transfer bolus right inside the active gap
    const pulseXCss = this.baseXCss[0] + this.pulseIdx * this.spacingCss;
    const fracBetween = Math.abs(this.pulseIdx - Math.round(this.pulseIdx)); // 0 at bubble center, 0.5 at exact midpoint!
    const midBoost = Math.sin(Math.min(0.5, fracBetween) * Math.PI * 2); // 0 -> 1 -> 0 across each gap
    const maxBridge = Math.max(this.bridgeK[0], this.bridgeK[1], this.bridgeK[2], this.bridgeK[3]);
    const pulseAlpha = this.transferring ? Math.min(1.0, maxBridge * 8.0) : 0.0;
    const pulseR = this._pxToNdc(21.5 * this.iconScaleBase * (0.55 + 0.45 * midBoost));

    gl.uniform1i(u.uSim, 0);
    gl.uniform2f(u.uRes, this.glCanvas.width, this.glCanvas.height);
    gl.uniform2f(u.uSize, this.width, this.height);
    gl.uniform1f(u.uTime, this.time);

    gl.uniform4fv(u.uBubbles, this.bubPosBuf);
    gl.uniform4fv(u.uBubMeta, this.bubMetaBuf);
    gl.uniform4f(u.uBridgeK, this.bridgeK[0], this.bridgeK[1], this.bridgeK[2], this.bridgeK[3]);
    gl.uniform4f(u.uPulse, this._toNdcX(pulseXCss), this._toNdcY(this.baseYCss - 2.0), pulseR, pulseAlpha);
    gl.uniform1f(u.uTravelSpeed, this.travelSpeed);

    // Upload delicate pinch-off satellite droplets
    this.dPosBuf.fill(0);
    this.dOptBuf.fill(0);
    const nD = Math.min(this.maxDaughters, this.floatBubbles.length);
    for (let i = 0; i < nD; i++) {
      const b = this.floatBubbles[i];
      const birthScale = Math.min(1.0, b.age / 0.05);
      const fadeA = Math.min(1.0, b.life * 3.5) * birthScale;
      const o = i * 4;
      this.dPosBuf[o] = b.x;
      this.dPosBuf[o + 1] = b.y;
      this.dPosBuf[o + 2] = b.r * (0.65 + 0.35 * birthScale);
      this.dPosBuf[o + 3] = fadeA;
      this.dOptBuf[o] = b.dNm;
      this.dOptBuf[o + 1] = b.wobAmp;
      this.dOptBuf[o + 2] = b.wobPhase;
      this.dOptBuf[o + 3] = b.age;
    }
    gl.uniform1i(u.uDaughterCount, nD);
    if (u.uDPos) gl.uniform4fv(u.uDPos, this.dPosBuf);
    if (u.uDOpt) gl.uniform4fv(u.uDOpt, this.dOptBuf);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
// <<< engine
// >>> element (src/elements/menu.js)
// <soap-menu>: a bar of five bubbles where the chosen one is bigger. Pick another and a soap bridge joins them and
// the size flows across, through any bubbles in between, so the big bubble seems to travel.
const SOAP_MENU_ICONS = ['home', 'search', 'inbox', 'saved', 'profile'];
class SoapMenu extends SoapFilm.Base {
  static formAssociated = true;
  static touch = 'manipulation';
  static size = (w) => Math.min(380, Math.max(210, w * 0.56));
  constructor() { super(); this.internals = this.attachInternals?.(); }
  get form() { return this.internals?.form; }
  get name() { return this.getAttribute('name'); }
  list() {
    const o = this.options();
    const items = (o.length ? o : SOAP_MENU_ICONS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), o: null }))).slice(0, 5);
    return items.map((it, i) => ({ id: SOAP_MENU_ICONS.includes(it.o?.dataset.icon) ? it.o.dataset.icon : SOAP_MENU_ICONS.includes(it.value) ? it.value : SOAP_MENU_ICONS[i], label: it.label, value: it.value }));
  }
  get selectedIndex() { return this.engine ? this.engine.selected : this.start(); }
  set selectedIndex(i) { this.pick(+i); }
  get value() { return this.items[this.selectedIndex]?.value; }
  set value(v) { const i = this.items.findIndex((it) => it.value === v); if (i >= 0) this.pick(i); }
  start() { const o = this.options(), s = o.findIndex((x) => x.o.selected && x.o.hasAttribute('selected')); return Math.max(0, Math.min(4, s)); }
  overlay() {
    this.items = this.list();
    return `<div class="sr" role="radiogroup" part="group">${this.items.map((it, i) => `<input type="radio" name="m" tabindex="-1" aria-label="${SoapFilm.esc(it.label)}" data-i="${i}">`).join('')}</div>`;
  }
  create(mount, o) {
    return new SoapBubbleMenu(mount, {
      ...o, items: this.items, initialIndex: this.keep ?? this.start(),
      onSelect: (i) => { this.sync(i); this.emit('change'); },
    });
  }
  sync(i) {
    this.radios.forEach((r, k) => { r.checked = k === i; r.tabIndex = k === i ? 0 : -1; });
    this.internals?.setFormValue(this.items[i]?.value ?? null);
  }
  focusTarget() { return this.radios?.find((r) => r.checked); }
  pick(i) { if (this.engine && i >= 0 && i < 5 && i !== this.engine.selected) this.engine.select(i); }
  build(w) { this.keep = this.engine?.selected; super.build(w); this.keep = undefined; }
  wire() {
    const box = this.box;
    this.group = this.$('[role=radiogroup]');
    this.group.setAttribute('aria-label', this.attr('label', 'Menu'));
    this.radios = [...this.shadowRoot.querySelectorAll('input[type=radio]')];
    this.sync(this.start());
    for (const r of this.radios) r.addEventListener('change', () => this.pick(+r.dataset.i));
    this.group.addEventListener('keydown', (ev) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
      if (!d || !this.engine) return;
      ev.preventDefault();
      const i = Math.max(0, Math.min(4, this.engine.selected + d));
      this.pick(i); this.radios[i].focus();
    });
    box.addEventListener('pointermove', (ev) => { if (!this.engine) return; const [x, y] = this.local(ev); const i = this.engine.hitTest(x, y); this.engine.setHovered(i); box.style.cursor = i >= 0 ? 'pointer' : 'default'; });
    box.addEventListener('pointerleave', () => this.engine?.setHovered(-1));
    box.addEventListener('pointerdown', (ev) => { if (!this.engine) return; const [x, y] = this.local(ev); const i = this.engine.hitTest(x, y); if (i >= 0) { this.radios[i].focus({ preventScroll: true }); this.pick(i); } });
  }
}
SoapFilm.define('soap-menu', SoapMenu);
// <<< element
})();
