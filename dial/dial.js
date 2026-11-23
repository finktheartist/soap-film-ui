// Soap Film Rotary dial: A rotary knob that is a disc of soap film. Turn it and the film spins into a vortex that
// follows how fast you turn, with a tick at every step; at either end it bounces off a soft, rubbery stop.
//
// One file, no dependencies. Load it with a script tag and use <soap-dial value="28" label="Volume"></soap-dial>.
// Read el.value; it fires input while it turns and change when it is let go. With a name it is sent with its form.
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
if (customElements.get('soap-dial')) return;
// >>> engine (src/engines/dial.js)
// ============================================================================
// SOAP FILM · ROTARY SOAP DIAL (SPINNING NAVIER-STOKES VORTEX KNOB)
// ============================================================================
// A minimal circular volume/level dial encased in a live 3D iridescent soap
// dome backed by an 80x80 circular-domain 2D Navier-Stokes fluid solver.
// Rotating the dial injects azimuthal shear and trailing wake eddies into the
// thin-film thickness field, twisting interference colors into real swirling
// Marangoni spirals that shear into counter-rotating vortices on reversal and
// lazily unwind after release.

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

uniform sampler2D uSim;       // R: advected vortex thickness, G: z-wave, B: shimmer
uniform vec2 uRes;
uniform vec2 uSize;
uniform float uTime;

// Dial main dome: (cx, cy, rNdc, wobAmp)
uniform vec4 uDial;
// Dial state: (wobPhase, angleNdc, spinSpeed 0..1, swirlPhase)
uniform vec4 uDialMeta;
// Orbiting soap indicator bead: (bx, by, brNdc, hoverDrag 0..1)
uniform vec4 uBead;

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

// High-chroma stylized-physical thin-film interference spectrum (Soap Film family)
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
  float coh = exp(-max(0.0, dNm - 160.0) * 0.00040);
  for (int i = 0; i < 6; i++) {
    float phase = 6.2831853 * opd / WL[i];
    float s = sin(phase * 0.5);
    float r = mix(0.5, s * s, coh);
    col += WRGB[i] * r;
  }
  col *= vec3(1.14, 1.05, 1.18);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.62);
  col = pow(clamp(col, 1e-4, 1.25), vec3(0.92));

  float newton = smoothstep(14.0, 62.0, dNm);
  return clamp(col * newton, 0.0, 1.25);
}

vec4 over(vec4 src, vec4 dst) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

float sdDialSoap(vec2 p, out float outBeadMix) {
  vec2 dp = p - uDial.xy;
  float r = max(0.05, uDial.z);
  float ang = atan(dp.y, dp.x);
  float ph = uDialMeta.x;
  float spin = uDialMeta.z;

  // Living breath + spin-excited capillary harmonic ripples on the rim!
  float wob = uDial.w * (0.65 * cos(2.0 * ang + ph) + 0.35 * sin(3.0 * ang - ph * 1.35)) * r;
  float spinRipple = spin * 0.0085 * sin(4.0 * ang - uDialMeta.w * 2.2) * r;
  float breath = 0.0022 * sin(2.0 * ang + uTime * 2.0) * r;
  float dDome = length(dp) - r - wob - spinRipple - breath;

  // Orbiting 3D soap indicator bead fused cleanly into the dial's outer rim via subtle liquid meniscus collar!
  vec2 bp = p - uBead.xy;
  float dBead = length(bp) - max(0.01, uBead.z);
  float kCollar = 0.048 + uBead.w * 0.014;
  float dTotal = smin(dDome, dBead, kCollar);
  outBeadMix = smoothstep(0.032, -0.015, dBead - dDome);
  return dTotal;
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * aspect, (vUv.y * 2.0 - 1.0));
  float px = 2.0 / uSize.y;

  vec4 outCol = vec4(0.0);

  if (length(p - uDial.xy) < uDial.z + 0.34) {
    float beadMix;
    float sd = sdDialSoap(p, beadMix);

    // --- 1. SOFT FLOATING GROUND SHADOW BENEATH DIAL DOME ---
    {
      vec2 shPos = uDial.xy + vec2(0.018, -0.058);
      float rSh = uDial.z * 1.18;
      float dSh = length(p - shPos);
      float sh = smoothstep(rSh * 1.28, uDial.z * 0.35, dSh) * 0.052;
      if (sh > 0.001) {
        outCol = over(vec4(vec3(0.24, 0.26, 0.44) * sh, sh), outCol);
      }
    }

    // --- 2. 3D VOLUMETRIC SPINNING NAVIER-STOKES SOAP DIAL DOME + RIM BEAD ---
    float mask = smoothstep(px * 1.65, -px * 1.65, sd);
    if (mask > 0.001) {
      float eps = 0.0038;
      float bmTmp;
      vec2 rawGrad = vec2(
        sdDialSoap(p + vec2(eps, 0.0), bmTmp) - sdDialSoap(p - vec2(eps, 0.0), bmTmp),
        sdDialSoap(p + vec2(0.0, eps), bmTmp) - sdDialSoap(p - vec2(0.0, eps), bmTmp)
      ) / (2.0 * eps);
      vec2 gSmooth = rawGrad / sqrt(dot(rawGrad, rawGrad) + 0.025);

      vec2 dp = p - uDial.xy;
      float rNorm = clamp(length(dp) / max(0.05, uDial.z), 0.0, 1.35);
      float dIn = max(0.0, -sd);
      float scaleSafe = mix(uDial.z, max(0.032, uBead.z), beadMix * 0.85);
      float normDepth = clamp(dIn / max(0.02, scaleSafe), 0.0, 1.0);
      float rho = 1.0 - normDepth;

      // Sample 80x80 circular-domain 2D Navier-Stokes vortex fluid!
      vec2 simUv = clamp((dp / (uDial.z * 2.15)) + 0.5, 0.004, 0.996);
      vec2 texel = 1.0 / vec2(textureSize(uSim, 0));
      vec4 simC = texture(uSim, simUv);
      float zL = texture(uSim, simUv - vec2(texel.x, 0.0)).g;
      float zR = texture(uSim, simUv + vec2(texel.x, 0.0)).g;
      float zD = texture(uSim, simUv - vec2(0.0, texel.y)).g;
      float zU = texture(uSim, simUv + vec2(0.0, texel.y)).g;
      // Preserve razor clarity right over central numeric readout, unleash dramatic vortex ripples across outer ring!
      float vortexAperture = smoothstep(0.22, 0.58, max(rNorm, beadMix));
      vec2 gradZ = vec2(zR - zL, zU - zD) * 6.4 * (0.20 + 0.80 * vortexAperture);

      // Subtle spiral capillary normal modulation driven by Navier-Stokes fluid thickness gradient!
      float tL = texture(uSim, simUv - vec2(texel.x, 0.0)).r;
      float tR = texture(uSim, simUv + vec2(texel.x, 0.0)).r;
      float tD = texture(uSim, simUv - vec2(0.0, texel.y)).r;
      float tU = texture(uSim, simUv + vec2(0.0, texel.y)).r;
      vec2 gradT = vec2(tR - tL, tU - tD) * (0.65 + 1.15 * uDialMeta.z) * vortexAperture;

      // Smooth pillow dome profile (gently curved across outer vortex band, glassy flat center)
      float domeSteep = pow(clamp(rho, 1e-4, 0.995), mix(1.45, 1.02, beadMix)) * 0.92;
      vec2 nXY = gSmooth * domeSteep + gradT - gradZ;
      float nXY2 = dot(nXY, nXY);
      vec3 N = normalize(vec3(nXY, sqrt(max(0.06, 1.0 - min(0.94, nXY2)))));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float NdotV = clamp(dot(N, V), 0.06, 1.0);
      float slopeMag = length(gradZ) + length(gradT) * 0.85;

      float fres = pow(max(1e-4, 1.0 - NdotV), 2.10);
      float razorRim = pow(max(1e-4, 1.0 - NdotV), 4.8);

      // Resolution-adaptive crisp optical rim contour along dial AND fused indicator bead
      float rimOff = max(0.028, min(0.16, px * 1.30 / max(0.02, scaleSafe)));
      float ioArg = (normDepth - rimOff) / max(0.022, rimOff * 0.72);
      float innerOutline = exp(-(ioArg * ioArg));
      float hairOff = min(0.028, px * 0.52 / max(0.02, scaleSafe));
      float owArg = (normDepth - hairOff) / max(0.016, px * 0.55 / max(0.02, scaleSafe));
      float outerWhiteHair = exp(-(owArg * owArg));

      // SWIRLING NAVIER-STOKES THIN-FILM INTERFERENCE!
      // simC.r carries genuine advected spiral streaks & counter-rotating shear curls!
      float ang = atan(dp.y, dp.x);
      float spiralHarmonic = 0.5 + 0.5 * sin(ang * 2.0 - rNorm * 5.8 + uDialMeta.w * 0.85 + simC.r * 5.4);
      float dNmVortex = mix(135.0, 820.0, simC.r * 0.78 + spiralHarmonic * 0.22);
      float dNm = dNmVortex + fres * 245.0 + beadMix * 95.0;

      float sinT2 = (1.0 - NdotV * NdotV) / (1.333 * 1.333);
      float cosTheta = sqrt(max(0.22, 1.0 - sinT2));
      vec3 irid = bubbleIridescence(dNm, cosTheta);

      // Crisp curved Venetian-glass studio specular crescents + twinkling diamond starburst
      vec3 L1 = normalize(vec3(-0.56, 0.78, 0.48));
      vec3 H1 = normalize(L1 + V);
      float ndh1 = max(0.0, dot(N, H1));
      float arc1 = smoothstep(0.91, 0.965, ndh1) * 0.62 + smoothstep(0.974, 0.994, ndh1) * 0.92;

      vec3 L2 = normalize(vec3(0.68, -0.56, 0.44));
      vec3 H2 = normalize(L2 + V);
      float ndh2 = max(0.0, dot(N, H2));
      float arc2 = smoothstep(0.91, 0.97, ndh2) * 0.44;

      vec2 pNorm = dp / max(0.05, uDial.z);
      float skyArc = smoothstep(0.22, 0.90, -pNorm.x * 0.55 + pNorm.y * 0.85) * smoothstep(0.16, 0.80, 1.0 - NdotV) * 0.26;

      vec2 starCenter = vec2(-0.50, 0.56);
      vec2 dStar = (pNorm - starCenter) * 3.8;
      float rStar = length(dStar);
      float rayH = exp(-abs(dStar.y) * 26.0) * exp(-abs(dStar.x) * 4.0);
      float rayV = exp(-abs(dStar.x) * 26.0) * exp(-abs(dStar.y) * 4.0);
      vec2 dDiag = vec2(dStar.x + dStar.y, dStar.x - dStar.y) * 0.7071;
      float rayD = (exp(-abs(dDiag.y) * 34.0) * exp(-abs(dDiag.x) * 7.0)
                  + exp(-abs(dDiag.x) * 34.0) * exp(-abs(dDiag.y) * 7.0)) * 0.50;
      float coreDot = exp(-rStar * rStar * 22.0);
      float twinkle = 0.82 + 0.18 * sin(uTime * (4.6 + uDialMeta.z * 6.0));
      float starburst = (coreDot * 0.95 + (rayH + rayV + rayD) * smoothstep(0.80, 0.0, rStar) * 0.85)
                      * twinkle * smoothstep(0.35, 0.80, ndh1 + 0.20) * (0.65 + 0.45 * uDialMeta.z);

      float specArc = clamp(arc1 + arc2 + skyArc + starburst, 0.0, 1.50) * (0.20 + 0.80 * vortexAperture);

      // Swirling sparkle specks advected through the Marangoni vortex!
      vec2 spGrid = (dp + vec2(simC.r * 0.34, -simC.g * 0.26)) * 22.0;
      vec2 spCell = floor(spGrid);
      vec2 spF = fract(spGrid) - 0.5;
      float spRnd = hash21(spCell);
      float spDot = smoothstep(0.15, 0.02, length(spF)) * step(0.942 - uDialMeta.z * 0.032, spRnd)
                  * (0.45 + 0.55 * sin(uTime * 6.5 + spRnd * 40.0))
                  * (0.28 + 0.65 * fres + simC.b * 0.8) * vortexAperture;

      // Rich swirling iridescent vortex band across mid-to-outer dome!
      float vortexRibbon = vortexAperture * (0.28 + 0.32 * uDialMeta.z + 0.38 * smoothstep(0.18, 0.85, abs(simC.r - 0.5) * 2.0));
      vec3 contourCol = mix(vec3(0.36, 0.40, 0.66), irid * 0.66 + vec3(0.18, 0.16, 0.36), 0.52);
      vec3 domeColor = mix(vec3(0.95, 0.97, 1.0), irid * 0.96 + vec3(0.13, 0.16, 0.24), 0.92);

      vec3 col = mix(vec3(0.97, 0.98, 1.0), domeColor, clamp(0.08 + fres * 0.82 + vortexRibbon * 0.72 + slopeMag * 0.42 + beadMix * 0.24, 0.0, 1.0));
      col = mix(col, contourCol, clamp(innerOutline * 0.52 + razorRim * 0.46, 0.0, 0.82));
      float crescentBand = smoothstep(0.06, 0.72, max(fres, vortexRibbon * 0.82)) * (1.0 - outerWhiteHair * 0.58);
      col = mix(col, clamp(irid * 1.18 + vec3(0.07, 0.06, 0.12), 0.0, 1.0), crescentBand * (0.58 + 0.24 * vortexAperture));
      col = mix(col, vec3(1.0, 0.998, 1.0), clamp(specArc * 0.92 + outerWhiteHair * 0.84 + spDot * 0.85, 0.0, 0.99));

      float rimAlpha = innerOutline * 0.48 + outerWhiteHair * 0.74 + razorRim * 0.54;
      // Ultra-clear center over bold readout (0.025) blooming into lush iridescent vortex bands across outer 70%!
      float alpha = clamp(
        0.024 + vortexRibbon * (0.34 + 0.16 * uDialMeta.z) + fres * (0.66 + 0.16 * beadMix) + rimAlpha + specArc * 0.82 + slopeMag * 0.30 + spDot * 0.56,
        0.0,
        0.96
      );

      vec4 dialLayer = vec4(col * (alpha * mask), alpha * mask);
      outCol = over(dialLayer, outCol);
    }
  }

  fragColor = outCol;
}
`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(s));
  }
  return s;
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

class SoapRotaryDial {
  constructor(container, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.aspect = this.width / this.height;
    this.dpr = opts.dpr || 2;
    this.audio = opts.audio || null;
    this.label = opts.label || 'VOLUME';
    this.format = opts.format || null;
    this.onChange = opts.onChange || (() => {});

    const scale = Math.min(1.0, (this.width - 40) / 340, (this.height - 40) / 290);
    this.scale = scale;
    this.cx = this.width * 0.5;
    this.cy = this.height * 0.505;
    this.rBaseCss = 86 * scale;
    this.rScaleCss = 113 * scale;
    this.rBeadCss = 13.5 * scale;

    // 270-degree precision arc in CSS screen angles (0 = 3 o'clock, CW positive):
    // Start = +135deg (7:30 o'clock), End = +405deg (4:30 o'clock) -> 270deg clockwise sweep!
    this.angMinCss = (135 * Math.PI) / 180;
    this.angMaxCss = (405 * Math.PI) / 180;
    this.angSpan = this.angMaxCss - this.angMinCss;

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

    // High-resolution 80x80 circular-domain 2D Navier-Stokes vortex fluid!
    this.nx = 80;
    this.ny = 80;
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

    this.reset(opts.initialValue ?? 0.28);
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

    this.u = {};
    for (const n of ['uSim', 'uRes', 'uSize', 'uTime', 'uDial', 'uDialMeta', 'uBead']) {
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }
  }

  reset(initialVal = 0.28) {
    this.time = 1.0;
    this.value = Math.max(0, Math.min(1, initialVal)); // 0..1
    this.angVel = 0; // radians / sec in CSS clockwise coords
    this.swirlPhase = 0;
    this.spinIntensity = 0;
    this.rCss = this.rBaseCss;
    this.rVel = 0;
    this.wobAmp = 0;
    this.wobPhase = 0.4;
    this.wobFreq = 12.5;
    this.hovered = false;
    this.dragging = false;
    this.hoverMix = 0;
    this.lastPtrAng = 0;
    this.lastTickStep = Math.round(this.value * 24);

    this._seedVortexFilm();
  }

  currentAngleCss() {
    return this.angMinCss + this.value * this.angSpan;
  }

  beadStagePos() {
    const a = this.currentAngleCss();
    const r = this.rCss + 2.5 * this.scale;
    return {
      x: this.cx + Math.cos(a) * r,
      y: this.cy + Math.sin(a) * r,
    };
  }

  hitTest(sx, sy) {
    const d = Math.hypot(sx - this.cx, sy - this.cy);
    return d <= this.rScaleCss + 12 * this.scale;
  }

  setHovered(isHov) {
    if (isHov !== this.hovered) {
      this.hovered = isHov;
      if (isHov) this.wobAmp = Math.max(this.wobAmp, 0.026);
    }
  }

  pointerDown(sx, sy) {
    if (!this.hitTest(sx, sy)) return false;
    this.audio?.unlock();
    this.dragging = true;
    this.hovered = true;
    this.lastPtrAng = Math.atan2(sy - this.cy, sx - this.cx);
    this.wobAmp = Math.max(this.wobAmp, 0.042);
    this.audio?.playTap(640);
    return true;
  }

  pointerMove(sx, sy, dt = 1 / 60) {
    if (!this.dragging) {
      this.setHovered(this.hitTest(sx, sy));
      return;
    }
    const ang = Math.atan2(sy - this.cy, sx - this.cx);
    let delta = ang - this.lastPtrAng;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.lastPtrAng = ang;

    const instVel = delta / Math.max(0.008, dt);
    this.angVel = this.angVel * 0.55 + Math.max(-16, Math.min(16, instVel)) * 0.45;
    this._applyAngleDelta(delta, true);
  }

  pointerUp() {
    if (!this.dragging) return;
    this.dragging = false;
    // Clamp release coasting angular velocity to a luxurious silky spin
    this.angVel = Math.max(-11.0, Math.min(11.0, this.angVel * 0.72));
  }

  nudge(deltaVal) {
    this.audio?.unlock();
    const deltaAng = deltaVal * this.angSpan;
    this.angVel += Math.sign(deltaAng) * 3.8;
    this._applyAngleDelta(deltaAng, true);
  }

  _applyAngleDelta(deltaAng, isUser) {
    const prevVal = this.value;
    const rawVal = this.value + deltaAng / this.angSpan;
    if (rawVal < 0 || rawVal > 1) {
      // Elastic rubbery soap stop at 0 or 100!
      const overshot = rawVal < 0 ? -rawVal : rawVal - 1;
      this.value = Math.max(0, Math.min(1, rawVal));
      if (Math.abs(this.angVel) > 1.2) {
        this.wobAmp = Math.max(this.wobAmp, Math.min(0.075, 0.03 + overshot * 0.25));
        this.rVel += 26 * this.scale;
        this._impulseRingWave(0.32);
        this.angVel *= -0.25;
      } else {
        this.angVel *= 0.2;
      }
    } else {
      this.value = rawVal;
    }

    const stepIdx = Math.round(this.value * 24);
    if (stepIdx !== this.lastTickStep) {
      this.lastTickStep = stepIdx;
      this.audio?.playDialTick(this.value);
    }

    if (Math.abs(this.value - prevVal) > 1e-5) {
      this.onChange(Math.round(this.value * 100), this.value);
    }
  }

  _seedVortexFilm() {
    const { nx, ny } = this;
    for (let j = 0; j < ny; j++) {
      const y = (j / (ny - 1)) * 2 - 1;
      for (let i = 0; i < nx; i++) {
        const x = (i / (nx - 1)) * 2 - 1;
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        const idx = j * nx + i;
        // Rich initial multi-band spiral thickness so even at rest it looks like blown liquid glass!
        const bands = 0.26 * Math.sin(a * 2.0 - r * 5.2 + 0.6)
                    + 0.16 * Math.cos(a * 3.0 + r * 3.8 - 0.9);
        this.thick[idx] = Math.max(0.06, Math.min(0.94, 0.48 + bands));
        this.z[idx] = 0;
        this.zPrev[idx] = 0;
        this.shimmer[idx] = 0.08;
        // Gentle initial azimuthal convection curl
        const swirl = Math.exp(-Math.pow((r - 0.65) / 0.35, 2)) * 0.65;
        this.vx[idx] = -y * swirl;
        this.vy[idx] = x * swirl;
      }
    }
    for (let s = 0; s < 14; s++) this._stepFluid(0.024);
  }

  _injectRotaryVortex(angVelCss, beadAngCss, h) {
    // Injects authentic azimuthal shear + trailing Marangoni thickness plume from the orbiting indicator bead!
    // NOTE: CSS screen angles increase clockwise, whereas fluid texture Y-up has CCW positive -> flip sign!
    const omega = -angVelCss;
    const absW = Math.min(14.0, Math.abs(omega));
    if (absW < 0.02) return;

    const { nx, ny, vx, vy, thick, shimmer, z } = this;
    const beadAngNdc = -beadAngCss;
    const bx = Math.cos(beadAngNdc) * 0.84;
    const by = Math.sin(beadAngNdc) * 0.84;

    const shearGain = Math.min(2.4, absW * 0.24) * Math.sign(omega) * h * 26.0;
    const plumePhase = this.time * 4.5 + this.swirlPhase * 1.2;

    for (let j = 1; j < ny - 1; j++) {
      const y = (j / (ny - 1)) * 2 - 1;
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const x = (i / (nx - 1)) * 2 - 1;
        const r = Math.hypot(x, y);
        if (r > 1.02 || r < 0.08) continue;

        const idx = row + i;
        // Azimuthal boundary shear strongest in outer ring (r = 0.55..0.95) -> twists fluid into true spirals!
        const tx = -y / r;
        const ty = x / r;
        const rimProfile = Math.exp(-Math.pow((r - 0.78) / 0.28, 2));
        vx[idx] += tx * shearGain * rimProfile;
        vy[idx] += ty * shearGain * rimProfile;

        // Trailing iridescent wake plume + Kelvin-Helmholtz ripple right behind the rotating indicator bead!
        const dbx = x - bx;
        const dby = y - by;
        const d2 = dbx * dbx + dby * dby;
        if (d2 < 0.16) {
          const wBead = Math.exp(-d2 * 18.0);
          const freshThick = 0.50 + 0.44 * Math.sin(plumePhase + r * 6.0);
          thick[idx] += (freshThick - thick[idx]) * Math.min(0.45, wBead * absW * 0.09);
          // Paired wake swirl + capillary surface wave
          vx[idx] += (-dby * 2.2 + tx * 1.4) * Math.sign(omega) * absW * wBead * h * 3.5;
          vy[idx] += (dbx * 2.2 + ty * 1.4) * Math.sign(omega) * absW * wBead * h * 3.5;
          z[idx] += Math.sin(plumePhase * 2.0) * 0.045 * Math.min(1.0, absW * 0.25) * wBead;
          shimmer[idx] = Math.min(1.0, shimmer[idx] + wBead * absW * 0.025);
        }
      }
    }
  }

  _impulseRingWave(amp) {
    const { nx, ny, z, shimmer } = this;
    for (let j = 1; j < ny - 1; j++) {
      const y = (j / (ny - 1)) * 2 - 1;
      for (let i = 1; i < nx - 1; i++) {
        const x = (i / (nx - 1)) * 2 - 1;
        const r = Math.hypot(x, y);
        const w = Math.exp(-Math.pow((r - 0.78) / 0.16, 2));
        if (w < 0.02) continue;
        const idx = j * nx + i;
        z[idx] += amp * w;
        shimmer[idx] = Math.min(1, shimmer[idx] + Math.abs(amp) * w);
      }
    }
  }

  _stepFluid(h) {
    const { nx, ny, vx, vy, vxTmp, vyTmp, div, press, pressTmp, curl, thick, thickTmp } = this;
    // Stronger advection scale so swirling spiral arms stay ultra crisp and lively!
    const advScale = h * 11.5;

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        curl[idx] = 0.5 * ((vy[idx + 1] - vy[idx - 1]) - (vx[idx + nx] - vx[idx - nx]));
      }
    }
    const vortAmp = 2.6 * h;
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

    // Low viscous decay so the vortex coasts and unwinds smoothly for seconds after release!
    const damp = Math.exp(-0.62 * h);
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

    // Gentle thickness advection with minimal diffusion so spiral interference ribbons stay razor-distinct!
    const drain = 0.055 * h;
    for (let j = 0; j < ny; j++) {
      const y = (j / (ny - 1)) * 2 - 1;
      for (let i = 0; i < nx; i++) {
        const x = (i / (nx - 1)) * 2 - 1;
        const idx = j * nx + i;
        let sx = Math.max(0.001, Math.min(nx - 1.002, i - vx[idx] * advScale));
        let sy = Math.max(0.001, Math.min(ny - 1.002, j - vy[idx] * advScale));
        const i0 = sx | 0, j0 = sy | 0;
        const fx = sx - i0, fy = sy - j0;
        const r0 = j0 * nx + i0, r1 = r0 + nx;
        let val =
          thick[r0] * (1 - fx) * (1 - fy) +
          thick[r0 + 1] * fx * (1 - fy) +
          thick[r1] * (1 - fx) * fy +
          thick[r1 + 1] * fx * fy;
        const a = Math.atan2(y, x);
        const r = Math.hypot(x, y);
        const eq = 0.48 + 0.22 * Math.sin(a * 2.0 - r * 4.0 + this.time * 0.35);
        val += (eq - val) * drain;
        thickTmp[idx] = Math.max(0.04, Math.min(0.96, val));
      }
    }
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        const avg = 0.25 * (thickTmp[idx - 1] + thickTmp[idx + 1] + thickTmp[idx - nx] + thickTmp[idx + nx]);
        thick[idx] = thickTmp[idx] + (avg - thickTmp[idx]) * 0.055;
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

    // 1. Silky inertial coasting when released
    if (!this.dragging) {
      if (Math.abs(this.angVel) > 0.015) {
        this._applyAngleDelta(this.angVel * h, false);
        this.angVel *= Math.exp(-3.4 * h);
      } else {
        this.angVel = 0;
      }
    } else {
      // Decay velocity slightly if pointer holds still while grabbed
      this.angVel *= Math.exp(-7.5 * h);
    }

    const absVel = Math.abs(this.angVel);
    this.swirlPhase += (-this.angVel * 0.65 + 0.25) * h;
    const targetSpin = Math.min(1.0, absVel / 6.5);
    this.spinIntensity += (targetSpin - this.spinIntensity) * Math.min(1, h * 7.5);
    this.hoverMix += (((this.hovered || this.dragging) ? 1 : 0) - this.hoverMix) * Math.min(1, h * 11);

    // Subtle centrifugal dome swell + hover buoyancy
    const targetR = this.rBaseCss * (1.0 + this.spinIntensity * 0.036 + this.hoverMix * 0.012);
    this.rVel += ((targetR - this.rCss) * 210 - this.rVel * 16.0) * h;
    this.rCss += this.rVel * h;

    this.wobPhase += (this.wobFreq + this.spinIntensity * 6.0) * h;
    this.wobAmp *= Math.exp(-3.6 * h);

    // 2. Drive the 80x80 circular Navier-Stokes spiral vortex!
    const beadAngCss = this.currentAngleCss();
    if (absVel > 0.05) {
      this._injectRotaryVortex(this.angVel, beadAngCss, h);
    } else {
      // Whisper-gentle living ambient convection
      this._injectRotaryVortex(0.28 * Math.sin(this.time * 0.55), beadAngCss, h);
    }

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
        shimmer[idx] *= Math.exp(-2.6 * h);
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
  }

  _drawUnderDial() {
    const ctx = this.underCtx;
    const dpr = this.dpr;
    const W = this.underCanvas.width;
    const H = this.underCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = this.cx * dpr;
    const cy = this.cy * dpr;
    const sc = this.scale * dpr;

    // 1. Minimalist precision 270-degree outer radial tick ring (25 crisp ticks)
    const ticks = 24;
    const rInner = (this.rScaleCss - 3.5 * this.scale) * dpr;
    const rOuterShort = (this.rScaleCss + 2.5 * this.scale) * dpr;
    const rOuterMajor = (this.rScaleCss + 6.5 * this.scale) * dpr;

    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i <= ticks; i++) {
      const frac = i / ticks;
      const ang = this.angMinCss + frac * this.angSpan;
      const isMajor = (i % 6 === 0);
      const isFilled = frac <= this.value + 0.008;

      const x0 = cx + Math.cos(ang) * rInner;
      const y0 = cy + Math.sin(ang) * rInner;
      const r1 = isMajor ? rOuterMajor : rOuterShort;
      const x1 = cx + Math.cos(ang) * r1;
      const y1 = cy + Math.sin(ang) * r1;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineWidth = (isMajor ? 1.65 : 1.15) * sc;
      ctx.strokeStyle = isFilled
        ? `rgba(22, 24, 38, ${isMajor ? 0.72 : 0.44})`
        : `rgba(22, 24, 38, ${isMajor ? 0.17 : 0.10})`;
      ctx.stroke();
    }

    // Whisper-subtle active progress arc hugging inside the ticks
    ctx.beginPath();
    ctx.arc(cx, cy, (this.rScaleCss - 9.0 * this.scale) * dpr, this.angMinCss, this.currentAngleCss(), false);
    ctx.strokeStyle = 'rgba(22, 24, 38, 0.14)';
    ctx.lineWidth = 1.3 * sc;
    ctx.stroke();

    // 2. Crisp dark core pip inside the orbiting 3D soap indicator bead!
    const bead = this.beadStagePos();
    ctx.beginPath();
    ctx.arc(bead.x * dpr, bead.y * dpr, (2.6 + this.hoverMix * 0.5) * sc, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(20, 22, 34, ${0.72 + this.hoverMix * 0.22})`;
    ctx.fill();

    // 3. Razor-clean tabular numeric readout + tracked micro-label in the clear center aperture
    const displayNum = this.format ? this.format(this.value) : String(Math.round(this.value * 100));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${36 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(20, 22, 34, 0.88)';
    ctx.fillText(displayNum, cx, cy - 4 * sc);

    ctx.font = `600 ${9.2 * sc}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(20, 22, 34, 0.36)';
    // Subtle manual letter spacing for universal Canvas 2D compatibility
    const chars = this.label.split('');
    const spacing = 1.8 * sc;
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let lx = cx - totalW * 0.5;
    for (let i = 0; i < chars.length; i++) {
      ctx.textAlign = 'left';
      ctx.fillText(chars[i], lx, cy + 20.5 * sc);
      lx += widths[i] + spacing;
    }

    ctx.restore();
  }

  render() {
    this._drawUnderDial();

    const { gl, u } = this;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.texData);

    gl.uniform1i(u.uSim, 0);
    gl.uniform2f(u.uRes, this.glCanvas.width, this.glCanvas.height);
    gl.uniform2f(u.uSize, this.width, this.height);
    gl.uniform1f(u.uTime, this.time);

    gl.uniform4f(
      u.uDial,
      this._toNdcX(this.cx),
      this._toNdcY(this.cy),
      this._pxToNdc(this.rCss),
      this.wobAmp
    );
    gl.uniform4f(
      u.uDialMeta,
      this.wobPhase,
      -this.currentAngleCss(),
      this.spinIntensity,
      this.swirlPhase
    );

    const bead = this.beadStagePos();
    const beadR = this.rBeadCss * (1.0 + this.hoverMix * 0.14);
    gl.uniform4f(
      u.uBead,
      this._toNdcX(bead.x),
      this._toNdcY(bead.y),
      this._pxToNdc(beadR),
      this.hoverMix
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
// <<< engine
// >>> element (src/elements/dial.js)
// <soap-dial>: a rotary knob that is a disc of soap film. Turn it and the film spins into a vortex that follows how
// fast you turn; at either end it bounces off a soft stop.
class SoapDial extends SoapFilm.Base {
  static formAssociated = true;
  static observedAttributes = ['disabled', 'label'];
  static size = (w) => Math.min(390, Math.max(320, w * 0.56));
  static css = `:host([disabled]) .box{opacity:.55;pointer-events:none}`;
  constructor() { super(); this.internals = this.attachInternals?.(); }
  get min() { return this.num('min', 0); }
  get max() { const m = this.num('max', 100); return m > this.min ? m : this.min + 100; }
  get step() { const s = this.num('step', 1); return s > 0 ? s : 1; }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get form() { return this.internals?.form; }
  get name() { return this.getAttribute('name'); }
  snap(v) { const { min, max, step } = this; return +Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step)).toFixed(6); }
  get value() { return this.engine ? this.snap(this.min + this.engine.value * (this.max - this.min)) : this.snap(this.num('value', this.min + (this.max - this.min) * 0.28)); }
  set value(v) {
    const n = (this.snap(+v) - this.min) / (this.max - this.min);
    // from code or the keys it turns there over a quarter of a second and stops exactly on the value
    if (this.engine) this.glide = { from: this.engine.value, to: n, t: 0 };
    else this.setAttribute('value', v);
  }
  overlay() { return `<input class="sr" type="range" part="input">`; }
  attributeChangedCallback() { if (!this.i) return; this.i.disabled = this.disabled; this.i.setAttribute('aria-label', this.attr('label', 'Dial')); }
  formResetCallback() { this.value = this.num('value', this.min + (this.max - this.min) * 0.28); }
  create(mount, o) {
    const start = this.keep ?? ((this.snap(this.num('value', this.min + (this.max - this.min) * 0.28)) - this.min) / (this.max - this.min));
    return new SoapRotaryDial(mount, {
      ...o, initialValue: start, label: this.attr('label', 'Volume').toUpperCase(),
      format: (n) => { const v = this.snap(this.min + n * (this.max - this.min)); return String(+v.toFixed(4)); },
      onChange: () => { const v = this.value; if (v === this.last) return; this.last = v; this.i.value = v; this.internals?.setFormValue(String(v)); this.emit('input'); this.moved = true; },
    });
  }
  beforeStep(dt) {
    const e = this.engine, g = this.glide;
    if (!e || !g) return;
    if (e.dragging && !g.ours) { this.glide = null; return; }
    g.ours = true; e.dragging = true;
    g.t = Math.min(1, g.t + dt / 0.25);
    const k = g.t * g.t * (3 - 2 * g.t), d = g.from + (g.to - g.from) * k - e.value;
    e._applyAngleDelta(d * e.angSpan, true);
    e.angVel = d * e.angSpan / Math.max(dt, 1e-3);
    if (g.t >= 1) { this.glide = null; e.dragging = false; e.angVel = 0; }
  }
  save() { return this.engine?.value; }
  restore(v) { this.keep = undefined; if (v !== undefined) this.engine.reset(v); }
  build(w) { this.keep = this.engine?.value; super.build(w); }
  wire() {
    const i = this.i = this.$('input'), box = this.box;
    i.min = this.min; i.max = this.max; i.step = this.step;
    i.value = this.value; this.last = this.value; this.internals?.setFormValue(String(this.value));
    i.setAttribute('aria-label', this.attr('label', 'Dial')); i.disabled = this.disabled;
    i.addEventListener('input', (ev) => { ev.stopPropagation(); this.value = +i.value; });
    i.addEventListener('change', (ev) => { ev.stopPropagation(); this.emit('change'); this.moved = false; });
    box.addEventListener('pointerdown', (ev) => {
      if (!this.engine) return;
      const [x, y] = this.local(ev);
      if (this.engine.pointerDown(x, y)) { ev.preventDefault(); i.focus({ preventScroll: true }); box.setPointerCapture?.(ev.pointerId); box.style.cursor = 'grabbing'; this.moved = false; }
    });
    let t = performance.now();
    box.addEventListener('pointermove', (ev) => {
      if (!this.engine) return;
      const now = performance.now(), dt = Math.max(0.008, (now - t) / 1000); t = now;
      const [x, y] = this.local(ev);
      this.engine.pointerMove(x, y, dt);
      if (!this.engine.dragging) box.style.cursor = this.engine.hitTest(x, y) ? 'grab' : 'default';
    });
    const up = () => { if (!this.engine) return; const was = this.engine.dragging; this.engine.pointerUp(); box.style.cursor = 'grab'; if (was && this.moved) { this.emit('change'); this.moved = false; } };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('pointerleave', () => { if (this.engine && !this.engine.dragging) this.engine.setHovered(false); });
    box.addEventListener('wheel', (ev) => { if (!this.engine || this.disabled) return; ev.preventDefault(); this.engine.nudge(-Math.sign(ev.deltaY) * 0.035); clearTimeout(this.wt); this.wt = setTimeout(() => this.emit('change'), 250); }, { passive: false });
  }
}
SoapFilm.define('soap-dial', SoapDial);
// <<< element
})();
