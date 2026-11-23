// <soap-tags>: up to four tags as soap bubbles. Drag one into another and they coalesce into one bigger bubble that
// holds both; pull a tag back out, or double-click the group, and it tears off as its own bubble again.
const SOAP_TAG_DOTS = ['#5B6CF6', '#EE5A6F', '#1FB6A6', '#E69F24'];
class SoapTags extends SoapFilm.Base {
  static formAssociated = true;
  static size = (w) => Math.min(390, Math.max(320, w * 0.56));
  constructor() { super(); this.internals = this.attachInternals?.(); }
  get form() { return this.internals?.form; }
  get name() { return this.getAttribute('name'); }
  list() {
    const o = this.options();
    const base = o.length ? o.map((x) => ({ id: x.value, label: x.label, dot: x.o.dataset.color })) : [
      { id: 'design', label: 'Design' }, { id: 'urgent', label: 'Urgent' }, { id: 'audio', label: 'Audio' }, { id: 'saved', label: 'Saved' }];
    return base.slice(0, 4).map((t, i) => ({ id: t.id, label: t.label, dot: t.dot || SOAP_TAG_DOTS[i] }));
  }
  // the groups, as arrays of tag values: [['design', 'urgent'], ['audio'], ['saved']]
  get groups() { return this.engine ? this.engine.clusters.map((c) => c.tags.map((t) => t.id)) : this.tags.map((t) => [t.id]); }
  get value() { return this.groups.map((g) => g.join('+')).join(','); }
  // merge the bubble holding tag a into the one holding tag b
  merge(a, b) {
    const e = this.engine; if (!e) return;
    const src = e.clusters.find((c) => c.tags.some((t) => t.id === a)), dst = e.clusters.find((c) => c.tags.some((t) => t.id === b));
    if (src && dst && src !== dst) e._mergeClusters(src, dst);
  }
  // pull the last tag out of the group that holds tag a
  split(a) { const e = this.engine; const c = e?.clusters.find((q) => q.tags.some((t) => t.id === a)); if (c) e.splitCluster(c.uid); }
  reset() { this.engine?.reset(); }
  overlay() {
    this.tags = this.list();
    return `<div class="sr" role="group" part="group">${this.tags.map((t) => `<button type="button" data-id="${SoapFilm.esc(t.id)}">${SoapFilm.esc(t.label)}</button>`).join('')}</div>`;
  }
  create(mount, o) {
    return new SoapTagBubbles(mount, {
      ...o, tags: this.tags,
      onChange: () => {
        const v = this.value;
        this.internals?.setFormValue(v);
        this.describe?.();
        if (this.lastValue !== undefined && v !== this.lastValue) this.emit('change', { groups: this.groups });
        this.lastValue = v;
      },
    });
  }
  wire() {
    const box = this.box, g = this.$('[role=group]');
    g.setAttribute('aria-label', this.attr('label', 'Tags') + '. Enter joins a tag to the next group; Delete pulls it out.');
    // keyboard: Enter merges a tag's bubble into the next one along; Delete or Backspace splits it back out
    this.describe = () => {
      for (const b of g.querySelectorAll('button')) {
        const grp = this.groups.find((x) => x.includes(b.dataset.id)) || [];
        const others = grp.filter((x) => x !== b.dataset.id).map((x) => this.tags.find((t) => t.id === x)?.label);
        b.setAttribute('aria-label', `${b.textContent}${others.length ? `, grouped with ${others.join(' and ')}` : ''}`);
      }
    };
    g.addEventListener('keydown', (ev) => {
      const b = ev.target.closest('button'); if (!b || !this.engine) return;
      const id = b.dataset.id, groups = this.groups;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        const at = groups.findIndex((x) => x.includes(id)), next = groups[(at + 1) % groups.length];
        if (groups.length > 1) this.merge(id, next[0]);
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); this.split(id); }
    });
    box.addEventListener('pointerdown', (ev) => { if (!this.engine) return; const [x, y] = this.local(ev); if (this.engine.pointerDown(x, y)) { box.setPointerCapture?.(ev.pointerId); box.style.cursor = 'grabbing'; } });
    box.addEventListener('pointermove', (ev) => { if (!this.engine) return; const [x, y] = this.local(ev); this.engine.pointerMove(x, y); if (!this.engine.drag) { this.engine.setHovered(x, y); box.style.cursor = this.engine.hitTest(x, y).uid >= 0 ? 'grab' : 'default'; } });
    const up = () => { this.engine?.pointerUp(); box.style.cursor = 'default'; };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('pointerleave', () => { if (this.engine && !this.engine.drag) this.engine.clearHover(); });
    box.addEventListener('dblclick', (ev) => { if (!this.engine) return; const [x, y] = this.local(ev); const h = this.engine.hitTest(x, y); if (h.uid >= 0) this.engine.splitCluster(h.uid); });
  }
}
SoapFilm.define('soap-tags', SoapTags);
