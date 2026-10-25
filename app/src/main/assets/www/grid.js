// Таблиця з фіксованим першим стовпцем, сортуванням, зміною ширини та оновленням рядків на місці.
(function () {
  const { h, svg } = U;

  class Grid {
    constructor(cols, o) {
      this.o = o || {};
      this.wrap = h('div', { class: 'tablewrap' });
      this.table = h('table', { class: 'grid' });
      this.wrap.appendChild(this.table);
      this.trs = new Map();
      this.sort = this.o.sort || null;
      this.setCols(cols);
    }

    setCols(cols) {
      this.cols = cols;
      this.trs.clear();
      this.table.innerHTML = '';
      this.colgroup = h('colgroup');
      let total = 0;
      for (const c of cols) {
        const w = (this.o.widths && this.o.widths[c.k]) || c.w || 90;
        total += w;
        this.colgroup.appendChild(h('col', { style: { width: w + 'px' } }));
      }
      this.table.style.width = total + 'px';
      const tr = h('tr');
      cols.forEach((c, i) => {
        const th = h('th', { class: (c.num ? 'num ' : '') + (i === 0 && this.o.sticky !== false ? 'sticky' : '') }, c.l);
        th.title = c.l;
        if (this.o.onSort && c.sortable !== false) th.addEventListener('click', () => this.o.onSort(c.k));
        if (this.o.onResize) {
          const rz = h('span', { class: 'rz' });
          rz.addEventListener('click', (e) => e.stopPropagation());
          rz.addEventListener('pointerdown', (e) => this.startResize(e, i));
          th.appendChild(rz);
        }
        tr.appendChild(th);
      });
      if (this.o.onHeadLong) U.longPress(tr, (e, pt) => this.o.onHeadLong(pt));
      this.thead = h('thead', null, tr);
      this.tbody = h('tbody');
      this.table.append(this.colgroup, this.thead, this.tbody);
      this.bind();
      this.showSort();
    }

    startResize(e, i) {
      e.preventDefault();
      e.stopPropagation();
      const col = this.colgroup.children[i];
      const start = e.clientX;
      const w0 = parseFloat(col.style.width);
      const tw0 = parseFloat(this.table.style.width);
      const move = (ev) => {
        const w = Math.max(40, w0 + ev.clientX - start);
        col.style.width = w + 'px';
        this.table.style.width = (tw0 + w - w0) + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.o.onResize(this.cols[i].k, Math.round(parseFloat(col.style.width)));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    showSort() {
      if (!this.thead) return;
      const ths = this.thead.firstChild.children;
      this.cols.forEach((c, i) => {
        const th = ths[i];
        const a = th.querySelector('.arr');
        if (a) a.remove();
        th.classList.toggle('sorted', !!(this.sort && this.sort.col === c.k));
        if (this.sort && this.sort.col === c.k) th.insertBefore(h('span', { class: 'arr' }, this.sort.dir > 0 ? '▲' : '▼'), th.querySelector('.rz'));
      });
    }

    setSort(s) { this.sort = s; this.showSort(); }

    bind() {
      const rowOf = (e) => {
        const tr = e.target.closest('tr');
        return tr && tr._r !== undefined ? tr : null;
      };
      U.longPress(this.tbody, (e, pt) => {
        const tr = rowOf(e);
        if (tr && this.o.onLong) this.o.onLong(tr._r, pt, e);
      });
      this.tbody.addEventListener('click', (e) => {
        const tr = rowOf(e);
        if (tr && this.o.onTap) this.o.onTap(tr._r, e);
      });
    }

    makeRow(r) {
      const tr = h('tr');
      this.cols.forEach((c, i) => {
        const td = h('td', { class: (c.num ? 'num ' : '') + (i === 0 && this.o.sticky !== false ? 'sticky' : '') });
        if (c.bar) td.appendChild(U.bar(0));
        tr.appendChild(td);
      });
      return tr;
    }

    updateRow(tr, r) {
      tr._r = r;
      const cls = (this.o.rowClass ? this.o.rowClass(r) : '');
      if (tr._cls !== cls) { tr.className = cls; tr._cls = cls; }
      const tds = tr.children;
      for (let i = 0; i < this.cols.length; i++) {
        const c = this.cols[i];
        const td = tds[i];
        if (c.render) { c.render(td, r); continue; }
        if (c.bar) { U.setBar(td.firstChild, c.v ? c.v(r) : r[c.k]); continue; }
        let t = c.f ? c.f(r) : r[c.k];
        if (t == null) t = '';
        t = String(t);
        if (td._t !== t) { td.textContent = t; td._t = t; }
      }
    }

    setRows(rows, key) {
      const keep = new Set();
      let prev = null;
      const tb = this.tbody;
      for (const r of rows) {
        const id = key(r);
        keep.add(id);
        let tr = this.trs.get(id);
        if (!tr) { tr = this.makeRow(r); this.trs.set(id, tr); }
        this.updateRow(tr, r);
        const want = prev ? prev.nextSibling : tb.firstChild;
        if (want !== tr) tb.insertBefore(tr, want);
        prev = tr;
      }
      for (const [id, tr] of this.trs) if (!keep.has(id)) { tr.remove(); this.trs.delete(id); }
    }

    clear() { this.tbody.innerHTML = ''; this.trs.clear(); }
  }

  // Дерево файлів торента (для вкладки «Вміст» і діалогу додавання)
  class FileTree {
    constructor(files) {
      // files: [[index, path, size], ...]
      this.root = { name: '', path: '', dir: true, kids: new Map(), files: [] };
      this.nodes = new Map();
      this.leaves = [];
      for (const f of files) {
        const parts = f[1].split('/');
        let n = this.root;
        let p = '';
        for (let i = 0; i < parts.length - 1; i++) {
          p = p ? p + '/' + parts[i] : parts[i];
          let k = n.kids.get(parts[i]);
          if (!k) { k = { name: parts[i], path: p, dir: true, kids: new Map(), parent: n }; n.kids.set(parts[i], k); this.nodes.set(p, k); }
          n = k;
        }
        const leaf = { name: parts[parts.length - 1], path: f[1], dir: false, index: f[0], size: f[2], parent: n };
        n.kids.set('\u0000' + f[0], leaf);
        this.nodes.set(f[1] + '\u0000' + f[0], leaf);
        this.leaves.push(leaf);
      }
      this.open = new Set();
      // Якщо корінь один — розгорнути його
      if (this.root.kids.size === 1) {
        const only = this.root.kids.values().next().value;
        if (only.dir) this.open.add(only.path);
      }
    }

    leavesOf(n) {
      if (!n.dir) return [n];
      const out = [];
      const walk = (x) => { for (const k of x.kids.values()) k.dir ? walk(k) : out.push(k); };
      walk(n);
      return out;
    }

    // Обчислює підсумки для тек із масивів prog / prio / avail (за індексом файлу)
    compute(prog, prio, avail) {
      const agg = (n) => {
        if (!n.dir) {
          n.done = prog ? (prog[n.index] || 0) : 0;
          n.prio = prio ? (prio[n.index] === undefined ? 4 : prio[n.index]) : 4;
          n.avail = avail ? avail[n.index] : -1;
          n.tsize = n.size;
          return;
        }
        let s = 0, d = 0, pr = null, av = 0, avc = 0;
        for (const k of n.kids.values()) {
          agg(k);
          s += k.tsize; d += k.done;
          const kp = k.prio;
          pr = pr === null ? kp : (pr === kp ? pr : -1);
          if (k.avail >= 0) { av += k.avail * k.tsize; avc += k.tsize; }
        }
        n.tsize = s; n.done = d; n.prio = pr === null ? 4 : pr; n.avail = avc > 0 ? av / avc : -1;
      };
      agg(this.root);
    }

    visible() {
      const out = [];
      const sortKids = (n) => Array.from(n.kids.values()).sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'uk', { numeric: true }) : a.dir ? -1 : 1));
      const walk = (n, depth) => {
        for (const k of sortKids(n)) {
          k.depth = depth;
          out.push(k);
          if (k.dir && this.open.has(k.path)) walk(k, depth + 1);
        }
      };
      walk(this.root, 0);
      return out;
    }

    key(n) { return n.dir ? 'd:' + n.path : 'f:' + n.index; }
  }

  const PRIO = [[0, 'Не завантажувати'], [4, 'Звичайний'], [6, 'Високий'], [7, 'Максимальний']];
  function prioLabel(p) {
    if (p < 0) return 'Змішаний';
    if (p === 0) return 'Не завантажувати';
    if (p <= 4) return 'Звичайний';
    if (p <= 6) return 'Високий';
    return 'Максимальний';
  }

  // Комірка назви з відступом, стрілкою розгортання, прапорцем і значком
  function treeNameRender(tree, onToggleOpen, onCheck) {
    return (td, n) => {
      if (!td._init) {
        td._init = true;
        const box = h('div', { class: 'nm' });
        td.appendChild(box);
        td._sp = h('span', { style: { width: '0px', flex: 'none' } });
        td._tw = h('span', { class: 'tree-tw' }, svg(I.chevR));
        td._cb = h('input', { type: 'checkbox', class: 'chk' });
        td._ic = h('span', { style: { display: 'contents' } });
        td._tx = h('span');
        td._tw.addEventListener('click', (e) => { e.stopPropagation(); if (td._n && td._n.dir) onToggleOpen(td._n); });
        td._cb.addEventListener('click', (e) => { e.stopPropagation(); onCheck(td._n, td._cb.checked); });
        box.append(td._sp, td._tw, td._cb, td._ic, td._tx);
      }
      td._n = n;
      td._sp.style.width = (n.depth * 16) + 'px';
      td._tw.style.visibility = n.dir ? 'visible' : 'hidden';
      td._tw.classList.toggle('open', n.dir && tree.open.has(n.path));
      td._cb.checked = n.prio !== 0;
      td._cb.indeterminate = n.prio < 0;
      const icon = n.dir ? 'folder' : (/\.(mkv|mp4|avi|mov|wmv|webm|m4v|ts|mp3|flac|ogg|m4a|aac|wav|opus)$/i.test(n.name) ? 'fileMedia' : 'file');
      if (td._icon !== icon) { td._ic.innerHTML = ''; td._ic.appendChild(svg(I[icon])); td._icon = icon; }
      if (td._tx.textContent !== n.name) td._tx.textContent = n.name;
    };
  }

  window.Grid = Grid;
  window.FileTree = FileTree;
  window.PRIO = PRIO;
  window.prioLabel = prioLabel;
  window.treeNameRender = treeNameRender;
})();
