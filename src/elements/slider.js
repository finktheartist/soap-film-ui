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
