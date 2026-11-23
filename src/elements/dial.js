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
