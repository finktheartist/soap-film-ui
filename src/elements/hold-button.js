// <soap-hold-button>: press and hold, and a soap film over the button blows up into a bubble. Hold to the end and it
// pops and the button says it is sent; let go early and it sinks back.
class SoapHoldButton extends SoapFilm.Base {
  static formAssociated = true;
  static observedAttributes = ['label', 'done-label', 'disabled'];
  static size = (w) => w * 0.62;
  static css = `.box{cursor:pointer}:host([disabled]) .box{cursor:not-allowed;opacity:.55}`;
  constructor() { super(); this.internals = this.attachInternals?.(); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get sent() { return !!this.engine?.sent; }
  get form() { return this.internals?.form; }
  label() { return this.attr('label', this.textContent.trim() || 'Hold to send'); }
  overlay() { return `<button class="sr" type="button" part="button"></button>`; }
  attributeChangedCallback() {
    if (this.b) { this.b.textContent = this.label(); this.b.disabled = this.disabled; }
    if (this.engine) { this.engine.labelIdle = this.label(); this.engine.labelSent = this.attr('done-label', 'Sent'); }
  }
  create(mount, o) {
    return new HoldToConfirmBubble(mount, {
      ...o, labelIdle: this.label(), labelSent: this.attr('done-label', 'Sent'),
      holdDuration: this.num('duration', 1.85),
      onConfirm: () => {
        this.b.setAttribute('aria-label', this.attr('done-label', 'Sent'));
        this.emit('confirm');
        if (this.getAttribute('type') === 'submit') this.form?.requestSubmit();
      },
    });
  }
  hold(down) {
    if (!this.engine || (down && this.disabled)) return;
    if (down && this.engine.sent) this.b.removeAttribute('aria-label');
    this.engine.setHolding(down);
  }
  reset() { this.engine?.reset(); this.b?.removeAttribute('aria-label'); }
  wire() {
    const b = this.b = this.$('button'), box = this.box;
    b.textContent = this.label(); b.disabled = this.disabled;
    box.addEventListener('pointerdown', (ev) => {
      if (!this.engine) return;
      const [x, y] = this.local(ev);
      if (!this.engine.isInsidePillStage(x, y)) return;
      ev.preventDefault(); b.focus({ preventScroll: true });
      box.setPointerCapture?.(ev.pointerId); this.hold(true);
    });
    const up = () => this.hold(false);
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('pointermove', (ev) => { if (this.engine) { const [x, y] = this.local(ev); box.style.cursor = this.engine.isInsidePillStage(x, y) ? 'pointer' : 'default'; } });
    // Space and Enter hold it like a finger does
    b.addEventListener('keydown', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); this.hold(true); } else if (ev.key === ' ' || ev.key === 'Enter') ev.preventDefault(); });
    b.addEventListener('keyup', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); this.hold(false); } });
    b.addEventListener('blur', up);
    b.addEventListener('click', (ev) => ev.preventDefault());
  }
  save() { return null; }
}
SoapFilm.define('soap-hold-button', SoapHoldButton);
