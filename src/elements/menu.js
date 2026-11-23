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
