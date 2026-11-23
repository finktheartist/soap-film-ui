// Soap Film Slider: A range slider whose filled part is a pane of soap film inside a glass track. Drag it and the
// film stretches and swirls with the speed; let go and small bubbles bloom in its corners and along its edge,
// swell, and coalesce back into the pane.
//
// One file, no dependencies. Load it with a script tag and use <soap-slider value="40"
// label="Volume"></soap-slider>. Read el.value; it fires input while it moves and change when it is let go. With a
// name it is sent with its form.
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
if (customElements.get('soap-slider')) return;
// >>> engine (src/engines/slider.js)
// ============================================================================
// SOAP FILM SLIDER VARIANTS (Take A: Coalescing Merge | Take B: Macro Blow-Up)
// ============================================================================
// Shared WebGL2 2D Navier-Stokes + stylized-physical thin-film interference engine.

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
uniform vec2 uRes;           // physical pixel resolution
uniform vec2 uSize;          // logical CSS size
uniform vec2 uTrackHalf;     // etched glass track half-size in local coords
uniform float uTrackCorner;  // track corner radius
uniform float uWireR;        // hairline glass groove width
uniform int uMode;           // 0 = merge (Take A), 1 = inflate (Take B)

uniform float uBarX;
uniform float uBarHalfH;
uniform float uBarVel;
uniform float uBarPos;       // 0..1 slider value
uniform float uTime;

// Elastic bubble state
uniform float uInflate;
uniform float uSwell;        // extra plump swell from merging / inflating
uniform vec2 uBubbleCenter;  // active main bubble center
uniform vec2 uBubbleHalf;    // active main bubble half-size
uniform vec4 uBubbleCorners; // (rTR, rBR, rTL, rBL)
uniform vec2 uWobble;        // (wob2, wob3)
uniform vec2 uLean;

// Take A: Organic deformable coalescing edge bubbles (up to 16 active bubbles)
// uMerge[i]      = (x, y, radius, phase)
// uMergeMeta[i]  = (fuseToMain 0..1, pairFuse 0..1, glowBoost 0..1, alive 0/1)
// uMergeShape[i] = (stretchAmt, stretchAngle, lobeAmp, jitterSeed)
#define MAX_MERGE 16
uniform vec4 uMerge[MAX_MERGE];
uniform vec4 uMergeMeta[MAX_MERGE];
uniform vec4 uMergeShape[MAX_MERGE];
uniform int uMergeCount;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float sdRoundedBox4(vec2 p, vec2 b, vec4 r) {
  r.xy = (p.x > 0.0) ? r.xy : r.zw;
  r.x  = (p.y > 0.0) ? r.x  : r.y;
  vec2 q = abs(p) - b + r.x;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// High-chroma stylized-physical thin-film interference spectrum (matches core-v6.js)
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
  col = pow(clamp(col, 0.0, 1.25), vec3(0.92));

  float newton = smoothstep(14.0, 62.0, dNm);
  return clamp(col * newton, 0.0, 1.25);
}

vec3 bubbleSpeculars(vec3 N, float NdotV, vec2 pNorm, float time, float starBoost) {
  vec3 V = vec3(0.0, 0.0, 1.0);

  vec3 L1 = normalize(vec3(-0.60, 0.76, 0.46));
  vec3 H1 = normalize(L1 + V);
  float ndh1 = max(0.0, dot(N, H1));
  float arc1 = smoothstep(0.86, 0.94, ndh1) * 0.78 + smoothstep(0.955, 0.990, ndh1) * 0.96;

  vec3 L2 = normalize(vec3(0.68, -0.62, 0.42));
  vec3 H2 = normalize(L2 + V);
  float ndh2 = max(0.0, dot(N, H2));
  float arc2 = smoothstep(0.88, 0.96, ndh2) * 0.54;

  float skyArc = smoothstep(0.22, 0.90, -pNorm.x * 0.55 + pNorm.y * 0.85) * smoothstep(0.16, 0.80, 1.0 - NdotV) * 0.28;

  // Optical 4-ray + diagonal diamond starburst glint on upper-left shoulder
  vec2 starCenter = vec2(-0.46, 0.54);
  vec2 dStar = (pNorm - starCenter) * 3.5;
  float rStar = length(dStar);
  float rayH = exp(-abs(dStar.y) * 26.0) * exp(-abs(dStar.x) * 4.2);
  float rayV = exp(-abs(dStar.x) * 26.0) * exp(-abs(dStar.y) * 4.2);
  vec2 dDiag = vec2(dStar.x + dStar.y, dStar.x - dStar.y) * 0.7071;
  float rayD = (exp(-abs(dDiag.y) * 34.0) * exp(-abs(dDiag.x) * 7.2)
              + exp(-abs(dDiag.x) * 34.0) * exp(-abs(dDiag.y) * 7.2)) * 0.48;
  float coreDot = exp(-rStar * rStar * 22.0);
  float twinkle = 0.86 + 0.14 * sin(time * 4.2 + pNorm.x * 2.0);
  float starburst = (coreDot * 0.95 + (rayH + rayV + rayD) * smoothstep(0.75, 0.0, rStar) * 0.85)
                  * twinkle * smoothstep(0.40, 0.84, ndh1 + 0.16) * starBoost;

  return vec3(clamp(arc1 + arc2 + skyArc + starburst, 0.0, 1.48), skyArc, starburst);
}

// Etched crystal glass capillary track (crisp on pure #FFFFFF white!)
vec4 evalGlassCapillary(float sdTrack, vec2 gradDir, float trackW, vec3 tintBounce, float wetness, float visibility) {
  if (visibility <= 0.002) return vec4(0.0);
  float aa = 1.6 / uRes.y;
  float dAbs = abs(sdTrack);
  float mask = smoothstep(trackW + aa, trackW - aa, dAbs);
  if (mask <= 0.001) return vec4(0.0);

  vec2 L = normalize(vec2(-0.62, 0.78));
  float directional = dot(gradDir, L);
  float edgeProfile = 1.0 - clamp(dAbs / trackW, 0.0, 1.0);
  float coreGlow = pow(edgeProfile, 1.4);

  vec3 grooveShadow = vec3(0.32, 0.36, 0.52);
  vec3 catchlight = vec3(0.76, 0.79, 0.88);
  vec3 col = mix(grooveShadow, catchlight, smoothstep(-0.35, 0.48, -directional));
  col = mix(col, tintBounce * 0.82 + vec3(0.18), wetness * 0.32);
  float alpha = mask * visibility * (0.28 + 0.30 * coreGlow + 0.22 * abs(directional) + 0.16 * wetness);
  return vec4(clamp(col, 0.0, 1.25), clamp(alpha, 0.0, 0.88));
}

// Floating translucent pearl-glass dewdrop touch bead
vec4 evalDewdropBead(vec2 p, vec2 center, float r, vec3 tintBounce) {
  vec2 d = p - center;
  float dist = length(d);
  float aa = 1.7 / uRes.y;
  float mask = smoothstep(r + aa, r - aa, dist);
  if (mask <= 0.001) return vec4(0.0);

  vec2 n2 = d / r;
  float nz = sqrt(max(0.001, 1.0 - dot(n2, n2)));
  vec3 N = normalize(vec3(n2, nz));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L1 = normalize(vec3(-0.55, 0.68, 0.66));
  vec3 L2 = normalize(vec3(0.60, -0.52, 0.58));
  float spec1 = pow(max(0.0, dot(N, normalize(L1 + V))), 64.0);
  float spec2 = pow(max(0.0, dot(N, normalize(L2 + V))), 24.0);
  float fres = pow(1.0 - nz, 2.2);

  vec3 col = mix(vec3(0.95, 0.96, 1.0), vec3(0.38, 0.42, 0.66), fres * 0.68);
  col = mix(col, tintBounce * 0.95 + vec3(0.14), fres * 0.42);
  col = mix(col, vec3(1.0), clamp(spec1 * 1.2 + spec2 * 0.42 + smoothstep(0.86, 0.97, dot(N, normalize(L1 + V))) * 0.72, 0.0, 0.98));
  float alpha = mask * (0.66 + 0.32 * fres + 0.34 * spec1);
  return vec4(clamp(col, 0.0, 1.25), clamp(alpha, 0.0, 0.98));
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

float sdChamber(vec2 p, float barX, float barR) {
  float innerLoop = sdRoundedBox(p, uTrackHalf, uTrackCorner) + uWireR * 0.28;
  float rightWall = p.x - (barX - barR * 0.25);
  return smax(innerLoop, rightWall, 0.012);
}

// Organic deformable bubble SDF: volume-preserving squash/stretch + subtle multi-lobe wobble!
float sdOrganicBubble(vec2 p, vec4 m, vec4 shp) {
  vec2 d = p - m.xy;
  float ca = cos(shp.y), sa = sin(shp.y);
  vec2 dl = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
  float stretch = clamp(shp.x, -0.28, 0.38);
  float sx = 1.0 + stretch;
  float sy = 1.0 / sx;
  float th = atan(dl.y, dl.x);
  float rNorm = length(dl) / max(0.012, m.z);
  float wobFade = smoothstep(0.08, 0.45, rNorm);
  float lobe = shp.z * (0.048 * sin(3.0 * th + m.w) + 0.032 * cos(2.0 * th - m.w * 1.35 + shp.w)) * wobFade;
  vec2 qs = vec2(dl.x / sx, dl.y / sy);
  return (length(qs) - m.z * (1.0 + lobe)) * min(sx, sy);
}

// Evaluates exact main hero bubble SDF (supports BOTH Take A liquid smin fusion AND Take B giant blow-up!)
float sdHeroBubble(vec2 p, float barX, float barR) {
  vec2 bp = p - uBubbleCenter;
  float rCenter = length(bp / max(uBubbleHalf, vec2(0.06)));
  float theta = atan(bp.y, bp.x);
  float wobFade = smoothstep(0.08, 0.42, rCenter);
  float lobeDeform = (uWobble.x * cos(2.0 * theta) + uWobble.y * cos(3.0 * theta + 0.8)) * wobFade;

  if (uMode == 0) {
    // Take A (Merge): stays cleanly inside the sleek chamber while organic edge bubbles coalesce & gulp in!
    float yn = clamp(bp.y / max(0.01, uBubbleHalf.y), -1.0, 1.0);
    float rightSide = smoothstep(-uBubbleHalf.x * 0.15, uBubbleHalf.x, bp.x);
    bp.x += clamp(uBarVel, -2.5, 2.5) * 0.042 * (1.0 - yn * yn) * rightSide;
    float sdBox = sdRoundedBox4(bp, uBubbleHalf, uBubbleCorners) - lobeDeform * 0.032;

    float ch = sdChamber(p, barX, barR);
    float dMain = smax(sdBox, ch, 0.016);

    // Real smooth liquid metaball union (smin) for bubbles fusing straight into the hero bubble!
    for (int i = 0; i < MAX_MERGE; i++) {
      if (i >= uMergeCount) break;
      vec4 m = uMerge[i];
      vec4 meta = uMergeMeta[i];
      if (meta.w < 0.5 || m.z <= 0.004) continue;
      float fuse = meta.x;
      if (fuse > 0.01) {
        float dB = smax(sdOrganicBubble(p, m, uMergeShape[i]), ch, 0.010);
        float kNeck = mix(0.016, 0.165, smoothstep(0.0, 0.85, fuse));
        dMain = smin(dMain, dB, kNeck);
      }
    }
    return dMain;
  } else {
    // Take B (Inflate): giant buoyant blown soap bubble ballooning way above & below the sleek track!
    // Organic teardrop stretch when dragged fast + lush low-frequency soap-orb wobble!
    float xn = clamp(bp.x / max(0.06, uBubbleHalf.x), -1.0, 1.0);
    float yn = clamp(bp.y / max(0.06, uBubbleHalf.y), -1.0, 1.0);
    float tearLag = clamp(uBarVel, -2.5, 2.5) * 0.055 * (1.0 - yn * yn) * smoothstep(-0.3, 1.0, xn);
    bp.x += tearLag;

    // Smoothly morph from rounded pill at 0% into a voluptuous giant round soap sphere/pillow at 85%!
    float roundness = smoothstep(0.05, 0.75, uBarPos);
    float sdPillow = sdRoundedBox4(bp, uBubbleHalf, uBubbleCorners);
    // Subtle super-elliptic organic puff so big blown bubble feels like inflated air-filled soap skin!
    vec2 ep = bp / max(uBubbleHalf, vec2(0.08));
    float sdEllip = (length(ep) - 1.0) * min(uBubbleHalf.x, uBubbleHalf.y);
    float dShape = mix(sdPillow, smin(sdPillow, sdEllip, 0.14), roundness * 0.62);
    return dShape - lobeDeform * (0.028 + 0.032 * roundness);
  }
}

// Renders a lush iridescent light-mode soap surface from normal, fresnel, thickness, and specular
vec4 shadeSoapLight(vec2 p, vec2 pNorm, vec3 N, float dIn, float maxDepth, float wetFillet, float tightWetSeam, float wetDarkLine, vec4 simC, float slopeMag, float glowBoost, float mask, float starBoost) {
  vec3 V = vec3(0.0, 0.0, 1.0);
  float NdotV = clamp(dot(N, V), 0.06, 1.0);
  float fres = pow(1.0 - NdotV, 2.30);
  float razorRim = pow(1.0 - NdotV, 5.0);
  float innerOutline = exp(-pow((dIn / maxDepth - 0.052) * 26.0, 2.0));
  float outerWhiteHair = exp(-pow((dIn / maxDepth - 0.014) * 56.0, 2.0));

  float flowWave = 0.5 + 0.5 * sin(pNorm.x * 1.45 - pNorm.y * 1.25 + simC.r * 2.8 + uTime * 0.45);
  float dNm = mix(115.0, 745.0, simC.r * 0.72 + flowWave * 0.28) + fres * 240.0 + wetFillet * 165.0 + glowBoost * 110.0;

  float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
  float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
  vec3 irid = bubbleIridescence(dNm, cosTheta);

  vec3 specInfo = bubbleSpeculars(N, NdotV, pNorm, uTime, starBoost);
  float specArc = specInfo.x;

  vec2 spGrid = (p + vec2(simC.r * 0.35, -simC.g * 0.25)) * 20.0;
  vec2 spCell = floor(spGrid);
  vec2 spF = fract(spGrid) - 0.5;
  float spRnd = hash21(spCell);
  float spDot = smoothstep(0.16, 0.02, length(spF)) * step(0.938, spRnd)
              * (0.45 + 0.55 * sin(uTime * 5.2 + spRnd * 40.0))
              * (0.35 + 0.65 * fres + simC.b + glowBoost * 0.5);

  vec3 contourCol = mix(vec3(0.36, 0.39, 0.68), irid * 0.65 + vec3(0.18, 0.16, 0.36), 0.52);
  vec3 domeColor = mix(vec3(0.92, 0.95, 1.0), irid * 0.92 + vec3(0.18, 0.20, 0.28), 0.85);

  vec3 col = mix(vec3(0.94, 0.95, 0.99), domeColor, clamp(0.26 + fres * 0.74 + wetFillet * 0.38 + slopeMag * 0.45 + glowBoost * 0.35, 0.0, 1.0));
  col = mix(col, contourCol, clamp(innerOutline * 0.64 + razorRim * 0.48 + wetDarkLine * 0.38, 0.0, 0.82));
  float crescentBand = smoothstep(0.10, 0.78, max(fres, wetFillet * 0.70)) * (1.0 - outerWhiteHair * 0.6);
  col = mix(col, clamp(irid * 1.08 + vec3(0.10, 0.08, 0.14), 0.0, 1.0), crescentBand * 0.60);

  float whiteGlow = clamp(specArc * 0.95 + outerWhiteHair * 0.84 + tightWetSeam * 0.68 + spDot * 0.90 + glowBoost * 0.22, 0.0, 0.98);
  col = mix(col, vec3(1.0, 0.998, 1.0), whiteGlow);

  float alpha = clamp(
    0.20 + fres * 0.74 + wetFillet * 0.46 + tightWetSeam * 0.56 + innerOutline * 0.58 + outerWhiteHair * 0.76 + specArc * 0.84 + slopeMag * 0.34,
    0.0, 0.98
  );
  return vec4(col * (alpha * mask), alpha * mask);
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);
  float barR = uWireR * 0.82;
  vec2 barA = vec2(uBarX, -uBarHalfH);
  vec2 barB = vec2(uBarX,  uBarHalfH);
  float barDist = sdSegment(p, barA, barB);

  float chamber = sdChamber(p, uBarX, barR);
  float wallContactDist = max(0.0, -chamber);

  // Subtle recessed glass-well ambient tint inside capillary track
  {
    float sdLoop = sdRoundedBox(p, uTrackHalf, uTrackCorner);
    float inside = smoothstep(px * 2.0, -px * 2.0, sdLoop);
    float wellAlpha = inside * 0.028;
    outCol = over(vec4(vec3(0.18, 0.22, 0.36) * wellAlpha, wellAlpha), outCol);
  }

  // In Take B (Inflate), draw the sleek etched glass capillary track UNDER the giant floating soap orb
  // so the giant translucent bubble balloons proudly ABOVE & BELOW the track with glass showing softly through!
  vec3 filmBounceCol = vec3(0.66, 0.78, 0.98);
  if (uMode == 1) {
    float sdLoop = sdRoundedBox(p, uTrackHalf, uTrackCorner);
    float eps = 0.002;
    vec2 gLoop = normalize(vec2(
      sdRoundedBox(p + vec2(eps, 0.0), uTrackHalf, uTrackCorner) - sdRoundedBox(p - vec2(eps, 0.0), uTrackHalf, uTrackCorner),
      sdRoundedBox(p + vec2(0.0, eps), uTrackHalf, uTrackCorner) - sdRoundedBox(p - vec2(0.0, eps), uTrackHalf, uTrackCorner)
    ) + 1e-6);
    float wet = smoothstep(uBarX + 0.04, uBarX - 0.03, p.x);
    vec4 rimG = evalGlassCapillary(sdLoop, gLoop, uWireR * 0.88, filmBounceCol, wet, 0.95);
    outCol = over(vec4(rimG.rgb * rimG.a, rimG.a), outCol);
  }

  // Soft airy floating drop shadow beneath the 3D soap bubble!
  float sdMain = sdHeroBubble(p, uBarX, barR);
  {
    vec2 shOff = (uMode == 1) ? vec2(-0.018, 0.055 + 0.035 * uBarPos) : vec2(-0.012, 0.032);
    float sdSh = sdHeroBubble(p + shOff, uBarX, barR);
    float blurW = (uMode == 1) ? (0.18 + 0.14 * uBarPos) : 0.16;
    float bSh = smoothstep(blurW, -0.06, sdSh) * (uMode == 1 ? (0.085 + 0.035 * uBarPos) : 0.085);
    vec3 shC = vec3(0.24, 0.24, 0.42);
    outCol = over(vec4(shC * bSh, bSh), outCol);
  }

  // --- TAKE A: ORGANIC DEFORMABLE COALESCING EDGE BUBBLES ---
  float separateFoamMask = 0.0;
  if (uMode == 0 && uMergeCount > 0) {
    float bestDist = 1e9;
    float secondDist = 1e9;
    int bestIdx = -1;
    vec4 bestB = vec4(0.0);
    vec4 bestMeta = vec4(0.0);
    vec4 bestShp = vec4(0.0);

    for (int i = 0; i < MAX_MERGE; i++) {
      if (i >= uMergeCount) break;
      vec4 m = uMerge[i];
      vec4 meta = uMergeMeta[i];
      if (meta.w < 0.5 || m.z <= 0.004) continue;
      if (meta.x >= 0.76) continue;
      float dOrg = sdOrganicBubble(p, m, uMergeShape[i]);
      if (dOrg < bestDist) {
        secondDist = bestDist;
        bestDist = dOrg;
        bestIdx = i;
        bestB = m;
        bestMeta = meta;
        bestShp = uMergeShape[i];
      } else if (dOrg < secondDist) {
        secondDist = dOrg;
      }
    }

    if (bestIdx >= 0) {
      float r = bestB.z;
      float fuseToMain = bestMeta.x;
      float pairFuse = bestMeta.y;
      float glowBoost = bestMeta.z;

      // Smooth organic metaball pull with any actively coalescing neighbor!
      float dShape = bestDist;
      float maxPairFuse = 0.0;
      if (pairFuse > 0.01) {
        for (int j = 0; j < MAX_MERGE; j++) {
          if (j >= uMergeCount || j == bestIdx) continue;
          vec4 o = uMerge[j];
          vec4 om = uMergeMeta[j];
          if (om.w < 0.5 || o.z <= 0.004 || om.x >= 0.76) continue;
          float bothPair = min(pairFuse, om.y);
          if (bothPair > 0.01) {
            float dO = sdOrganicBubble(p, o, uMergeShape[j]);
            float kPair = (0.04 + 0.07 * bothPair) * min(1.2, (r + o.z) * 4.5);
            dShape = smin(dShape, dO, kPair);
            maxPairFuse = max(maxPairFuse, bothPair);
          }
        }
      }

      // Soft curved wet-meniscus flattening against glass track walls (natural D-shapes & pillows!)
      float sdCell = smax(dShape, chamber, 0.014);

      float dNeighbor = max(0.0, secondDist - bestDist);
      float wallKeep = (1.0 - smoothstep(0.05, 0.52, maxPairFuse)) * (1.0 - smoothstep(0.05, 0.48, fuseToMain));
      float smallness = 1.0 - smoothstep(0.038, 0.16, r);
      float plateauWall = exp(-dNeighbor * mix(26.0, 52.0, smallness)) * wallKeep
                        + exp(-abs(sdMain) * 32.0) * smoothstep(0.05, -0.02, sdMain + 0.025) * (1.0 - smoothstep(0.0, 0.42, fuseToMain));

      float growA = smoothstep(0.004, 0.020, r) * (1.0 - smoothstep(0.24, 0.70, fuseToMain));
      float mask = smoothstep(px * 2.0, -px * 2.0, sdCell) * growA;

      if (mask > 0.002) {
        separateFoamMask = max(separateFoamMask, mask);

        // Smooth analytical + organic-SDF gradient normal so stretched/merging necks reflect silky 3D light!
        float feps = 0.004;
        float dFx = sdOrganicBubble(p + vec2(feps, 0.0), bestB, bestShp) - sdOrganicBubble(p - vec2(feps, 0.0), bestB, bestShp);
        float dFy = sdOrganicBubble(p + vec2(0.0, feps), bestB, bestShp) - sdOrganicBubble(p - vec2(0.0, feps), bestB, bestShp);
        vec2 gBubble = normalize(vec2(dFx, dFy) + 1e-5);

        float dInCell = max(0.0, -sdCell);
        float maxDCell = max(0.022, r);
        float rhoCell = clamp(1.0 - dInCell / maxDCell, 0.0, 0.985);

        vec2 dvec = p - bestB.xy;
        vec2 nCenter = dvec / max(0.012, r);
        vec2 nDir = normalize(mix(nCenter, gBubble, smoothstep(0.35, 0.92, rhoCell)) + 1e-5);
        float steep = pow(rhoCell, 1.15) * 0.96;
        vec2 n2 = nDir * steep;
        float nz = sqrt(max(0.05, 1.0 - min(0.95, dot(n2, n2))));

        vec3 Nf = normalize(vec3(n2, nz));
        vec3 Vf = vec3(0.0, 0.0, 1.0);
        float NdotVf = clamp(dot(Nf, Vf), 0.06, 1.0);
        float fresF = pow(1.0 - NdotVf, 2.05);

        float dNmF = mix(125.0, 680.0, fract(bestB.w * 0.37 + 0.25 * n2.y - 0.16 * n2.x + 0.12 * sin(uTime * 1.15 + bestB.w)))
                   + fresF * 225.0 + glowBoost * 130.0;
        float cosTf = sqrt(max(0.22, 1.0 - (1.0 - NdotVf * NdotVf) / (1.333 * 1.333)));
        vec3 iridF = bubbleIridescence(dNmF, cosTf);
        filmBounceCol = mix(filmBounceCol, iridF, mask * 0.65);

        vec3 L1 = normalize(vec3(-0.62, 0.76, 0.48));
        float ndh = max(0.0, dot(Nf, normalize(L1 + Vf)));
        float specF = smoothstep(0.83, 0.94, ndh) * 0.95 + smoothstep(0.95, 0.99, ndh) * (0.98 + 0.18 * smallness);
        vec3 L2 = normalize(vec3(0.65, -0.60, 0.45));
        float specF2 = smoothstep(0.88, 0.96, max(0.0, dot(Nf, normalize(L2 + Vf)))) * 0.48;

        float rimLine = exp(-abs(sdCell) * mix(62.0, 145.0, smallness));
        float wetContactGlow = exp(-wallContactDist * 54.0);

        vec3 rimContour = mix(vec3(0.36, 0.39, 0.68), iridF * 0.62 + vec3(0.18, 0.16, 0.36), 0.52);
        vec3 colF = mix(vec3(0.95, 0.96, 1.0), clamp(iridF * 1.04 + vec3(0.14, 0.14, 0.22), 0.0, 1.0), 0.32 + fresF * 0.64);
        colF = mix(colF, rimContour, clamp(rimLine * 0.62 + plateauWall * 0.48 + pow(fresF, 1.8) * 0.48, 0.0, 0.80));
        colF = mix(colF, vec3(1.0), clamp(specF * 0.96 + specF2 * 0.44 + wetContactGlow * 0.54 + glowBoost * 0.32, 0.0, 0.98));
        float aF = clamp(0.26 + fresF * 0.68 + rimLine * 0.70 + plateauWall * 0.50 + specF * 0.86 + wetContactGlow * 0.44, 0.0, 0.97);
        outCol = over(vec4(colF * (aF * mask), aF * mask), outCol);
      }
    }
  }

  // --- MAIN HERO 3D VOLUMETRIC SOAP BUBBLE ---
  float bubbleMask = smoothstep(px * 2.2, -px * 2.2, sdMain);
  bubbleMask *= (1.0 - separateFoamMask * 0.72);

  if (bubbleMask > 0.001) {
    float maxDepth = max(0.12, min(uBubbleHalf.x, uBubbleHalf.y));
    float dIn = max(0.0, -sdMain);
    float rho = clamp(1.0 - dIn / maxDepth, 0.0, 0.998);

    vec2 bp = p - uBubbleCenter;
    vec2 pNorm = bp / max(uBubbleHalf, vec2(0.06));
    vec2 smoothDir = normalize(pNorm + 1e-5);
    float eps = 0.004;
    vec2 gRim = normalize(vec2(
      sdHeroBubble(p + vec2(eps, 0.0), uBarX, barR) - sdHeroBubble(p - vec2(eps, 0.0), uBarX, barR),
      sdHeroBubble(p + vec2(0.0, eps), uBarX, barR) - sdHeroBubble(p - vec2(0.0, eps), uBarX, barR)
    ) + 1e-5);

    vec2 gWall = normalize(vec2(
      sdChamber(p + vec2(eps, 0.0), uBarX, barR) - sdChamber(p - vec2(eps, 0.0), uBarX, barR),
      sdChamber(p + vec2(0.0, eps), uBarX, barR) - sdChamber(p - vec2(0.0, eps), uBarX, barR)
    ) + 1e-5);

    float rimBlend = (uMode == 1) ? smoothstep(0.45, 0.94, rho) : smoothstep(0.55, 0.96, rho);
    vec2 domeDir = normalize(mix(smoothDir, gRim, rimBlend) + 1e-5);

    float wetFillet = (uMode == 0) ? exp(-wallContactDist * 22.0) : exp(-wallContactDist * 26.0) * (1.0 - smoothstep(0.10, 0.55, uBarPos));
    float tightWetSeam = (uMode == 0) ? exp(-wallContactDist * 60.0) : 0.0;
    float wetDarkLine = (uMode == 0) ? exp(-pow((wallContactDist - 0.018) * 70.0, 2.0)) : 0.0;

    // Sample Navier-Stokes fluid sim mapped across the active bubble bounds
    vec2 simSpan = (uMode == 1) ? max(uTrackHalf * 2.0, uBubbleHalf * 2.0) : (uTrackHalf * 2.0);
    vec2 simUv = clamp(((p - (uMode == 1 ? uBubbleCenter : vec2(0.0))) / simSpan) + 0.5, 0.004, 0.996);
    vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
    vec4 simC = texture(uSim, simUv);
    float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
    float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
    float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
    float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
    vec2 gradZ = vec2(zR - zL, zU - zD) * 6.5;

    float radialR = clamp(length(pNorm * 0.94), 0.0, 1.0);
    float domeRadius = mix(radialR, rho, rimBlend);
    float puffPow = (uMode == 1) ? mix(1.30, 1.08, smoothstep(0.1, 0.85, uBarPos)) : 1.30;
    float rimSteep = pow(clamp(domeRadius, 0.0, 0.995), puffPow) * (0.86 + 0.22 * uInflate + 0.08 * uSwell);

    vec2 nXY = domeDir * rimSteep + gWall * wetFillet * 0.34 - gradZ - uLean * 0.26;
    float nXY2 = dot(nXY, nXY);
    vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
    float slopeMag = length(gradZ);

    float starBoost = (uMode == 1) ? (0.75 + 0.65 * uBarPos) : 0.85;
    vec4 filmPremul = shadeSoapLight(
      p, pNorm, N, dIn, maxDepth, wetFillet, tightWetSeam, wetDarkLine,
      simC, slopeMag, uSwell * 0.45 + simC.b * 0.35, bubbleMask, starBoost
    );
    outCol = over(filmPremul, outCol);
  }

  // In Take A (Merge), draw the etched glass capillary track crisp OVER the edge
  if (uMode == 0) {
    float sdLoop = sdRoundedBox(p, uTrackHalf, uTrackCorner);
    float eps = 0.002;
    vec2 gLoop = normalize(vec2(
      sdRoundedBox(p + vec2(eps, 0.0), uTrackHalf, uTrackCorner) - sdRoundedBox(p - vec2(eps, 0.0), uTrackHalf, uTrackCorner),
      sdRoundedBox(p + vec2(0.0, eps), uTrackHalf, uTrackCorner) - sdRoundedBox(p - vec2(0.0, eps), uTrackHalf, uTrackCorner)
    ) + 1e-6);
    float wet = smoothstep(uBarX + 0.04, uBarX - 0.03, p.x);
    vec4 rimG = evalGlassCapillary(sdLoop, gLoop, uWireR * 0.85, filmBounceCol, wet, 0.92);
    outCol = over(vec4(rimG.rgb * rimG.a, rimG.a), outCol);
  }

  // Flush crystal wiper hairline + floating translucent dewdrop touch bead
  {
    vec2 gBar = vec2((p.x >= uBarX) ? 1.0 : -1.0, 0.0);
    float wiperVis = (uMode == 1) ? mix(0.88, 0.42, smoothstep(0.15, 0.65, uBarPos)) : 0.90;
    vec4 barG = evalGlassCapillary(barDist, gBar, barR * 0.82, filmBounceCol, 0.85, wiperVis);
    outCol = over(vec4(barG.rgb * barG.a, barG.a), outCol);

    float beadR = (uMode == 1) ? (uWireR * 4.4) : (uWireR * 3.8);
    vec4 bead = evalDewdropBead(p, vec2(uBarX, 0.0), beadR, filmBounceCol);
    outCol = over(vec4(bead.rgb * bead.a, bead.a), outCol);
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

const MAX_MERGE = 16;

class SoapSliderVariant {
  constructor(container, opts) {
    this.mode = opts.mode || 'merge'; // 'merge' (Take A) | 'inflate' (Take B)
    this.modeId = this.mode === 'inflate' ? 1 : 0;
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;

    if (this.mode === 'inflate') {
      // Sleek horizontal glass capillary track dead-center in full 640x360 stage
      // so the giant blown soap bubble has huge vertical headroom to balloon 3x taller!
      this.trackHalfX = 1.08;
      this.trackHalfY = 0.24;
      this.trackCorner = this.trackHalfY * 0.92;
      this.wireR = 0.0145;
    } else {
      // Take A: matches our signature spacious Frameless Slider track
      this.trackHalfX = 1.06;
      this.trackHalfY = 0.40;
      this.trackCorner = this.trackHalfY * 0.42;
      this.wireR = 0.0155;
    }

    this.wrap = document.createElement('div');
    this.wrap.style.cssText = `position:relative;width:${this.width}px;height:${this.height}px;user-select:none;`;
    container.appendChild(this.wrap);

    this.glCanvas = document.createElement('canvas');
    this.glCanvas.width = this.width * this.dpr;
    this.glCanvas.height = this.height * this.dpr;
    this.glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    this.wrap.appendChild(this.glCanvas);

    this.fxCanvas = document.createElement('canvas');
    this.fxCanvas.width = this.width * this.dpr;
    this.fxCanvas.height = this.height * this.dpr;
    this.fxCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    this.wrap.appendChild(this.fxCanvas);
    this.fxCtx = this.fxCanvas.getContext('2d');

    this._initGL();

    // 2D Incompressible Navier-Stokes grid
    this.nx = 72;
    this.ny = 48;
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

    this.time = 1.2;
    this.barPos = opts.value ?? 0.0;
    this.barVel = 0;
    this.dragging = false;
    this.wasMoving = false;
    this.moveCharge = 0;
    this.stillTime = 0;

    // Elastic dynamics
    this.inflate = 1.0;
    this.inflateVel = 0;
    this.swell = 0.0;
    this.swellVel = 0;
    this.wob2 = 0;
    this.wob2Vel = 0;
    this.wob3 = 0;
    this.wob3Vel = 0;
    this.leanX = 0;
    this.leanY = 0;

    // Take B lagging blown-bubble spring (gives real floating teardrop inertia!)
    this.blownPos = this.barPos;
    this.blownVel = 0;
    this.blownRadiusY = this.trackHalfY - 0.01;
    this.blownRadiusYVel = 0;

    // Take A organic coalescing edge bubbles
    this.mergeBubbles = [];
    this.mergeUniform = new Float32Array(MAX_MERGE * 4);
    this.mergeMetaUniform = new Float32Array(MAX_MERGE * 4);
    this.mergeShapeUniform = new Float32Array(MAX_MERGE * 4);
    this.mergeWaveAge = -1;
    this.mergeStopCount = 0;

    // Floating sparkle / nested reflections (Take A stays pure & uncluttered so merged hero reads as ONE clean bubble!)
    this.nestedBubbles = this.mode === 'inflate'
      ? [{ x: -0.78, y: -0.04, vx: 0, vy: 0, r: 10.5, hue: 215, phase: 0.7 }]
      : [];
    this.floatBubbles = [];
    this.sparkles = [];

    this._seedFilm();
  }

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
      'uSim', 'uRes', 'uSize', 'uTrackHalf', 'uTrackCorner', 'uWireR', 'uMode',
      'uBarX', 'uBarHalfH', 'uBarVel', 'uBarPos', 'uTime',
      'uInflate', 'uSwell', 'uBubbleCenter', 'uBubbleHalf', 'uBubbleCorners',
      'uWobble', 'uLean', 'uMerge', 'uMergeMeta', 'uMergeShape', 'uMergeCount',
    ];
    this.u = {};
    for (const n of names) this.u[n] = gl.getUniformLocation(this.prog, n);
  }

  barXMin() {
    return this.mode === 'inflate'
      ? -this.trackHalfX + 0.36
      : -this.trackHalfX + 0.38;
  }

  barXMax() {
    return this.trackHalfX - this.trackCorner * 0.72;
  }

  barXFromPos(pos) {
    const a = this.barXMin();
    const b = this.barXMax();
    return a + (b - a) * Math.max(0, Math.min(1, pos));
  }

  beadStagePos(pos) {
    const lx = this.barXFromPos(pos);
    return {
      x: ((lx / this.aspect) * 0.5 + 0.5) * this.width,
      y: 0.5 * this.height,
    };
  }

  _barHalfHeight(barX) {
    const flatX = Math.max(0, this.trackHalfX - this.trackCorner);
    const excess = Math.max(0, Math.abs(barX) - flatX);
    if (excess >= this.trackCorner) return 0.06;
    const h = Math.sqrt(Math.max(0, this.trackCorner * this.trackCorner - excess * excess));
    return Math.max(0.06, h - this.wireR * 0.25);
  }

  // External driver API (used cleanly by our mouse choreography!)
  setDragging(down) {
    if (down && !this.dragging) {
      this.dragging = true;
      this.wob2Vel += 1.8;
      this.stillTime = 0;
      if (this.mode === 'merge') this._clearMergeQuickly();
    } else if (!down && this.dragging) {
      this.dragging = false;
      this.wob2Vel += this.barVel * (this.mode === 'inflate' ? 2.8 : 2.0);
      if (this.moveCharge > 0.08) {
        this.wasMoving = true;
        this.stillTime = 0;
      }
    }
  }

  dragTo(nextPos) {
    nextPos = Math.max(0, Math.min(1, nextPos));
    const dv = nextPos - this.barPos;
    if (Math.abs(dv) > 0.0005) {
      this.barVel = this.barVel * 0.55 + dv * 30.0;
      this.barPos = nextPos;
      this.moveCharge = Math.min(1.4, this.moveCharge + Math.abs(dv) * 3.2);
      this.wasMoving = true;
      this.stillTime = 0;
      if (this.mode === 'merge' && this.mergeBubbles.length > 0 && Math.abs(dv) > 0.008) {
        this._clearMergeQuickly();
      }

      const barX = this.barXFromPos(this.barPos);
      this._injectWandShear(barX, dv * 32);
      this.wob2Vel += dv * (this.mode === 'inflate' ? 16 : 11);
      this.wob3Vel -= dv * (this.mode === 'inflate' ? 9 : 4);
      this.inflateVel += Math.abs(dv) * (this.mode === 'inflate' ? 6.5 : 4.2);

      // Gentle occasional buoyant bubble drifting off during brisk drag
      const speed = Math.abs(dv) * 30;
      if (this.mode === 'inflate' && speed > 1.8 && Math.random() < 0.16 && this.floatBubbles.length < 4) {
        this.floatBubbles.push({
          x: barX - 0.12,
          y: (Math.random() - 0.5) * this.blownRadiusY * 1.1,
          vx: (Math.random() - 0.5) * 0.45 + this.barVel * 0.08,
          vy: 0.45 + Math.random() * 0.45,
          r: 4.5 + Math.random() * 5.0,
          life: 1.0,
          decay: 0.65,
          hue: Math.random() * 360,
          wobPhase: Math.random() * 6.28,
        });
      }
    }
  }

  _clearMergeQuickly() {
    for (const b of this.mergeBubbles) {
      b.quickFade = true;
    }
  }

  // Take A: Trigger organic, asymmetric, multi-scale stochastic coalescence!
  _triggerCoalescingMerge(intensity = 1.0) {
    const barX = this.barXFromPos(this.barPos);
    const rightLim = barX - this.wireR * 0.40;
    const leftX = -this.trackHalfX + this.wireR * 0.40;
    const topY = this.trackHalfY - this.wireR * 0.34;
    const botY = -topY;
    const span = rightLim - leftX;
    const sc = Math.min(1.06, (0.76 + span * 0.19) * (0.86 + 0.22 * Math.min(1.2, intensity)));

    this.mergeBubbles = [];
    this.mergeWaveAge = 0;
    const stopIdx = this.mergeStopCount++;

    const makeBubble = (x, y, r, spawnDelay, opts = {}) => {
      if (this.mergeBubbles.length >= MAX_MERGE) return;
      const rad = Math.max(0.032, r * sc);
      const padX = rad * 0.55;
      const padY = rad * 0.55;
      const cx = Math.max(leftX + padX, Math.min(rightLim - padX, x));
      const cy = Math.max(botY + padY, Math.min(topY - padY, y));
      // Align resting stretch organically along whichever wall is closest!
      const nearH = Math.min(Math.abs(topY - cy), Math.abs(cy - botY));
      const nearV = Math.min(Math.abs(rightLim - cx), Math.abs(cx - leftX));
      const wallAngle = (nearH < nearV) ? (Math.random() - 0.5) * 0.35 : (Math.PI * 0.5 + (Math.random() - 0.5) * 0.35);
      const baseStretch = opts.stretch ?? (0.06 + Math.random() * 0.16);
      this.mergeBubbles.push({
        id: Math.random(),
        x: cx, y: cy,
        vx: (Math.random() - 0.5) * 0.05,
        vy: (Math.random() - 0.5) * 0.05,
        r: 0.0001,
        rVel: 0,
        baseR: rad,
        targetR: rad,
        phase: Math.random() * 6.28,
        jitterSeed: Math.random() * 6.28,
        spawnDelay,
        // Live deformable shape state (volume-preserving oval/teardrop + organic wobble!)
        baseStretch,
        stretch: baseStretch,
        stretchVel: 0,
        stretchAngle: opts.angle ?? wallAngle,
        lobeAmp: 0.55 + Math.random() * 0.85,
        // Individual stochastic drainage & hero-absorption rates (varied 3x so nothing moves in lockstep!)
        rateMul: opts.rateMul ?? (0.60 + Math.random() * 1.35),
        contactMap: new Map(),
        mergingInto: null,
        mergeStartX: 0,
        mergeStartY: 0,
        mergeProg: 0,
        mergeDur: 0.32,
        pairFuse: 0,
        heroWait: opts.heroWait ?? (0.28 + Math.random() * 0.95),
        heroFusing: false,
        fuseToMain: 0,
        fuseDur: 0.44 + Math.random() * 0.28,
        fuseStartX: 0,
        fuseStartY: 0,
        fuseTargetX: 0,
        fuseTargetY: 0,
        absorbed: false,
        glowBoost: 0,
        alive: true,
        quickFade: false,
      });
    };

    if (stopIdx % 2 === 0 && span > 0.72) {
      // Stop #1 (78%): Rich asymmetric 12-bubble pileup — heavier bottom-right & lower wiper,
      // lighter playful trio top-right, uneven stray duo top-left, 1 lonely oblong bottom-left!
      // Bottom-right heavy cluster (5 varied sizes, fast small beads + slow big anchor!)
      makeBubble(rightLim - 0.10, botY + 0.08, 0.128, 0.02, { rateMul: 0.85, heroWait: 0.62, stretch: 0.14 });
      makeBubble(rightLim - 0.25, botY + 0.05, 0.084, 0.07, { rateMul: 1.45, stretch: 0.18 });
      makeBubble(rightLim - 0.06, botY + 0.22, 0.066, 0.12, { rateMul: 1.75, stretch: 0.16 });
      makeBubble(rightLim - 0.36, botY + 0.04, 0.046, 0.19, { rateMul: 2.35, stretch: 0.12 });
      makeBubble(rightLim - 0.17, botY + 0.17, 0.040, 0.24, { rateMul: 2.60, stretch: 0.10 });

      // Top-right leaner asymmetric trio (absorbs earlier than bottom-right!)
      makeBubble(rightLim - 0.11, topY - 0.07, 0.102, 0.05, { rateMul: 1.15, heroWait: 0.32, stretch: 0.16 });
      makeBubble(rightLim - 0.26, topY - 0.05, 0.064, 0.14, { rateMul: 1.90, stretch: 0.20 });
      makeBubble(rightLim - 0.06, topY - 0.19, 0.044, 0.22, { rateMul: 2.20, stretch: 0.14 });

      // Loose mid-wiper bubble drifting slightly down toward bottom-right
      makeBubble(rightLim - 0.07, -0.02, 0.058, 0.16, { rateMul: 1.60, heroWait: 0.45, stretch: 0.22 });

      // Uneven top-left pair (slower, lazy merge!)
      makeBubble(leftX + 0.11, topY - 0.07, 0.094, 0.09, { rateMul: 0.72, heroWait: 0.82, stretch: 0.15 });
      makeBubble(leftX + 0.24, topY - 0.04, 0.052, 0.21, { rateMul: 1.35, stretch: 0.22 });

      // Single lonely oblong bubble resting near bottom-left (melts straight into hero at its own quirky beat!)
      makeBubble(leftX + 0.16, botY + 0.05, 0.072, 0.15, { rateMul: 0.90, heroWait: 0.54, stretch: 0.24 });
    } else {
      // Stop #2 (32%, or subsequent stops): Completely different asymmetric 7-bubble balance!
      // Heavier top-right cluster, 1 plump oblong bottom-right, playful duo bottom-left, 1 tiny stray top-left!
      makeBubble(rightLim - 0.10, topY - 0.08, 0.116, 0.03, { rateMul: 1.05, heroWait: 0.48, stretch: 0.15 });
      makeBubble(rightLim - 0.24, topY - 0.05, 0.072, 0.10, { rateMul: 1.85, stretch: 0.19 });
      makeBubble(rightLim - 0.06, topY - 0.21, 0.046, 0.18, { rateMul: 2.40, stretch: 0.14 });

      // Single plump bottom-right bubble (lingers lazily!)
      makeBubble(rightLim - 0.11, botY + 0.07, 0.096, 0.08, { rateMul: 0.80, heroWait: 0.76, stretch: 0.21 });

      // Bottom-left uneven pair
      makeBubble(leftX + 0.10, botY + 0.07, 0.088, 0.06, { rateMul: 1.10, heroWait: 0.36, stretch: 0.14 });
      makeBubble(leftX + 0.22, botY + 0.04, 0.048, 0.16, { rateMul: 2.15, stretch: 0.18 });

      // One quick tiny bead near top-left
      makeBubble(leftX + 0.13, topY - 0.05, 0.054, 0.13, { rateMul: 1.50, heroWait: 0.24, stretch: 0.18 });
    }
  }

  _stepMergeBubbles(h) {
    if (this.mergeBubbles.length === 0) return;
    this.mergeWaveAge += h;
    const t = this.mergeWaveAge;

    const barX = this.barXFromPos(this.barPos);
    const rightLim = barX - this.wireR * 0.38;
    const leftX = -this.trackHalfX + this.wireR * 0.38;
    const topY = this.trackHalfY - this.wireR * 0.32;
    const botY = -topY;
    const chamberMidX = (leftX + rightLim) * 0.5;

    // 1. Pairwise surface-tension drift + Laplace film-drainage coalescence detection
    const n = this.mergeBubbles.length;
    for (let i = 0; i < n; i++) {
      const a = this.mergeBubbles[i];
      if (!a.alive || a.quickFade || t < a.spawnDelay || a.mergingInto || a.heroFusing) continue;

      for (let j = i + 1; j < n; j++) {
        const b = this.mergeBubbles[j];
        if (!b.alive || b.quickFade || t < b.spawnDelay || b.mergingInto || b.heroFusing) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) + 1e-5;
        const sumR = a.targetR + b.targetR;

        // Gentle capillary attraction when within range so nearby edge bubbles naturally gravitate & kiss!
        if (dist < sumR * 1.85 && dist > sumR * 0.65) {
          const pull = (1.0 - dist / (sumR * 1.85)) * 0.65 * h;
          const nx = dx / dist, ny = dy / dist;
          a.vx += nx * pull * (b.targetR / sumR);
          a.vy += ny * pull * (b.targetR / sumR);
          b.vx -= nx * pull * (a.targetR / sumR);
          b.vy -= ny * pull * (a.targetR / sumR);
        }

        // Soft contact separation before film ruptures
        if (dist < sumR * 0.86) {
          const push = (sumR * 0.86 - dist) * 6.5 * h;
          const nx = dx / dist, ny = dy / dist;
          a.vx -= nx * push; a.vy -= ny * push;
          b.vx += nx * push; b.vy += ny * push;
        }

        // Film drainage & stochastic snap-merge! Smaller bubbles drain faster (Laplace pressure ~ 1/R)
        if (dist < sumR * 1.18) {
          const big = a.targetR >= b.targetR ? a : b;
          const small = a.targetR >= b.targetR ? b : a;
          const laplaceRate = (0.085 / Math.max(0.032, small.targetR)) * small.rateMul;
          const prev = small.contactMap.get(big.id) || 0;
          const nextC = prev + h * laplaceRate;
          small.contactMap.set(big.id, nextC);

          // Pre-merge tension: both bubbles softly elongate toward each other right before snapping!
          if (nextC > 0.22) {
            const ang = Math.atan2(big.y - small.y, big.x - small.x);
            small.stretchAngle = ang;
            small.stretchVel += 1.4 * h;
          }

          if (nextC >= 0.42) {
            small.mergingInto = big;
            small.mergeStartX = small.x;
            small.mergeStartY = small.y;
            small.mergeProg = 0;
            // Small beads zip-snap in ~0.22s; larger domes take a juicy ~0.42s!
            small.mergeDur = Math.max(0.20, Math.min(0.46, 0.16 + small.targetR * 2.4));
            const ang = Math.atan2(big.y - small.y, big.x - small.x);
            small.stretchAngle = ang;
            big.stretchAngle = ang;
            small.stretchVel += 4.2;
            big.stretchVel += 2.6;
          }
        }
      }
    }

    // 2. Step each bubble's growth, active merge, hero absorption, and elastic deformation!
    for (let i = this.mergeBubbles.length - 1; i >= 0; i--) {
      const b = this.mergeBubbles[i];
      if (!b.alive) { this.mergeBubbles.splice(i, 1); continue; }

      if (b.quickFade) {
        b.r *= Math.exp(-14 * h);
        if (b.r < 0.004) b.alive = false;
        continue;
      }

      if (t < b.spawnDelay) {
        b.r = 0.0001;
        continue;
      }

      b.glowBoost *= Math.exp(-4.5 * h);

      // A) Actively being absorbed into a bigger neighbor!
      if (b.mergingInto) {
        const m = b.mergingInto;
        if (!m.alive || m.heroFusing) {
          b.mergingInto = null;
          b.pairFuse = 0;
        } else {
          b.mergeProg = Math.min(1, b.mergeProg + h / b.mergeDur);
          const u = b.mergeProg;
          const ease = u * u * (3 - 2 * u);
          b.pairFuse = Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.5);
          m.pairFuse = Math.max(m.pairFuse, b.pairFuse);

          const ang = Math.atan2(m.y - b.y, m.x - b.x);
          b.stretchAngle = ang;
          m.stretchAngle = ang;

          b.x = b.mergeStartX + (m.x - b.mergeStartX) * ease;
          b.y = b.mergeStartY + (m.y - b.mergeStartY) * ease;
          b.targetR = b.baseR * (1.0 - 0.72 * Math.pow(u, 1.8));
          b.glowBoost = Math.sin(u * Math.PI) * 0.85;

          if (u >= 0.99) {
            // Area conservation + juicy elastic expansion & capillary perpendicular rebound!
            m.targetR = Math.min(0.225, Math.hypot(m.targetR, b.baseR) * 1.05);
            m.rVel += 1.25 + b.baseR * 5.0;
            m.stretchVel -= 4.8; // snaps perpendicular after absorbing!
            m.glowBoost = 0.95;
            m.vx += (b.mergeStartX - m.x) * 0.25;
            m.vy += (b.mergeStartY - m.y) * 0.25;
            this._impulseZ(m.x, m.y, 0.16 + b.baseR * 1.1, 0.24);
            this.wob2Vel += 1.2;
            b.alive = false;
            continue;
          }
        }
      } else if (b.heroFusing) {
        // B) Actively opening a liquid neck & pouring smoothly into the ONE BIG HERO BUBBLE!
        b.fuseToMain = Math.min(1, b.fuseToMain + h / b.fuseDur);
        const u = b.fuseToMain;
        const ease = u * u * (3 - 2 * u);
        b.x = b.fuseStartX + (b.fuseTargetX - b.fuseStartX) * Math.pow(ease, 1.25);
        b.y = b.fuseStartY + (b.fuseTargetY - b.fuseStartY) * Math.pow(ease, 1.25);
        b.stretchAngle = Math.atan2(b.fuseTargetY - b.fuseStartY, b.fuseTargetX - b.fuseStartX);
        b.stretchVel += (0.28 * Math.sin(u * Math.PI) - b.stretch) * 28 * h;
        b.glowBoost = Math.max(b.glowBoost, Math.sin(u * Math.PI) * 0.80);

        if (u >= 0.36 && !b.absorbed) {
          b.absorbed = true;
          this.swellVel += 1.1 + b.targetR * 4.5;
          this.inflateVel += 1.8 + b.targetR * 5.0;
          this.wob2Vel += 2.2;
          this.wob3Vel -= 1.5;
          this._impulseZ(b.x, b.y, 0.26 + b.targetR * 0.6, 0.34);
          this._injectVortex(b.x, b.y, 0.36, (b.y >= 0 ? 1 : -1) * 2.4);
        }

        if (u >= 0.99) {
          b.alive = false;
          continue;
        }
      } else {
        // C) Free/settled organic bubble: gentle drift, decays pairFuse, checks if ready to gulp into Hero!
        b.pairFuse *= Math.exp(-7 * h);
        b.vx *= Math.exp(-3.5 * h);
        b.vy *= Math.exp(-3.5 * h);
        // Organic gentle liquid sway
        b.x += (b.vx + Math.cos(this.time * 1.9 + b.phase) * 0.014) * h;
        b.y += (b.vy + Math.sin(this.time * 2.3 + b.phase) * 0.016) * h;

        // Keep gently inside the glass chamber walls
        const pad = b.targetR * 0.56;
        if (b.x < leftX + pad) { b.x = leftX + pad; b.vx = Math.max(0, b.vx); }
        if (b.x > rightLim - pad) { b.x = rightLim - pad; b.vx = Math.min(0, b.vx); }
        if (b.y < botY + pad) { b.y = botY + pad; b.vy = Math.max(0, b.vy); }
        if (b.y > topY - pad) { b.y = topY - pad; b.vy = Math.min(0, b.vy); }

        // Check if any active neighbor is still close enough to coalesce with this bubble
        let hasCloseNeighbor = false;
        for (const o of this.mergeBubbles) {
          if (o === b || !o.alive || o.heroFusing) continue;
          if (o.mergingInto === b) { hasCloseNeighbor = true; break; }
          if (t < o.spawnDelay && Math.hypot(o.x - b.x, o.y - b.y) < (b.targetR + o.targetR) * 1.7) {
            hasCloseNeighbor = true; break;
          }
          if (!o.mergingInto && Math.hypot(o.x - b.x, o.y - b.y) < (b.targetR + o.targetR) * 1.48) {
            hasCloseNeighbor = true; break;
          }
        }

        // Once this cluster finishes merging into its big dome (or if it's a lone stray),
        // count down its own randomized heroWait so bubbles absorb into the ONE big bubble at varied organic rates!
        if (!hasCloseNeighbor && t > b.spawnDelay + 0.32) {
          b.heroWait -= h;
          if (b.heroWait <= 0) {
            b.heroFusing = true;
            b.fuseToMain = 0;
            b.fuseStartX = b.x;
            b.fuseStartY = b.y;
            const inDirX = chamberMidX - b.x;
            const inDirY = -b.y;
            const inLen = Math.hypot(inDirX, inDirY) + 1e-4;
            const pullDist = 0.16 + b.targetR * 0.65;
            b.fuseTargetX = b.x + (inDirX / inLen) * pullDist;
            b.fuseTargetY = b.y + (inDirY / inLen) * pullDist;
            b.stretchAngle = Math.atan2(inDirY, inDirX);
            b.stretchVel += 3.2;
          }
        }
      }

      // Spring-driven radius + area-preserving squash/stretch oscillation!
      const goalR = b.targetR * (1.0 + 0.03 * Math.sin(this.time * 2.9 + b.phase));
      b.rVel += ((goalR - b.r) * 175 - b.rVel * 11.5) * h;
      b.r = Math.max(0.002, b.r + b.rVel * h);

      const goalStretch = b.baseStretch + 0.045 * Math.sin(this.time * 3.4 + b.jitterSeed);
      b.stretchVel += ((goalStretch - b.stretch) * 95 - b.stretchVel * 7.2) * h;
      b.stretch = Math.max(-0.26, Math.min(0.36, b.stretch + b.stretchVel * h));
    }
  }

  _seedFilm() {
    const { nx, ny } = this;
    const ph = 1.4;
    for (let j = 0; j < ny; j++) {
      const v = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const u = i / (nx - 1);
        const idx = j * nx + i;
        const wave = 0.24 * Math.sin(u * 4.5 + ph) * Math.sin(v * Math.PI)
                   + 0.16 * Math.cos(u * 2.6 - v * 3.4 + ph * 0.7);
        this.thick[idx] = Math.max(0.08, Math.min(0.92, 0.18 + (1.0 - v) * 0.50 + wave));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        this.vx[idx] = Math.sin(v * Math.PI * 2 + ph) * 0.6;
        this.vy[idx] = Math.cos(u * Math.PI * 2 - ph) * 0.45;
      }
    }
    this._injectVortex(-0.30, 0.14, 0.48, 3.0);
    this._injectVortex(0.18, -0.16, 0.44, -2.6);
    for (let s = 0; s < 14; s++) this._stepFluid(0.025);
  }

  _localToGrid(lx, ly) {
    const u = lx / (this.trackHalfX * 2) + 0.5;
    const v = ly / (this.trackHalfY * 2) + 0.5;
    return [Math.max(0, Math.min(this.nx - 1, u * (this.nx - 1))), Math.max(0, Math.min(this.ny - 1, v * (this.ny - 1)))];
  }

  _impulseZ(lx, ly, amp, radiusLocal) {
    const [gx, gy] = this._localToGrid(lx, ly);
    const rx = (radiusLocal / (this.trackHalfX * 2)) * this.nx;
    const ry = (radiusLocal / (this.trackHalfY * 2)) * this.ny;
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

  _injectVortex(lx, ly, radiusLocal, strength) {
    const [gx, gy] = this._localToGrid(lx, ly);
    const rx = (radiusLocal / (this.trackHalfX * 2)) * this.nx;
    const ry = (radiusLocal / (this.trackHalfY * 2)) * this.ny;
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

  _injectWandShear(barX, velX) {
    const [gx] = this._localToGrid(barX, 0);
    const band = 6;
    const i0 = Math.max(1, Math.floor(gx - band * 1.5));
    const i1 = Math.min(this.nx - 2, Math.ceil(gx + band * 0.5));
    const cy = (this.ny - 1) * 0.5;
    for (let j = 1; j < this.ny - 1; j++) {
      const yn = (j - cy) / cy;
      const swirlY = Math.sin(yn * Math.PI) * velX * 0.6;
      const pushX = velX * (0.55 + 0.40 * (1 - yn * yn));
      for (let i = i0; i <= i1; i++) {
        const dx = (i - gx) / band;
        const w = Math.exp(-dx * dx * 1.9);
        const idx = j * this.nx + i;
        this.vx[idx] += pushX * w * 0.45;
        this.vy[idx] += swirlY * w * 0.52;
        const freshD = 0.30 + 0.32 * Math.cos(yn * 2.8 + this.time * 2.0);
        this.thick[idx] += (freshD - this.thick[idx]) * Math.min(0.45, Math.abs(velX) * 0.032 * w);
        this.z[idx] += velX * 0.008 * w * (1 - yn * yn);
        this.shimmer[idx] = Math.min(1, this.shimmer[idx] + Math.abs(velX) * w * 0.06);
      }
    }
  }

  _stepFluid(h) {
    const { nx, ny, vx, vy, vxTmp, vyTmp, div, press, pressTmp, curl, thick, thickTmp } = this;
    const advScale = h * 7.5;

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
    for (let iter = 0; iter < 6; iter++) {
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
    thick.set(thickTmp);
  }

  step(dt) {
    const h = Math.min(dt, 0.033);
    this.time += h;

    if (!this.dragging) this.barVel *= Math.exp(-11 * h);
    if (this.wasMoving) {
      const settleDelay = this.dragging ? 0.14 : 0.06;
      if (Math.abs(this.barVel) < 0.12) {
        this.stillTime += h;
        if (this.stillTime > settleDelay && this.moveCharge > 0.08) {
          if (this.mode === 'merge') {
            this._triggerCoalescingMerge(this.moveCharge);
          } else {
            // Take B: satisfying elastic puff + vortex shimmer right when the giant blown bubble settles!
            this.inflateVel += 4.2 * Math.min(1.2, this.moveCharge);
            this.wob2Vel += 4.5;
            this.wob3Vel -= 2.8;
            const bx = this.barXFromPos(this.barPos);
            this._impulseZ((bx - this.trackHalfX) * 0.5, 0, 0.24, 0.45);
          }
          this.wasMoving = false;
          this.moveCharge = 0;
          this.stillTime = 0;
        }
      } else {
        this.stillTime = 0;
      }
    }

    // Volumetric elastic springs
    const targetInflate = 1.0 + 0.045 * Math.sin(this.time * 2.2);
    this.inflateVel += ((targetInflate - this.inflate) * 85 - this.inflateVel * 7.2) * h;
    this.inflate += this.inflateVel * h;

    // Take A: swell from absorbed big edge bubbles decays slowly & gracefully
    const targetSwell = 0.0;
    this.swellVel += ((targetSwell - this.swell) * 18 - this.swellVel * 4.2) * h;
    this.swell = Math.max(0, Math.min(1.0, this.swell + this.swellVel * h));

    // Wobble harmonics (lusher, slower low-frequency jelly for giant Take B orb!)
    const wobK = this.mode === 'inflate' ? 58 : 88;
    const wobD = this.mode === 'inflate' ? 4.4 : 6.0;
    this.wob2Vel += (-this.wob2 * wobK - this.wob2Vel * wobD) * h;
    this.wob2 += this.wob2Vel * h;
    this.wob3Vel += (-this.wob3 * (wobK * 1.4) - this.wob3Vel * (wobD * 1.15)) * h;
    this.wob3 += this.wob3Vel * h;

    const targetLeanX = Math.max(-0.5, Math.min(0.5, -this.barVel * 0.16));
    this.leanX += (targetLeanX - this.leanX) * Math.min(1, h * 10);

    // Take B blown-bubble elastic lag & vertical inflation spring!
    if (this.mode === 'inflate') {
      this.blownVel += ((this.barPos - this.blownPos) * 72 - this.blownVel * 7.8) * h;
      this.blownPos = Math.max(0, Math.min(1.12, this.blownPos + this.blownVel * h));

      const targetRY = (this.trackHalfY - 0.015) + Math.pow(Math.max(0, this.blownPos), 0.84) * 0.52;
      this.blownRadiusYVel += ((targetRY - this.blownRadiusY) * 62 - this.blownRadiusYVel * 6.2) * h;
      this.blownRadiusY = Math.max(this.trackHalfY - 0.02, this.blownRadiusY + this.blownRadiusYVel * h);
    }

    if (this.mode === 'merge') this._stepMergeBubbles(h);

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

    // Nested bubbles gently float inside hero dome
    const barX = this.barXFromPos(this.barPos);
    for (let idx = 0; idx < this.nestedBubbles.length; idx++) {
      const nb = this.nestedBubbles[idx];
      const left = -this.trackHalfX + 0.22;
      const right = Math.max(left + 0.08, barX - 0.18);
      const frac = (idx + 0.44) / (this.nestedBubbles.length + 0.22);
      const tx = left + (right - left) * frac + Math.sin(this.time * 1.1 + nb.phase) * Math.min(0.06, (right - left) * 0.18);
      const spanY = this.mode === 'inflate' ? this.blownRadiusY * 0.34 : this.trackHalfY * 0.28;
      const ty = Math.cos(this.time * 1.3 + nb.phase) * spanY;
      nb.vx += ((tx - nb.x) * 24 - nb.vx * 5.6) * h;
      nb.vy += ((ty - nb.y) * 24 - nb.vy * 5.6) * h;
      nb.x += nb.vx * h;
      nb.y += nb.vy * h;
    }

    // Floating satellite bubbles
    for (let i = this.floatBubbles.length - 1; i >= 0; i--) {
      const b = this.floatBubbles[i];
      b.x += (b.vx + Math.sin(this.time * 4.2 + b.wobPhase) * 0.22) * h;
      b.y += b.vy * h;
      b.vx *= Math.exp(-2.0 * h);
      b.vy += 0.35 * h;
      b.vy *= Math.exp(-1.5 * h);
      b.life -= b.decay * h;
      if (b.life <= 0) this.floatBubbles.splice(i, 1);
    }
  }

  _drawGlossBubble(ctx, px, py, r, hue, alpha, squash = 1.0) {
    if (r < 1.2 || alpha <= 0.01) return;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(squash, 1 / squash);
    ctx.globalAlpha = alpha;

    const grad = ctx.createRadialGradient(-r * 0.22, -r * 0.22, r * 0.08, 0, 0, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.62, `hsla(${hue}, 72%, 76%, 0.16)`);
    grad.addColorStop(0.84, `hsla(${(hue + 55) % 360}, 85%, 64%, 0.48)`);
    grad.addColorStop(0.95, 'rgba(92, 96, 168, 0.56)');
    grad.addColorStop(1, 'rgba(255,255,255,0.92)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1.1, r * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, -Math.PI * 0.88, -Math.PI * 0.42);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(r * 0.42, r * 0.42, Math.max(0.8, r * 0.14), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  render() {
    const { gl, u } = this;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.texData);

    const barX = this.barXFromPos(this.barPos);
    const barHalfH = this._barHalfHeight(barX);
    const leftEdge = -this.trackHalfX + this.wireR * 0.25;
    const rightEdge = barX - this.wireR * 0.22;

    let bCenterX, bCenterY, bHalfX, bHalfY, rTR, rBR, rTL, rBL;

    if (this.mode === 'merge') {
      const w = Math.max(0.08, rightEdge - leftEdge);
      const swellPuff = this.swell * 0.055; // visibly swells plumper as it gulps each big edge bubble!
      bCenterX = (leftEdge + rightEdge) * 0.5;
      bCenterY = 0.0;
      bHalfX = w * 0.5 + 0.008;
      bHalfY = (this.trackHalfY - this.wireR * 0.24) + 0.008 + swellPuff;
      const c = Math.min(bHalfX * 0.44, Math.min(bHalfY * 0.44, this.trackCorner * 0.82));
      rTR = c; rBR = c; rTL = c; rBL = c;
    } else {
      // Take B (Inflate): massive buoyant 3D soap orb/pillow wet-pinned cleanly to BOTH left end & moving dewdrop bead!
      const w = Math.max(0.14, rightEdge - leftEdge);
      const liftY = Math.pow(Math.max(0, this.blownPos), 1.1) * 0.020 * Math.sin(this.time * 1.4);
      bCenterX = (leftEdge + rightEdge) * 0.5;
      bCenterY = liftY;
      bHalfX = w * 0.5 + 0.008;
      bHalfY = this.blownRadiusY * (0.98 + 0.035 * this.inflate);

      // Smoothly becomes rounder & more bulbous as it inflates!
      const minHalf = Math.min(bHalfX, bHalfY);
      const roundFrac = 0.78 + 0.20 * Math.min(1, this.blownPos * 1.15);
      const c = minHalf * roundFrac;
      rTR = c; rBR = c; rTL = c; rBL = c;
    }

    const mCount = Math.min(MAX_MERGE, this.mergeBubbles.length);
    for (let i = 0; i < mCount; i++) {
      const b = this.mergeBubbles[i];
      this.mergeUniform[i * 4]       = b.x;
      this.mergeUniform[i * 4 + 1]   = b.y;
      this.mergeUniform[i * 4 + 2]   = b.r;
      this.mergeUniform[i * 4 + 3]   = b.phase;
      this.mergeMetaUniform[i * 4]       = b.fuseToMain;
      this.mergeMetaUniform[i * 4 + 1]   = b.pairFuse;
      this.mergeMetaUniform[i * 4 + 2]   = b.glowBoost;
      this.mergeMetaUniform[i * 4 + 3]   = b.alive ? 1.0 : 0.0;
      this.mergeShapeUniform[i * 4]      = b.stretch;
      this.mergeShapeUniform[i * 4 + 1]  = b.stretchAngle;
      this.mergeShapeUniform[i * 4 + 2]  = b.lobeAmp;
      this.mergeShapeUniform[i * 4 + 3]  = b.jitterSeed;
    }

    gl.uniform1i(u.uSim, 0);
    gl.uniform2f(u.uRes, this.glCanvas.width, this.glCanvas.height);
    gl.uniform2f(u.uSize, this.width, this.height);
    gl.uniform2f(u.uTrackHalf, this.trackHalfX, this.trackHalfY);
    gl.uniform1f(u.uTrackCorner, this.trackCorner);
    gl.uniform1f(u.uWireR, this.wireR);
    gl.uniform1i(u.uMode, this.modeId);

    gl.uniform1f(u.uBarX, barX);
    gl.uniform1f(u.uBarHalfH, barHalfH);
    gl.uniform1f(u.uBarVel, this.barVel);
    gl.uniform1f(u.uBarPos, this.barPos);
    gl.uniform1f(u.uTime, this.time);

    gl.uniform1f(u.uInflate, Math.max(0.1, this.inflate));
    gl.uniform1f(u.uSwell, this.swell);
    gl.uniform2f(u.uBubbleCenter, bCenterX, bCenterY);
    gl.uniform2f(u.uBubbleHalf, bHalfX, bHalfY);
    gl.uniform4f(u.uBubbleCorners, rTR, rBR, rTL, rBL);
    gl.uniform2f(u.uWobble, this.wob2, this.wob3);
    gl.uniform2f(u.uLean, this.leanX, this.leanY);

    gl.uniform4fv(u.uMerge, this.mergeUniform);
    gl.uniform4fv(u.uMergeMeta, this.mergeMetaUniform);
    gl.uniform4fv(u.uMergeShape, this.mergeShapeUniform);
    gl.uniform1i(u.uMergeCount, mCount);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2D FX pass (subtle inner reflection bubble + floating bubbles)
    const ctx = this.fxCtx;
    const dpr = this.dpr;
    const w = this.fxCanvas.width;
    const h = this.fxCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const toPx = (lx, ly) => [
      ((lx / this.aspect) * 0.5 + 0.5) * w,
      (0.5 - ly * 0.5) * h,
    ];

    for (const nb of this.nestedBubbles) {
      if (nb.x > barX - 0.14) continue;
      const [px, py] = toPx(nb.x, nb.y);
      const sq = 1.0 + Math.sin(this.time * 2.6 + nb.phase) * 0.05;
      const rScale = this.mode === 'inflate' ? (0.85 + 0.55 * this.blownPos) : 1.0;
      this._drawGlossBubble(ctx, px, py, nb.r * dpr * rScale, nb.hue, 0.78, sq);
    }

    for (const fb of this.floatBubbles) {
      const [px, py] = toPx(fb.x, fb.y);
      const sq = 1.0 + Math.sin(this.time * 7.2 + fb.wobPhase) * 0.07;
      const a = Math.min(1, fb.life * 1.4);
      this._drawGlossBubble(ctx, px, py, fb.r * dpr * (0.7 + 0.3 * fb.life), fb.hue, a * 0.90, sq);
    }
  }
}
// <<< engine
// >>> element (src/elements/slider.js)
// <soap-slider>: a range slider whose bead is a soap bubble. Let go and small bubbles bloom along the edges of the
// track, swell, and coalesce back into the bead.
class SoapSlider extends SoapFilm.Base {
  static formAssociated = true;
  static touch = 'pan-y';
  static observedAttributes = ['disabled', 'label'];
  static size = (w) => w * 0.5625;
  static css = `.box{cursor:ew-resize}:host([disabled]) .box{cursor:not-allowed;opacity:.55}`;
  constructor() { super(); this.internals = this.attachInternals?.(); }
  get min() { return this.num('min', 0); }
  get max() { const m = this.num('max', 100); return m > this.min ? m : this.min + 100; }
  get step() { const s = this.num('step', 1); return s > 0 ? s : 1; }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get value() { return this.val ?? this.snap(this.num('value', (this.min + this.max) / 2)); }
  set value(v) { this.set(+v); }
  get name() { return this.getAttribute('name'); }
  get form() { return this.internals?.form; }
  snap(v) { const { min, max, step } = this; return +Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step)).toFixed(6); }
  pos() { return (this.value - this.min) / (this.max - this.min); }
  overlay() { return `<input class="sr" type="range" part="input">`; }
  attributeChangedCallback() { if (!this.i) return; this.i.disabled = this.disabled; this.i.setAttribute('aria-label', this.attr('label', 'Slider')); }
  formResetCallback() { this.set(this.num('value', (this.min + this.max) / 2)); }
  create(mount, o) { return new SoapSliderVariant(mount, { ...o, mode: 'merge', value: this.pos() }); }
  // move to a value; from code or the keyboard the bead glides there on its own
  set(v, fromPointer) {
    const nv = this.snap(v);
    if (nv === this.val) return false;
    this.val = nv;
    if (this.i) this.i.value = nv;
    this.internals?.setFormValue(String(nv));
    const e = this.engine;
    if (e && !fromPointer) { this.glide = { from: e.barPos, to: this.pos(), t: 0 }; e.setDragging(true); }
    return true;
  }
  beforeStep(dt) {
    const e = this.engine;
    if (!e) return;
    if (this.glide) {
      const g = this.glide; g.t = Math.min(1, g.t + dt / 0.28);
      const k = g.t * g.t * (3 - 2 * g.t);
      e.dragTo(g.from + (g.to - g.from) * k);
      if (g.t >= 1) { this.glide = null; if (!this.drag) e.setDragging(false); }
    }
    const speed = Math.abs(e.barPos - (this.lastPos ?? e.barPos)) / Math.max(dt, 1e-3);
    this.lastPos = e.barPos;
    this.audio?.updateGlide(this.drag || this.glide ? Math.min(0.8, speed * 0.35) : 0);
  }
  wire() {
    const i = this.i = this.$('input');
    i.min = this.min; i.max = this.max; i.step = this.step; i.value = this.value;
    i.setAttribute('aria-label', this.attr('label', 'Slider')); i.disabled = this.disabled;
    this.val = this.snap(this.num('value', (this.min + this.max) / 2));
    this.internals?.setFormValue(String(this.val));
    i.addEventListener('input', (ev) => { ev.stopPropagation(); if (this.set(+i.value)) this.emit('input'); });
    i.addEventListener('change', (ev) => { ev.stopPropagation(); this.emit('change'); });
    const box = this.box;
    const fromX = (ev) => {
      const e = this.engine; if (!e) return;
      const [x] = this.local(ev);
      const lx = (x / e.width * 2 - 1) * e.aspect;
      const p = Math.max(0, Math.min(1, (lx - e.barXMin()) / (e.barXMax() - e.barXMin())));
      this.glide = null;
      e.dragTo(p);
      if (this.set(this.min + p * (this.max - this.min), true)) this.emit('input');
    };
    let from = null, grabbed = 0;
    const start = (ev) => { this.drag = true; grabbed = this.value; box.setPointerCapture?.(ev.pointerId); this.engine?.setDragging(true); this.audio?.playTap(820); fromX(ev); };
    box.addEventListener('pointerdown', (ev) => {
      if (this.disabled || !this.engine) return;
      i.focus({ preventScroll: true });
      if (ev.pointerType === 'touch') { from = [ev.clientX, ev.clientY]; return; }
      start(ev);
    });
    box.addEventListener('pointermove', (ev) => {
      // a finger only takes the slider once it has moved sideways, so the page still scrolls past it
      if (from && Math.abs(ev.clientX - from[0]) > 6 && Math.abs(ev.clientX - from[0]) > Math.abs(ev.clientY - from[1])) { from = null; start(ev); }
      if (this.drag) fromX(ev);
    });
    const end = () => {
      from = null;
      if (!this.drag) return;
      this.drag = false; this.engine?.setDragging(false);
      if (this.value !== grabbed) this.emit('change');
    };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }
  save() { return null; }
}
SoapFilm.define('soap-slider', SoapSlider);
// <<< element
})();
