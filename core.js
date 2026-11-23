// Soap Film UI core. Every component file carries a copy of this, stamped in by tools/build.mjs.
// The first file loaded sets window.SoapFilm and the others reuse it, so any mix of them on a page shares
// one clock and one sound engine.
//
//   SoapFilm.sound = false            mute every control on the page (or put a `muted` attribute on one)
//   SoapFilm.clock.manual = true      stop the clock; then SoapFilm.clock.advance(1 / 60) steps every control
//   SoapFilm.Base                     the custom-element base class each control extends
const SoapFilm = window.SoapFilm || (window.SoapFilm = (() => {
// @@sound (tools/build.mjs puts the SoapAudio class here, from src/sound.js)

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
