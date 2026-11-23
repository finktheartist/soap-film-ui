// <soap-fab>: a floating action button that is one plump bubble. Tap it and it buds into four smaller action
// bubbles, shrinking as it gives them its soap; tap one and it pops, tap the centre again and they fuse back.
const SOAP_FAB_ICONS = ['camera', 'note', 'mic', 'link'];
class SoapFab extends SoapFilm.Base {
  static touch = 'manipulation';
  static size = (w) => Math.min(380, Math.max(320, w * 0.56));
  get open() { return !!this.engine?.isOpen; }
  set open(v) { if (!this.engine) return; if (v && !this.engine.isOpen) this.engine.open(); if (!v && this.engine.isOpen) this.engine.close(); }
  list() {
    const o = this.options();
    const base = o.length ? o : SOAP_FAB_ICONS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), o: null }));
    return base.slice(0, 4).map((it, i) => {
      const icon = it.o?.dataset.icon;
      return { id: SOAP_FAB_ICONS.includes(icon) ? icon : SOAP_FAB_ICONS.includes(it.value) ? it.value : SOAP_FAB_ICONS[i], label: it.label, value: it.value, confirm: it.o?.dataset.done || it.label };
    });
  }
  overlay() {
    this.actions = this.list();
    return `<button class="sr hub" type="button" part="button" aria-expanded="false">${SoapFilm.esc(this.attr('label', 'Actions'))}</button><div class="sr acts" role="group">${this.actions.map((a, i) => `<button type="button" tabindex="-1" data-i="${i}">${SoapFilm.esc(a.label)}</button>`).join('')}</div>`;
  }
  create(mount, o) {
    return new SoapMitosisFab(mount, {
      ...o, actions: this.actions,
      onToggle: (isOpen) => { this.hub.setAttribute('aria-expanded', String(isOpen)); this.acts.forEach((b) => { b.tabIndex = isOpen ? 0 : -1; }); this.emit('toggle', { open: isOpen }); },
      onAction: (i, a) => this.emit('action', { index: i, value: a.value, label: a.label }),
    });
  }
  wire() {
    const box = this.box;
    this.hub = this.$('.hub'); this.acts = [...this.shadowRoot.querySelectorAll('.acts button')];
    this.hub.addEventListener('click', () => this.engine?.toggle());
    this.acts.forEach((b) => b.addEventListener('click', () => this.engine?.triggerBud(+b.dataset.i)));
    this.shadowRoot.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && this.open) { this.open = false; this.hub.focus(); } });
    box.addEventListener('pointermove', (ev) => { if (!this.engine) return; const [x, y] = this.local(ev); const h = this.engine.hitTest(x, y); this.engine.setHovered(h); box.style.cursor = h !== null ? 'pointer' : 'default'; });
    box.addEventListener('pointerleave', () => this.engine?.setHovered(null));
    box.addEventListener('pointerdown', (ev) => {
      if (!this.engine) return;
      const [x, y] = this.local(ev), h = this.engine.hitTest(x, y);
      if (h === 'hub') { this.hub.focus({ preventScroll: true }); this.engine.toggle(); }
      else if (typeof h === 'number') this.engine.triggerBud(h);
    });
  }
  build(w) { const was = this.open; super.build(w); if (was) this.engine?.open(); }
}
SoapFilm.define('soap-fab', SoapFab);
