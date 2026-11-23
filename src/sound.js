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
