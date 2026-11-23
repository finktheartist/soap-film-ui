// <soap-pull-refresh>: a list you pull down to refresh. The gap that opens under the header fills with a sheet of
// soap film, which swells while it loads and pops when the new rows arrive.
class SoapPullRefresh extends SoapFilm.Base {
  static size = (w) => Math.min(420, Math.max(360, w * 0.64));
  static css = `.box{cursor:grab}`;
  get refreshing() { return this.engine?.phase === 'refreshing'; }
  // the rows: [{ initials, name, preview, time }], drawn in the card. Set before or after it is on the page.
  get items() { return this.engine ? this.engine.items.map(({ fresh, ...r }) => r) : (this.rows || null); }
  set items(v) { this.rows = v ? v.map((r) => ({ ...r })) : null; if (this.engine) this.engine.items = (this.rows || []).slice(0, 5).map((r) => ({ ...r, fresh: false })); }
  overlay() { return `<button class="sr" type="button" part="button">Refresh</button>`; }
  create(mount, o) {
    const e = new PullToRefreshBubble(mount, {
      ...o, items: this.rows || undefined, refreshDuration: this.num('duration', 1.35),
      onStart: () => {
        // the page answers the refresh event: call event.detail.waitUntil(promise) to hold the film open until it
        // settles, and resolve it with any new rows
        const jobs = [];
        e.waiting = true;
        this.emit('refresh', { waitUntil: (p) => jobs.push(Promise.resolve(p)) });
        Promise.allSettled(jobs).then((rs) => {
          for (const r of rs) if (r.status === 'fulfilled' && r.value) e.incoming.push(...[].concat(r.value));
          e.waiting = false;
        });
      },
      onRefresh: (row) => this.emit('refreshed', { row }),
    });
    return e;
  }
  // start a refresh without a pull, as the keyboard does: the film opens, swells and pops
  refresh() {
    const e = this.engine;
    if (!e || e.phase === 'refreshing' || e.phase === 'settling') return;
    e.beginPull(e.width * 0.5); e.updatePull(e.pullThresholdCss * 1.05, 0); e.pull = 1; e.endPull();
  }
  build(w) { if (this.engine) this.rows = this.items; super.build(w); }
  wire() {
    const box = this.box, b = this.$('button');
    b.addEventListener('click', () => this.refresh());
    let id = null, x0 = 0, y0 = 0;
    box.addEventListener('pointerdown', (ev) => {
      if (id !== null || !this.engine) return;
      const [x, y] = this.local(ev);
      if (!this.engine.isInsideFeedStage(x, y)) return;
      id = ev.pointerId; x0 = x; y0 = y;
      box.setPointerCapture?.(ev.pointerId); box.style.cursor = 'grabbing';
      this.engine.beginPull(x);
    });
    box.addEventListener('pointermove', (ev) => { if (ev.pointerId !== id || !this.engine) return; const [x, y] = this.local(ev); this.engine.updatePull(y - y0, x - x0); });
    const end = (ev) => { if (ev.pointerId !== id) return; id = null; box.style.cursor = 'grab'; this.engine?.endPull(); };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }
}
SoapFilm.define('soap-pull-refresh', SoapPullRefresh);
