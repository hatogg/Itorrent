// Допоміжні функції інтерфейсу: виклики рушія, формати, діалоги, меню, підказки.
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }
  const svg = (s, cls) => { const t = document.createElement('template'); t.innerHTML = s.trim(); const e = t.content.firstChild; if (cls) e.setAttribute('class', cls); return e; };

  // ---- рушій
  function api(method, args) {
    let raw;
    try {
      raw = window.Android.call(method, JSON.stringify(args || {}));
    } catch (e) {
      throw new Error('Рушій недоступний');
    }
    const r = JSON.parse(raw);
    if (!r.ok) throw new Error(r.error || 'Помилка');
    return r.r;
  }
  function tryApi(method, args) {
    try { return api(method, args); } catch (e) { toast(e.message, true); return undefined; }
  }

  // ---- формати (як у qBittorrent: двійкові одиниці)
  const UNITS = ['Б', 'КіБ', 'МіБ', 'ГіБ', 'ТіБ', 'ПіБ'];
  const PREC = [0, 1, 1, 2, 3, 3];
  const num = (v, d) => v.toFixed(d).replace('.', ',');
  function size(b) {
    if (b == null || b < 0) return 'Невідомо';
    let i = 0, v = b;
    while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; }
    return num(v, PREC[i]) + ' ' + UNITS[i];
  }
  const speed = (b) => size(b || 0) + '/с';
  function eta(s) {
    if (s == null || s < 0 || s >= 8640000) return '∞';
    if (s < 60) return '< 1 хв';
    const m = Math.floor(s / 60), hh = Math.floor(m / 60), d = Math.floor(hh / 24);
    if (d > 0) return d + ' д ' + (hh % 24) + ' год';
    if (hh > 0) return hh + ' год ' + (m % 60) + ' хв';
    return m + ' хв';
  }
  function dur(s) {
    if (s == null || s < 0) return '';
    if (s < 60) return '< 1 хв';
    return eta(s);
  }
  const ratio = (r) => r >= 9998 ? '∞' : num(r || 0, 2);
  const pct = (p) => num(Math.floor(p * 1000) / 10, 1) + '%';
  const pad = (n) => (n < 10 ? '0' : '') + n;
  function date(ms) {
    if (!ms || ms <= 0) return '';
    const d = new Date(ms);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  const time = (ms) => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // ---- підказки
  function toast(msg, err) {
    let box = $('.toasts');
    if (!box) { box = h('div', { class: 'toasts' }); document.body.appendChild(box); }
    const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
    box.appendChild(t);
    setTimeout(() => t.remove(), err ? 5200 : 3000);
  }

  // ---- діалоги
  const stack = [];
  function dialog(o) {
    return new Promise((resolve) => {
      const scrim = h('div', { class: 'scrim' });
      const dlg = h('div', { class: 'dlg' + (o.full ? ' full' : '') + (o.wide ? ' wide' : '') });
      const close = (v) => {
        if (o.onClose && o.onClose(v) === false) return;
        scrim.remove();
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
        resolve(v);
      };
      const entry = { close, back: () => close(undefined) };
      const title = h('div', { class: 'dlg-title' },
        o.icon ? svg(o.icon, 'ic') : null,
        h('div', { class: 't' }, o.title || ''),
        h('button', { class: 'x', 'aria-label': 'Закрити', onclick: () => close(undefined) }, svg(I.close)));
      const body = h('div', { class: 'dlg-body' + (o.flush ? ' flush' : '') });
      if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
      dlg.append(title, body);
      if (o.buttons && o.buttons.length) {
        const bar = h('div', { class: 'dlg-btns' });
        for (const b of o.buttons) {
          const btn = h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.left ? ' left' : '') }, b.label);
          btn.addEventListener('click', () => {
            if (b.action) {
              const r = b.action(close);
              if (r === false) return;
              close(r);
            } else close(b.value);
          });
          if (b.disabled) btn.disabled = true;
          if (b.ref) b.ref(btn);
          bar.appendChild(btn);
        }
        dlg.appendChild(bar);
      }
      scrim.appendChild(dlg);
      scrim.addEventListener('click', (e) => { if (e.target === scrim && !o.modal) close(undefined); });
      document.body.appendChild(scrim);
      stack.push(entry);
      if (o.ready) o.ready({ dlg, body, close, title });
      const f = dlg.querySelector('[autofocus]');
      if (f) setTimeout(() => { f.focus(); if (f.select) f.select(); }, 60);
    });
  }
  function confirm(title, text, okLabel, opts) {
    opts = opts || {};
    const body = h('div', { class: 'msg' }, svg(opts.icon || I.question), h('div', { html: text }));
    return dialog({ title, body, buttons: [{ label: 'Скасувати', value: false }, { label: okLabel || 'Так', primary: true, value: true }] }).then((v) => v === true);
  }
  function alert(title, text, icon) {
    const body = h('div', { class: 'msg' }, svg(icon || I.info), h('div', { html: text }));
    return dialog({ title, body, buttons: [{ label: 'Гаразд', primary: true }] });
  }
  function prompt(title, label, value, opts) {
    opts = opts || {};
    const inp = opts.multiline
      ? h('textarea', { class: 'field', rows: opts.rows || 6, placeholder: opts.placeholder || '', autofocus: true })
      : h('input', { class: 'field', type: opts.type || 'text', placeholder: opts.placeholder || '', autofocus: true, inputmode: opts.inputmode || null });
    inp.value = value == null ? '' : value;
    const body = h('div', null, label ? h('div', { class: 'hint', style: { color: 'var(--text)', marginBottom: '6px' } }, label) : null, inp, opts.hint ? h('div', { class: 'hint' }, opts.hint) : null);
    if (opts.extra) body.appendChild(opts.extra);
    if (!opts.multiline) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.closest('.dlg').querySelector('.btn.primary').click(); } });
    return dialog({ title, body, icon: opts.icon, buttons: [{ label: 'Скасувати', value: undefined }, { label: opts.ok || 'Гаразд', primary: true, action: () => inp.value }] });
  }

  // ---- контекстне меню (з підменю, як у настільних програмах)
  let menuOpen = null;
  function menu(items, at, title) {
    closeMenu();
    const scrim = h('div', { class: 'menu-scrim' });
    const box = h('div', { class: 'menu' });
    const hist = [];
    function render(list, head) {
      box.innerHTML = '';
      if (head) {
        box.appendChild(h('div', { class: 'mi head', onclick: () => { const p = hist.pop(); render(p.list, p.head); } },
          h('span', { class: 'ic' }, svg(I.back)), h('span', { class: 'lbl' }, head)));
      } else if (title) {
        box.appendChild(h('div', { class: 'mi head' }, h('span', { class: 'lbl' }, title)));
      }
      for (const it of list) {
        if (!it) continue;
        if (it === '-') { box.appendChild(h('div', { class: 'msep' })); continue; }
        const ic = h('span', { class: 'ic' });
        if (it.checked !== undefined) { if (it.checked) ic.appendChild(svg(I.check)); }
        else if (it.icon) ic.appendChild(svg(it.icon));
        const row = h('div', { class: 'mi' + (it.disabled ? ' dis' : '') }, ic, h('span', { class: 'lbl' }, it.label),
          it.sub ? h('span', { class: 'sub' }, it.sub) : null,
          it.items ? svg(I.chevR) : null);
        row.addEventListener('click', () => {
          if (it.items) {
            hist.push({ list, head });
            render(typeof it.items === 'function' ? it.items() : it.items, it.label);
            place();
            return;
          }
          closeMenu();
          if (it.action) setTimeout(it.action, 0);
        });
        box.appendChild(row);
      }
    }
    function place() {
      const w = window.innerWidth, hh = window.innerHeight;
      const r = box.getBoundingClientRect();
      let x = at ? at.x : (w - r.width) / 2, y = at ? at.y : (hh - r.height) / 2;
      if (x + r.width > w - 8) x = w - r.width - 8;
      if (y + r.height > hh - 8) y = Math.max(8, hh - r.height - 8);
      box.style.left = Math.max(8, x) + 'px';
      box.style.top = Math.max(8, y) + 'px';
    }
    render(items, null);
    scrim.addEventListener('click', closeMenu);
    document.body.append(scrim, box);
    place();
    menuOpen = { scrim, box };
  }
  function closeMenu() {
    if (!menuOpen) return false;
    menuOpen.scrim.remove();
    menuOpen.box.remove();
    menuOpen = null;
    return true;
  }

  // ---- довге натискання
  function longPress(el, onLong, onTap) {
    let t = null, sx = 0, sy = 0, fired = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      fired = false; sx = e.clientX; sy = e.clientY;
      t = setTimeout(() => { fired = true; t = null; try { window.Android.call('haptic', '{}'); } catch (x) {} onLong(e, { x: sx, y: sy }); }, 480);
    });
    const cancel = () => { if (t) { clearTimeout(t); t = null; } };
    el.addEventListener('pointermove', (e) => { if (t && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancel(); });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!fired) { cancel(); fired = true; onLong(e, { x: e.clientX, y: e.clientY }); } });
    el.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; return; } if (onTap) onTap(e); }, true);
  }

  // ---- перегляд папок і файлів на пристрої
  function browse(opts) {
    opts = opts || {};
    const wantFiles = !!opts.files;
    let cur = null;
    const roots = h('div', { class: 'fb-roots' });
    const pathEl = h('div', { class: 'p' });
    const upBtn = h('button', { class: 'btn icon small', onclick: () => cur && cur.parent && load(cur.parent) }, svg(I.up));
    const list = h('div', { class: 'fb-list' });
    const body = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } }, roots, h('div', { class: 'fb-path' }, upBtn, pathEl), list);
    function load(p) {
      let r;
      try { r = api('fs.list', { path: p, files: wantFiles }); } catch (e) { toast(e.message, true); return; }
      cur = r;
      pathEl.textContent = r.path;
      upBtn.disabled = !r.parent;
      roots.innerHTML = '';
      for (const rt of r.roots) roots.appendChild(h('button', { class: 'btn small', onclick: () => load(rt.path) }, rt.name));
      list.innerHTML = '';
      if (r.error) list.appendChild(h('div', { class: 'fb-err' }, r.error));
      for (const d of r.dirs) list.appendChild(h('div', { class: 'fb-item', onclick: () => load(r.path.replace(/\/$/, '') + '/' + d) }, svg(I.folder), h('span', { class: 'n' }, d)));
      for (const f of r.files) list.appendChild(h('div', { class: 'fb-item', onclick: () => done(r.path.replace(/\/$/, '') + '/' + f[0]) }, svg(I.file), h('span', { class: 'n' }, f[0]), h('span', { class: 's' }, size(f[1]))));
      if (!r.error && !r.dirs.length && !r.files.length) list.appendChild(h('div', { class: 'fb-err' }, 'Порожня папка'));
    }
    let done = () => {};
    const btns = [
      { label: 'Нова папка', left: true, action: () => {
        prompt('Нова папка', 'Назва папки', '').then((n) => {
          if (!n) return;
          const p = tryApi('fs.mkdir', { path: cur.path.replace(/\/$/, '') + '/' + n.trim() });
          if (p) load(p);
        });
        return false;
      } },
      { label: 'Скасувати', value: undefined },
    ];
    if (opts.dirs !== false) btns.push({ label: opts.pickLabel || 'Вибрати цю папку', primary: true, action: () => cur && cur.path });
    return dialog({
      title: opts.title || 'Вибір папки', icon: I.folder, body, flush: true, full: true, buttons: btns,
      ready: ({ close }) => { done = (p) => close(p); load(opts.path || ''); },
    });
  }

  // поле шляху з кнопкою «…»
  function pathField(value, opts) {
    opts = opts || {};
    const inp = h('input', { class: 'field', type: 'text', placeholder: opts.placeholder || '' });
    inp.value = value || '';
    const btn = h('button', { class: 'btn icon', title: 'Огляд', onclick: async () => {
      const p = await browse({ path: inp.value, title: opts.title, files: opts.files, dirs: opts.dirs });
      if (p) { inp.value = p; inp.dispatchEvent(new Event('change')); }
    } }, svg(I.folder));
    const row = h('div', { class: 'pathrow' }, inp, btn);
    row.input = inp;
    return row;
  }

  function check(label, checked, onchange, cls) {
    const inp = h('input', { type: 'checkbox' });
    inp.checked = !!checked;
    if (onchange) inp.addEventListener('change', () => onchange(inp.checked));
    const el = h('label', { class: 'check' + (cls ? ' ' + cls : '') }, inp, h('span', null, label));
    el.input = inp;
    return el;
  }

  function select(options, value, onchange) {
    const s = h('select', { class: 'field' });
    for (const o of options) {
      const opt = h('option', { value: o[0] }, o[1]);
      if (String(o[0]) === String(value)) opt.selected = true;
      s.appendChild(opt);
    }
    if (onchange) s.addEventListener('change', () => onchange(s.value));
    return s;
  }

  function numField(value, min, max, step) {
    const i = h('input', { class: 'field num', type: 'number', inputmode: step && step < 1 ? 'decimal' : 'numeric', min: min, max: max, step: step || 1 });
    i.value = value;
    return i;
  }

  function bar(p) {
    const w = Math.max(0, Math.min(1, p)) * 100;
    const t = pct(p);
    const el = h('div', { class: 'bar' }, h('i', { style: { width: w + '%' } }), h('b', null, t), h('em', { style: { clipPath: 'inset(0 ' + (100 - w) + '% 0 0)' } }, t));
    return el;
  }
  function setBar(el, p) {
    const w = Math.max(0, Math.min(1, p)) * 100;
    const t = pct(p);
    el.children[0].style.width = w + '%';
    if (el.children[1].textContent !== t) { el.children[1].textContent = t; el.children[2].textContent = t; }
    el.children[2].style.clipPath = 'inset(0 ' + (100 - w) + '% 0 0)';
  }

  window.U = { $, $$, esc, h, svg, api, tryApi, size, speed, eta, dur, ratio, pct, date, time, plural, toast, dialog, confirm, alert, prompt, menu, closeMenu, longPress, browse, pathField, check, select, numField, bar, setBar, stack, num };
})();
