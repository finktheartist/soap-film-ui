// <soap-notifications>: a stack of notifications as a foam of soap bubbles. Neighbours flatten against each other
// along shared walls; flick one sideways or tap it and it pops, and the rest close up.
const SOAP_NOTE_ICONS = ['calendar', 'chat', 'check', 'download', 'bell'];
class SoapNotifications extends SoapFilm.Base {
  static size = (w) => Math.min(400, Math.max(330, w * 0.56));
  get count() { return this.engine?.pills.length ?? 0; }
  get full() { return this.count >= 4; }
  // the notifications, as { icon, title, body, time }: up to four. icon is calendar, chat, check, download or bell.
  get items() { return this.engine ? this.engine.pills.filter((p) => !p.popping).map(({ icon, title, body, time }) => ({ icon, title, body, time })) : this.start || null; }
  set items(v) { this.start = v ? v.map((n, i) => this.tidy(n, i)) : null; if (this.engine) { this.engine.initial = this.start; this.engine.reset(); } }
  tidy(n, i = 0) { return { icon: SOAP_NOTE_ICONS.includes(n.icon) ? n.icon : 'bell', title: String(n.title ?? ''), body: String(n.body ?? ''), time: String(n.time ?? 'now'), dNmSeed: n.dNmSeed ?? ((i * 83 + 40) % 360) }; }
  fromOptions() { const o = this.options(); return o.length ? o.map((x, i) => this.tidy({ icon: x.o.dataset.icon, title: x.label, body: x.o.dataset.body, time: x.o.dataset.time }, i)) : null; }
  // add one on top; returns false when the stack is full (four)
  push(n) { if (!this.engine) return false; this.seq = (this.seq || 0) + 1; return this.engine.pushNotification(this.tidy(n || {}, this.seq)); }
  dismiss(i = 0) { this.engine?.popByIndex(i); }
  clear() { if (!this.engine) return; for (const p of [...this.engine.pills]) this.engine.popByUid(p.uid); }
  overlay() { return `<div class="sr" role="list" part="list" aria-live="polite"></div>`; }
  create(mount, o) {
    const e = new SoapFoamNotifications(mount, {
      ...o, initial: this.start ?? this.fromOptions(),
      onCountChange: () => { this.list?.(); this.emit('count', { count: this.count }); },
      onPop: (p) => { this.emit('dismiss', { title: p.title, body: p.body }); setTimeout(() => this.list?.(), 0); },
    });
    return e;
  }
  build(w) { if (this.engine) this.start = this.items.map((n, i) => this.tidy(n, i)); super.build(w); }
  wire() {
    const box = this.box, holder = this.$('[role=list]');
    holder.setAttribute('aria-label', this.attr('label', 'Notifications'));
    // each notification is a real button for the keyboard and screen readers: Enter or Delete dismisses it
    this.list = () => {
      const items = this.items || [];
      holder.innerHTML = items.map((n, i) => `<div role="listitem"><button type="button" data-i="${i}">${SoapFilm.esc(n.title)}: ${SoapFilm.esc(n.body)}, ${SoapFilm.esc(n.time)}. Dismiss</button></div>`).join('');
    };
    holder.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) this.dismiss(+b.dataset.i); });
    holder.addEventListener('keydown', (ev) => { const b = ev.target.closest('button'); if (b && (ev.key === 'Delete' || ev.key === 'Backspace')) { ev.preventDefault(); this.dismiss(+b.dataset.i); } });
    let t = performance.now();
    box.addEventListener('pointerdown', (ev) => { if (!this.engine) return; const [x, y] = this.local(ev); if (this.engine.pointerDown(x, y)) { box.setPointerCapture?.(ev.pointerId); box.style.cursor = 'grabbing'; } });
    box.addEventListener('pointermove', (ev) => {
      if (!this.engine) return;
      const now = performance.now(), dt = Math.max(0.008, (now - t) / 1000); t = now;
      const [x, y] = this.local(ev); this.engine.pointerMove(x, y, dt);
      if (!this.engine.dragState) box.style.cursor = this.engine.hitTest(x, y) >= 0 ? 'pointer' : 'default';
    });
    const up = () => { this.engine?.pointerUp(); box.style.cursor = 'default'; };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('pointerleave', () => { if (this.engine && !this.engine.dragState) this.engine.setHoveredUid(-1); });
  }
}
SoapFilm.define('soap-notifications', SoapNotifications);
