// Itorrent — головне вікно: передачі, фільтри, властивості, рядок стану.
(function () {
  const { $, h, svg, api, tryApi, size, speed, eta, dur, ratio, date, toast, menu, closeMenu, plural } = U;

  const It = window.It = {};
  let INFO = {};
  let P = {};

  const STATE_LABEL = {
    downloading: 'Завантаження', forcedDL: '[П] Завантаження', stalledDL: 'Простоює',
    metaDL: 'Отримання метаданих', forcedMetaDL: '[П] Отримання метаданих',
    uploading: 'Роздача', forcedUP: '[П] Роздача', stalledUP: 'Роздача',
    queuedDL: 'У черзі', queuedUP: 'У черзі', checkingDL: 'Перевірка', checkingUP: 'Перевірка',
    checkingResumeData: 'Перевірка даних відновлення', stoppedDL: 'Зупинено', stoppedUP: 'Завершено',
    moving: 'Переміщення', error: 'Помилка',
  };
  const STATE_ORDER = { downloading: 1, forcedDL: 2, metaDL: 3, forcedMetaDL: 4, stalledDL: 5, uploading: 6, forcedUP: 7, stalledUP: 8, queuedDL: 9, queuedUP: 10, checkingDL: 11, checkingUP: 12, checkingResumeData: 13, moving: 14, stoppedDL: 15, stoppedUP: 16, error: 17 };
  const DL = new Set(['downloading', 'metaDL', 'forcedMetaDL', 'stalledDL', 'checkingDL', 'stoppedDL', 'queuedDL', 'forcedDL']);
  const UP = new Set(['uploading', 'stalledUP', 'checkingUP', 'queuedUP', 'forcedUP']);
  const DONE = new Set(['uploading', 'stalledUP', 'checkingUP', 'stoppedUP', 'queuedUP', 'forcedUP']);
  const STOPPED = new Set(['stoppedDL', 'stoppedUP']);
  const isActive = (r) => r.dl > 0 || r.ul > 0 || r.state === 'moving';

  const FILTERS = [
    ['all', 'Усі', () => true],
    ['downloading', 'Завантажуються', (r) => DL.has(r.state)],
    ['seeding', 'Роздаються', (r) => UP.has(r.state)],
    ['completed', 'Завершені', (r) => DONE.has(r.state)],
    ['running', 'Запущені', (r) => !STOPPED.has(r.state)],
    ['stopped', 'Зупинені', (r) => STOPPED.has(r.state)],
    ['active', 'Активні', (r) => isActive(r)],
    ['inactive', 'Неактивні', (r) => !isActive(r)],
    ['stalled', 'Простоюють', (r) => r.state === 'stalledDL' || r.state === 'stalledUP'],
    ['stalledUploading', 'Простоюють (роздача)', (r) => r.state === 'stalledUP'],
    ['stalledDownloading', 'Простоюють (завантаження)', (r) => r.state === 'stalledDL'],
    ['checking', 'Перевіряються', (r) => r.state.startsWith('checking')],
    ['moving', 'Переміщуються', (r) => r.state === 'moving'],
    ['errored', 'З помилками', (r) => r.state === 'error'],
  ];
  const FILTER_MAP = Object.fromEntries(FILTERS.map((f) => [f[0], f]));

  const host = (u) => { try { return new URL(u).hostname; } catch (e) { const m = /^[a-z]+:\/\/([^/:]+)/i.exec(u || ''); return m ? m[1] : ''; } };

  const COLS = [
    { k: 'queue', l: '#', w: 42, num: true, v: (r) => (r.queue < 0 ? 1e9 : r.queue), f: (r) => (r.queue >= 0 ? r.queue + 1 : '*') },
    { k: 'name', l: 'Назва', w: 176, v: (r) => r.name.toLowerCase(), render: nameCell },
    { k: 'size', l: 'Розмір', w: 86, num: true, f: (r) => size(r.size) },
    { k: 'total', l: 'Загальний розмір', w: 110, num: true, f: (r) => size(r.total) },
    { k: 'progress', l: 'Прогрес', w: 108, bar: true, v: (r) => r.progress },
    { k: 'state', l: 'Стан', w: 128, v: (r) => STATE_ORDER[r.state] || 99, f: (r) => STATE_LABEL[r.state] || r.state },
    { k: 'seeds', l: 'Сіди', w: 72, num: true, f: (r) => r.seeds + ' (' + Math.max(0, r.seedsT) + ')' },
    { k: 'peers', l: 'Піри', w: 72, num: true, f: (r) => r.peers + ' (' + Math.max(0, r.peersT) + ')' },
    { k: 'dl', l: 'Завантаження', w: 104, num: true, f: (r) => (r.dl > 0 ? speed(r.dl) : '') },
    { k: 'ul', l: 'Вивантаження', w: 104, num: true, f: (r) => (r.ul > 0 ? speed(r.ul) : '') },
    { k: 'eta', l: 'Залишилось', w: 92, num: true, v: (r) => (r.eta < 0 ? 1e13 : r.eta), f: (r) => eta(r.eta) },
    { k: 'ratio', l: 'Рейтинг', w: 70, num: true, f: (r) => ratio(r.ratio) },
    { k: 'cat', l: 'Категорія', w: 100, v: (r) => r.cat.toLowerCase() },
    { k: 'tags', l: 'Мітки', w: 110, v: (r) => r.tags.join(', ').toLowerCase(), f: (r) => r.tags.join(', ') },
    { k: 'added', l: 'Додано', w: 126, num: true, f: (r) => date(r.added) },
    { k: 'completed', l: 'Завершено', w: 126, num: true, f: (r) => date(r.completed) },
    { k: 'tracker', l: 'Трекер', w: 150, f: (r) => host(r.tracker) },
    { k: 'dlLim', l: 'Ліміт завантаження', w: 112, num: true, v: (r) => r.dlLim || 1e12, f: (r) => (r.dlLim ? speed(r.dlLim * 1024) : '∞') },
    { k: 'ulLim', l: 'Ліміт вивантаження', w: 112, num: true, v: (r) => r.ulLim || 1e12, f: (r) => (r.ulLim ? speed(r.ulLim * 1024) : '∞') },
    { k: 'dlAll', l: 'Завантажено', w: 96, num: true, f: (r) => size(r.dlAll) },
    { k: 'ulAll', l: 'Вивантажено', w: 96, num: true, f: (r) => size(r.ulAll) },
    { k: 'dlS', l: 'Завантажено за сеанс', w: 120, num: true, f: (r) => size(r.dlS) },
    { k: 'ulS', l: 'Вивантажено за сеанс', w: 120, num: true, f: (r) => size(r.ulS) },
    { k: 'left', l: 'Залишилось завантажити', w: 120, num: true, f: (r) => size(r.left) },
    { k: 'done', l: 'Завершено (обсяг)', w: 108, num: true, v: (r) => r.size - r.left, f: (r) => size(r.size - r.left) },
    { k: 'active', l: 'Активний час', w: 104, num: true, f: (r) => dur(r.active) },
    { k: 'path', l: 'Шлях збереження', w: 200 },
    { k: 'ratioLim', l: 'Ліміт рейтингу', w: 96, num: true, f: (r) => (r.ratioLim < -1.5 ? 'Глобальний' : r.ratioLim < 0 ? '∞' : ratio(r.ratioLim)) },
    { k: 'lastAct', l: 'Остання активність', w: 120, num: true, v: (r) => (r.lastAct < 0 ? 1e13 : r.lastAct), f: (r) => (r.lastAct < 0 ? 'Ніколи' : r.lastAct === 0 ? 'Зараз' : dur(r.lastAct) + ' тому') },
    { k: 'conns', l: "З'єднань", w: 76, num: true },
  ];
  const COL_MAP = Object.fromEntries(COLS.map((c) => [c.k, c]));
  const DEFAULT_COLS = ['name', 'progress', 'state', 'dl', 'ul', 'eta', 'size', 'seeds', 'peers', 'ratio', 'cat', 'added'];

  const S = It.S = {
    rows: [], byId: new Map(), session: {}, cats: {}, tags: [], save: '',
    sel: new Set(), focus: null, multi: false,
    filter: { status: 'all', cat: null, tag: null, tracker: null, text: '' },
    sort: { col: 'added', dir: -1 }, cols: DEFAULT_COLS.slice(), widths: {},
    tab: 'transfers', ptab: 'general', panelOpen: true, panelH: 0.4,
    logs: [], logSince: 0, fv: '', files: null, tree: null, details: null,
    graph: { dl: [], ul: [] }, sbCollapsed: {}, rssV: -1, started: false, searchOpen: false,
  };

  // ---------------------------------------------------------------- стан інтерфейсу
  let saveT = null;
  function saveUi() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const ui = { sort: S.sort, cols: S.cols, widths: S.widths, ptab: S.ptab, panelOpen: S.panelOpen, panelH: S.panelH, status: S.filter.status, sb: S.sbCollapsed, logLevels: It.logLevels };
      tryApi('ui.save', { ui: JSON.stringify(ui) });
    }, 400);
  }
  function loadUi() {
    let ui = {};
    try { ui = JSON.parse(P.ui || '{}'); } catch (e) {}
    if (ui.sort && COL_MAP[ui.sort.col]) S.sort = ui.sort;
    if (Array.isArray(ui.cols)) S.cols = ui.cols.filter((k) => COL_MAP[k]);
    if (!S.cols.includes('name')) S.cols.unshift('name');
    if (ui.widths) S.widths = ui.widths;
    if (ui.ptab) S.ptab = ui.ptab;
    if (ui.panelOpen !== undefined) S.panelOpen = ui.panelOpen;
    if (ui.panelH) S.panelH = Math.min(0.75, Math.max(0.18, ui.panelH));
    if (ui.status && FILTER_MAP[ui.status]) S.filter.status = ui.status;
    if (ui.sb) S.sbCollapsed = ui.sb;
    if (ui.logLevels) It.logLevels = ui.logLevels;
  }

  // ---------------------------------------------------------------- тема
  function applyTheme() {
    const t = P.theme || 'system';
    const dark = t === 'dark' || (t === 'system' && INFO.dark);
    document.documentElement.classList.toggle('dark', dark);
    tryApi('setBars', { dark });
    It.dark = dark;
  }
  It.applyTheme = applyTheme;

  // ---------------------------------------------------------------- розмітка
  const el = {};
  function build() {
    const app = $('#app');
    // Панель інструментів
    const tb = (icon, title, fn, id) => {
      const b = h('button', { class: 'tb', title, 'aria-label': title, onclick: fn }, svg(I[icon]));
      if (id) el[id] = b;
      return b;
    };
    el.toolbar = h('div', { class: 'toolbar' },
      tb('menu', 'Фільтри', toggleSidebar, 'tbFilters'),
      h('div', { class: 'tb-sep' }),
      tb('addFile', 'Додати торент-файл', () => tryApi('add.file')),
      tb('addLink', 'Додати посилання на торент', () => Dialogs.addLinks()),
      h('div', { class: 'tb-sep' }),
      tb('remove', 'Вилучити', () => removeSelected(), 'tbRemove'),
      h('div', { class: 'tb-sep' }),
      tb('start', 'Запустити', () => act('t.start'), 'tbStart'),
      tb('stop', 'Зупинити', () => act('t.stop'), 'tbStop'),
      h('div', { class: 'tb-fill' }),
      tb('search', 'Фільтр за назвою', toggleSearch, 'tbSearch'),
      tb('gear', 'Налаштування', () => Options.open()),
      tb('more', 'Ще', (e) => mainMenu(e.currentTarget)));
    el.search = h('input', { class: 'field', type: 'search', placeholder: 'Фільтр назв торентів…' });
    el.search.addEventListener('input', () => { S.filter.text = el.search.value; renderTransfers(); });
    el.searchRow = h('div', { class: 'searchrow hidden' }, el.search,
      h('button', { class: 'btn icon', onclick: () => { el.search.value = ''; S.filter.text = ''; toggleSearch(); renderTransfers(); } }, svg(I.close)));

    // Головні вкладки
    const mtab = (id, icon, label) => {
      const t = h('button', { class: 'mtab', onclick: () => setTab(id) }, svg(I[icon]), h('span', { class: 'l' }, label), h('span', { class: 'cnt' }));
      el['mt_' + id] = t;
      return t;
    };
    el.maintabs = h('div', { class: 'maintabs' }, mtab('transfers', 'transfers', 'Передачі'), mtab('rss', 'rssMono', 'RSS'), mtab('log', 'log', 'Журнал'));

    el.notice = h('div', { class: 'notice hidden' }, svg(I.warn), h('span', null, 'Немає доступу до файлів — завантаження зберігаються в папці застосунку.'),
      h('button', { class: 'btn small', onclick: () => tryApi('perm.storage') }, 'Надати доступ'));
    el.chips = h('div', { class: 'filterchips hidden' });
    el.selbar = h('div', { class: 'selbar hidden' }, svg(I.select), h('span', { class: 't' }),
      h('button', { class: 'btn small', onclick: () => { for (const r of visibleRows()) S.sel.add(r.id); renderTransfers(); } }, 'Усі'),
      h('button', { class: 'btn small', onclick: () => { exitMulti(); } }, 'Готово'));

    // Таблиця передач
    el.grid = new Grid(currentCols(), {
      sort: S.sort,
      widths: S.widths,
      onSort: (k) => {
        if (S.sort.col === k) S.sort.dir = -S.sort.dir; else S.sort = { col: k, dir: COL_MAP[k].num || k === 'progress' ? -1 : 1 };
        el.grid.setSort(S.sort);
        saveUi();
        renderTransfers();
      },
      onResize: (k, w) => { S.widths[k] = w; saveUi(); },
      onHeadLong: (pt) => columnsMenu(pt),
      rowClass: (r) => 'st-' + r.state + (S.sel.has(r.id) ? ' sel' : ''),
      onTap: (r) => tapRow(r),
      onLong: (r, pt) => {
        if (!S.sel.has(r.id)) { if (!S.multi) S.sel.clear(); S.sel.add(r.id); S.focus = r.id; renderTransfers(); renderPanel(true); }
        torrentMenu(pt);
      },
    });
    el.empty = h('div', { class: 'empty hidden' });
    el.grid.wrap.appendChild(el.empty);

    // Нижня панель
    el.splitter = h('div', { class: 'splitter' });
    el.propsBody = h('div', { class: 'props-body' });
    el.props = h('div', { class: 'props' }, el.propsBody);
    const ptab = (id, icon, label) => {
      const t = h('button', { class: 'ptab', onclick: () => setPtab(id) }, svg(I[icon]), h('span', null, label));
      el['pt_' + id] = t;
      return t;
    };
    el.ptabs = h('div', { class: 'ptabs' }, ptab('general', 'info', 'Загальне'), ptab('trackers', 'antenna', 'Трекери'), ptab('peers', 'peers', 'Піри'),
      ptab('http', 'globe', 'HTTP'), ptab('content', 'content', 'Вміст'), ptab('speed', 'speed', 'Швидкість'));

    el.transfers = h('div', { class: 'view' }, el.chips, el.selbar, el.grid.wrap, el.splitter, el.props, el.ptabs);
    el.rssView = h('div', { class: 'view hidden' });
    el.logView = h('div', { class: 'view hidden' });
    el.sidebar = h('div', { class: 'sidebar hidden' });
    el.scrim = h('div', { class: 'drawer-scrim hidden', onclick: () => closeDrawer() });
    el.body = h('div', { class: 'body' }, el.sidebar, el.transfers, el.rssView, el.logView, el.scrim);

    el.status = h('div', { class: 'statusbar' });

    app.append(el.toolbar, el.searchRow, el.maintabs, el.notice, el.body, el.status);
    bindSplitter();
    window.addEventListener('resize', () => { layoutPanel(); layoutSidebar(); });
  }

  function currentCols() { return S.cols.map((k) => COL_MAP[k]).filter(Boolean).sort((a, b) => (a.k === 'name' ? -1 : b.k === 'name' ? 1 : 0)); }

  // ---------------------------------------------------------------- рядки
  function nameCell(td, r) {
    if (!td._init) {
      td._init = true;
      td._ic = h('span', { style: { display: 'contents' } });
      td._tx = h('span');
      td.appendChild(h('div', { class: 'nm' }, td._ic, td._tx));
    }
    if (td._st !== r.state) {
      td._st = r.state;
      td._ic.innerHTML = '';
      td._ic.appendChild(svg(I.st[r.state] || I.st.stoppedDL));
    }
    if (td._tx.textContent !== r.name) td._tx.textContent = r.name;
  }

  function filtered() {
    const f = S.filter;
    const fs = FILTER_MAP[f.status] || FILTERS[0];
    const t = f.text.trim().toLowerCase();
    const words = t ? t.split(/\s+/) : [];
    return S.rows.filter((r) => {
      if (!fs[2](r)) return false;
      if (f.cat !== null && r.cat !== f.cat) return false;
      if (f.tag !== null) { if (f.tag === '' ? r.tags.length > 0 : !r.tags.includes(f.tag)) return false; }
      if (f.tracker !== null) { if (host(r.tracker) !== f.tracker) return false; }
      if (words.length) { const n = r.name.toLowerCase(); if (!words.every((w) => n.includes(w))) return false; }
      return true;
    });
  }

  function visibleRows() {
    const rows = filtered();
    const c = COL_MAP[S.sort.col] || COL_MAP.added;
    const val = c.v || ((r) => r[c.k]);
    const d = S.sort.dir;
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      let r = typeof x === 'string' ? x.localeCompare(y, 'uk', { numeric: true }) : (x - y);
      if (!r) r = a.added - b.added;
      return r * d;
    });
    return rows;
  }

  function renderTransfers() {
    if (!el.grid) return;
    const rows = visibleRows();
    el.grid.setRows(rows, (r) => r.id);
    el.empty.classList.toggle('hidden', rows.length > 0);
    if (!rows.length) {
      el.empty.innerHTML = '';
      if (!S.rows.length) {
        el.empty.append(svg(I.transfers), h('div', null, S.started ? 'Список передач порожній' : 'Запуск сесії…'),
          h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
            h('button', { class: 'btn', onclick: () => tryApi('add.file') }, svg(I.addFile), 'Торент-файл'),
            h('button', { class: 'btn', onclick: () => Dialogs.addLinks() }, svg(I.addLink), 'Посилання')));
      } else {
        el.empty.append(svg(I.filters), h('div', null, 'Немає торентів, що відповідають фільтру'));
      }
    }
    // Лічильник у вкладці
    const n = S.rows.length;
    const cnt = el.mt_transfers.querySelector('.cnt');
    const txt = rows.length !== n ? '(' + rows.length + '/' + n + ')' : '(' + n + ')';
    if (cnt.textContent !== txt) cnt.textContent = txt;
    // Панель інструментів
    const any = S.sel.size > 0;
    el.tbRemove.disabled = !any;
    el.tbStart.disabled = !any;
    el.tbStop.disabled = !any;
    // Рядок вибору
    el.selbar.classList.toggle('hidden', !S.multi);
    if (S.multi) el.selbar.querySelector('.t').textContent = 'Вибрано: ' + S.sel.size;
    renderChips();
  }

  function renderChips() {
    const f = S.filter;
    const parts = [];
    if (f.status !== 'all') parts.push(['status', FILTER_MAP[f.status][1], I.flt[f.status]]);
    if (f.cat !== null) parts.push(['cat', f.cat === '' ? 'Без категорії' : f.cat, I.category]);
    if (f.tag !== null) parts.push(['tag', f.tag === '' ? 'Без міток' : f.tag, I.tag]);
    if (f.tracker !== null) parts.push(['tracker', f.tracker, I.trackerHost]);
    const key = JSON.stringify(parts.map((p) => p.slice(0, 2)));
    if (el.chips._k === key) return;
    el.chips._k = key;
    el.chips.innerHTML = '';
    el.chips.classList.toggle('hidden', !parts.length);
    for (const p of parts) {
      el.chips.appendChild(h('span', { class: 'chip' }, svg(p[2]), h('b', null, p[1]),
        h('button', { class: 'x', 'aria-label': 'Скинути фільтр', onclick: () => { if (p[0] === 'status') f.status = 'all'; else f[p[0]] = null; saveUi(); renderAll(); } }, svg(I.close))));
    }
  }

  function tapRow(r) {
    if (S.multi) {
      if (S.sel.has(r.id)) S.sel.delete(r.id); else S.sel.add(r.id);
      S.focus = r.id;
      if (!S.sel.size) exitMulti();
    } else {
      S.sel.clear();
      S.sel.add(r.id);
      if (S.focus !== r.id) { S.focus = r.id; resetDetails(); }
      if (!S.panelOpen) { S.panelOpen = true; layoutPanel(); saveUi(); }
    }
    renderTransfers();
    renderPanel(true);
    pollSoon();
  }

  function exitMulti() {
    S.multi = false;
    if (S.focus && S.byId.has(S.focus)) { S.sel = new Set([S.focus]); } else S.sel.clear();
    renderTransfers();
  }

  function selectedIds() { return Array.from(S.sel).filter((id) => S.byId.has(id)); }
  function selectedRows() { return selectedIds().map((id) => S.byId.get(id)); }

  function act(method, extra) {
    const ids = selectedIds();
    if (!ids.length) return;
    tryApi(method, Object.assign({ ids }, extra || {}));
    pollSoon();
  }
  It.act = act;
  It.selectedIds = selectedIds;
  It.selectedRows = selectedRows;

  function removeSelected() {
    const rows = selectedRows();
    if (!rows.length) return;
    Dialogs.remove(rows).then((files) => {
      if (files === undefined) return;
      tryApi('t.remove', { ids: rows.map((r) => r.id), files });
      for (const r of rows) S.sel.delete(r.id);
      if (S.focus && rows.some((r) => r.id === S.focus)) { S.focus = null; resetDetails(); }
      if (S.multi && !S.sel.size) S.multi = false;
      pollSoon();
    });
  }
  It.removeSelected = removeSelected;

  // ---------------------------------------------------------------- меню торента
  function torrentMenu(pt) {
    const rows = selectedRows();
    if (!rows.length) return;
    const one = rows.length === 1 ? rows[0] : null;
    const allStopped = rows.every((r) => STOPPED.has(r.state));
    const anyStopped = rows.some((r) => STOPPED.has(r.state));
    const ids = rows.map((r) => r.id);
    const allSeq = rows.every((r) => r.seq);
    const allFl = rows.every((r) => r.fl);
    const allDone = rows.every((r) => r.progress >= 1);
    const title = one ? one.name : rows.length + ' ' + plural(rows.length, 'торент', 'торенти', 'торентів');
    const catItems = () => {
      const list = [{ label: 'Нова…', icon: I.plus, action: () => Dialogs.category(null).then((c) => { if (c) { tryApi('t.category', { ids, cat: c }); pollSoon(); } }) },
        { label: 'Скинути', icon: I.close, action: () => { tryApi('t.category', { ids, cat: '' }); pollSoon(); } }, '-'];
      for (const c of Object.keys(S.cats).sort((a, b) => a.localeCompare(b, 'uk'))) {
        list.push({ label: c, checked: rows.every((r) => r.cat === c), action: () => { tryApi('t.category', { ids, cat: c }); pollSoon(); } });
      }
      return list;
    };
    const tagItems = () => {
      const list = [{ label: 'Додати…', icon: I.plus, action: () => U.prompt('Додати мітки', 'Мітки через кому', '', { icon: I.tag }).then((v) => {
        if (!v) return;
        const add = v.split(',').map((s) => s.trim()).filter(Boolean);
        tryApi('t.tags', { ids, add });
        pollSoon();
      }) },
      { label: 'Вилучити всі', icon: I.close, action: () => { tryApi('t.tags', { ids, clear: true }); pollSoon(); } }, '-'];
      for (const t of S.tags.slice().sort((a, b) => a.localeCompare(b, 'uk'))) {
        const has = rows.every((r) => r.tags.includes(t));
        list.push({ label: t, checked: has, action: () => { tryApi('t.tags', has ? { ids, remove: [t] } : { ids, add: [t] }); pollSoon(); } });
      }
      return list;
    };
    const copyItems = [
      { label: 'Назва', action: () => copy(rows.map((r) => r.name).join('\n')) },
      { label: 'Хеш інформації', action: () => copy(ids.join('\n')) },
      { label: 'Magnet-посилання', action: () => { const m = tryApi('t.magnet', { ids }); if (m) copy(m); } },
      { label: 'Шлях збереження', action: () => copy(rows.map((r) => r.path).join('\n')) },
    ];
    const queueItems = [
      { label: 'На початок черги', icon: I.qtop, action: () => act('t.queue', { op: 'top' }) },
      { label: 'Вгору', icon: I.qup, action: () => act('t.queue', { op: 'up' }) },
      { label: 'Вниз', icon: I.qdown, action: () => act('t.queue', { op: 'down' }) },
      { label: 'У кінець черги', icon: I.qbottom, action: () => act('t.queue', { op: 'bottom' }) },
    ];
    const items = [
      anyStopped ? { label: 'Запустити', icon: I.start, action: () => act('t.start') } : null,
      !allStopped ? { label: 'Зупинити', icon: I.stop, action: () => act('t.stop') } : null,
      { label: 'Примусовий запуск', icon: I.force, action: () => act('t.force') },
      '-',
      { label: 'Вилучити', icon: I.remove, action: removeSelected },
      '-',
      { label: 'Змінити розташування…', icon: I.location, action: () => U.browse({ path: one ? one.path : S.save, title: 'Нове розташування' }).then((p) => { if (p) act('t.location', { path: p }); }) },
      one ? { label: 'Перейменувати…', icon: I.rename, action: () => U.prompt('Перейменувати торент', 'Нова назва', one.name, { icon: I.rename }).then((v) => { if (v && v.trim()) { tryApi('t.rename', { id: one.id, name: v.trim() }); pollSoon(); } }) } : null,
      { label: 'Категорія', icon: I.category, items: catItems },
      { label: 'Мітки', icon: I.tag, items: tagItems },
      '-',
      { label: 'Обмежити швидкість завантаження…', icon: I.limitDl, action: () => Dialogs.rateLimit('dl', rows) },
      { label: 'Обмежити швидкість вивантаження…', icon: I.limitUl, action: () => Dialogs.rateLimit('ul', rows) },
      { label: 'Обмежити рейтинг роздачі…', icon: I.ratio, action: () => Dialogs.shareLimit(rows) },
      '-',
      allDone ? { label: 'Суперроздача', checked: rows.every((r) => r.superSeed), action: () => act('t.superSeed', { on: !rows.every((r) => r.superSeed) }) } : null,
      { label: 'Завантажувати послідовно', checked: allSeq, action: () => act('t.seq', { on: !allSeq }) },
      { label: 'Спершу перша й остання частини', checked: allFl, action: () => act('t.firstLast', { on: !allFl }) },
      '-',
      { label: 'Примусова перевірка', icon: I.recheck, action: () => act('t.recheck') },
      { label: 'Примусове оголошення', icon: I.announce, action: () => act('t.reannounce') },
      P.queueing ? { label: 'Черга', icon: I.queue, items: queueItems } : null,
      '-',
      { label: 'Копіювати', icon: I.copy, items: copyItems },
      { label: 'Поділитися magnet-посиланням', icon: I.share, action: () => act('t.shareMagnet') },
      { label: 'Експортувати .torrent…', icon: I.export, action: () => exportTorrents(rows) },
      one ? { label: 'Переглянути файл…', icon: I.play, action: () => previewFile(one) } : null,
      '-',
      S.multi ? { label: 'Вибрати всі видимі', icon: I.select, action: () => { for (const r of visibleRows()) S.sel.add(r.id); renderTransfers(); } }
        : { label: 'Вибрати кілька', icon: I.select, action: () => { S.multi = true; renderTransfers(); } },
    ];
    menu(items, pt, title);
  }

  function copy(text) {
    if (tryApi('copy', { text }) !== undefined) toast('Скопійовано');
  }
  It.copy = copy;

  function exportTorrents(rows) {
    U.browse({ path: S.save, title: 'Куди зберегти .torrent' }).then((dir) => {
      if (!dir) return;
      const p = tryApi('t.export', { ids: rows.map((r) => r.id), dir });
      if (p !== undefined) toast('Експортується до ' + dir);
    });
  }

  function previewFile(r) {
    S.ptab = 'content';
    S.panelOpen = true;
    layoutPanel();
    renderPanel(true);
    pollSoon();
    toast('Виберіть файл і натисніть «Переглянути»');
  }

  function columnsMenu(pt) {
    const items = COLS.filter((c) => c.k !== 'name').map((c) => ({
      label: c.l, checked: S.cols.includes(c.k),
      action: () => {
        if (S.cols.includes(c.k)) S.cols = S.cols.filter((k) => k !== c.k); else {
          // вставити в порядку визначення
          const order = COLS.map((x) => x.k);
          S.cols.push(c.k);
          S.cols.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        }
        el.grid.setCols(currentCols());
        saveUi();
        renderTransfers();
      },
    }));
    items.push('-', { label: 'Типовий набір стовпців', icon: I.refresh, action: () => { S.cols = DEFAULT_COLS.slice(); S.widths = {}; el.grid.o.widths = S.widths; el.grid.setCols(currentCols()); saveUi(); renderTransfers(); } });
    menu(items, pt, 'Стовпці');
  }

  function mainMenu(btn) {
    const r = btn.getBoundingClientRect();
    const alt = !!S.session.alt;
    menu([
      { label: 'Додати торент-файл…', icon: I.addFile, action: () => tryApi('add.file') },
      { label: 'Додати посилання на торент…', icon: I.addLink, action: () => Dialogs.addLinks() },
      { label: 'Створити торент…', icon: I.create, action: () => Dialogs.creator() },
      '-',
      { label: 'Запустити всі', icon: I.start, action: () => { tryApi('startAll'); pollSoon(); } },
      { label: 'Зупинити всі', icon: I.stop, action: () => { tryApi('stopAll'); pollSoon(); } },
      '-',
      { label: 'Альтернативні ліміти швидкості', checked: alt, action: toggleAlt },
      { label: 'Глобальні ліміти швидкості…', icon: I.speed, action: () => Dialogs.globalLimits() },
      { label: 'Статистика', icon: I.stats, action: () => Dialogs.stats() },
      '-',
      { label: 'Налаштування', icon: I.gear, action: () => Options.open() },
      { label: 'Про програму', icon: I.info, action: () => Dialogs.about() },
      '-',
      { label: 'Вихід', icon: I.power, action: exitApp },
    ], { x: r.right - 240, y: r.bottom + 2 });
  }

  function exitApp() {
    U.confirm('Вихід', 'Зупинити всі передачі й закрити Itorrent?', 'Вийти', { icon: I.power }).then((ok) => {
      if (!ok) return;
      showExiting();
      tryApi('exit');
    });
  }
  function showExiting() {
    if ($('.exiting')) return;
    document.body.appendChild(h('div', { class: 'scrim exiting', style: { zIndex: 90 } },
      h('div', { class: 'dlg', style: { width: '260px' } }, h('div', { class: 'loading-row' }, h('span', { class: 'spin' }), 'Збереження стану й вихід…'))));
  }

  function toggleAlt() {
    const v = tryApi('alt.toggle');
    if (v !== undefined) { S.session.alt = v; P.altEnabled = v; renderStatus(); toast(v ? 'Увімкнено альтернативні ліміти швидкості' : 'Вимкнено альтернативні ліміти швидкості'); }
  }
  It.toggleAlt = toggleAlt;

  // ---------------------------------------------------------------- вкладки
  function setTab(t) {
    S.tab = t;
    for (const id of ['transfers', 'rss', 'log']) el['mt_' + id].classList.toggle('on', id === t);
    el.transfers.classList.toggle('hidden', t !== 'transfers');
    el.rssView.classList.toggle('hidden', t !== 'rss');
    el.logView.classList.toggle('hidden', t !== 'log');
    if (t === 'rss') Rss.show(el.rssView);
    if (t === 'log') renderLog(true);
    layoutSidebar();
  }
  It.setTab = setTab;

  function toggleSearch() {
    S.searchOpen = !S.searchOpen;
    el.searchRow.classList.toggle('hidden', !S.searchOpen);
    el.tbSearch.classList.toggle('on', S.searchOpen);
    if (S.searchOpen) { if (S.tab !== 'transfers') setTab('transfers'); setTimeout(() => el.search.focus(), 50); }
    else { el.search.blur(); }
  }

  // ---------------------------------------------------------------- бічна панель
  const wide = () => window.innerWidth >= 760;
  let drawerOpen = false;
  function toggleSidebar() {
    if (wide()) { S.sbHidden = !S.sbHidden; layoutSidebar(); return; }
    if (drawerOpen) closeDrawer(); else { drawerOpen = true; layoutSidebar(); }
  }
  function closeDrawer() { if (!drawerOpen) return false; drawerOpen = false; layoutSidebar(); return true; }
  function layoutSidebar() {
    const show = S.tab === 'transfers' && (wide() ? !S.sbHidden : drawerOpen);
    el.sidebar.classList.toggle('hidden', !show);
    el.sidebar.classList.toggle('drawer', !wide());
    el.scrim.classList.toggle('hidden', !(show && !wide()));
    el.tbFilters.classList.toggle('on', show);
    if (show) renderSidebar();
  }

  function renderSidebar() {
    if (el.sidebar.classList.contains('hidden')) return;
    const f = S.filter;
    const rows = S.rows;
    const frag = document.createDocumentFragment();
    const section = (id, label, items, action) => {
      const collapsed = !!S.sbCollapsed[id];
      const head = h('div', { class: 'sb-head' + (collapsed ? ' collapsed' : ''), onclick: (e) => { if (e.target.closest('.act')) return; S.sbCollapsed[id] = !collapsed; saveUi(); renderSidebar(); } },
        svg(I.chevD, 'tw'), h('span', null, label), action ? h('button', { class: 'act', 'aria-label': action.label, onclick: action.fn }, svg(I.plus)) : null);
      frag.appendChild(head);
      if (collapsed) return;
      for (const it of items) {
        const row = h('div', { class: 'sb-item' + (it.on ? ' on' : '') }, svg(it.icon), h('span', { class: 'lbl' }, it.label), h('span', { class: 'n' }, '(' + it.n + ')'));
        row.addEventListener('click', () => { it.pick(); saveUi(); renderAll(); if (!wide()) closeDrawer(); });
        if (it.menu) U.longPress(row, (e, pt) => it.menu(pt));
        frag.appendChild(row);
      }
    };
    section('status', 'Стан', FILTERS.map(([id, label, fn]) => ({
      icon: I.flt[id], label, n: rows.filter(fn).length, on: f.status === id, pick: () => { f.status = id; },
    })));
    const cats = Object.keys(S.cats).sort((a, b) => a.localeCompare(b, 'uk'));
    section('cats', 'Категорії', [
      { icon: I.category, label: 'Усі', n: rows.length, on: f.cat === null, pick: () => { f.cat = null; } },
      { icon: I.category, label: 'Без категорії', n: rows.filter((r) => !r.cat).length, on: f.cat === '', pick: () => { f.cat = ''; } },
      ...cats.map((c) => ({ icon: I.category, label: c, n: rows.filter((r) => r.cat === c).length, on: f.cat === c, pick: () => { f.cat = c; }, menu: (pt) => categoryMenu(c, pt) })),
    ], { label: 'Нова категорія', fn: () => Dialogs.category(null) });
    const tags = S.tags.slice().sort((a, b) => a.localeCompare(b, 'uk'));
    section('tags', 'Мітки', [
      { icon: I.tag, label: 'Усі', n: rows.length, on: f.tag === null, pick: () => { f.tag = null; } },
      { icon: I.untagged, label: 'Без міток', n: rows.filter((r) => !r.tags.length).length, on: f.tag === '', pick: () => { f.tag = ''; } },
      ...tags.map((t) => ({ icon: I.tag, label: t, n: rows.filter((r) => r.tags.includes(t)).length, on: f.tag === t, pick: () => { f.tag = t; }, menu: (pt) => tagMenu(t, pt) })),
    ], { label: 'Нова мітка', fn: () => U.prompt('Нова мітка', 'Назва мітки', '', { icon: I.tag }).then((v) => { if (v && v.trim()) { tryApi('tag.add', { name: v.trim() }); pollSoon(); } }) });
    const hosts = new Map();
    for (const r of rows) { const hh = host(r.tracker); if (hh) hosts.set(hh, (hosts.get(hh) || 0) + 1); }
    section('trackers', 'Трекери', [
      { icon: I.trackerHost, label: 'Усі', n: rows.length, on: f.tracker === null, pick: () => { f.tracker = null; } },
      ...Array.from(hosts.keys()).sort().map((hh) => ({ icon: I.trackerHost, label: hh, n: hosts.get(hh), on: f.tracker === hh, pick: () => { f.tracker = hh; } })),
    ]);
    el.sidebar.innerHTML = '';
    el.sidebar.appendChild(frag);
  }

  function categoryMenu(c, pt) {
    menu([
      { label: 'Змінити категорію…', icon: I.edit, action: () => Dialogs.category(c) },
      { label: 'Вилучити категорію', icon: I.remove, action: () => U.confirm('Вилучити категорію', 'Вилучити категорію «' + U.esc(c) + '»? Торенти залишаться у списку без категорії.', 'Вилучити').then((ok) => { if (ok) { tryApi('cat.remove', { name: c }); if (S.filter.cat === c) S.filter.cat = null; pollSoon(); } }) },
      '-',
      { label: 'Запустити торенти', icon: I.start, action: () => { tryApi('t.start', { ids: S.rows.filter((r) => r.cat === c).map((r) => r.id) }); pollSoon(); } },
      { label: 'Зупинити торенти', icon: I.stop, action: () => { tryApi('t.stop', { ids: S.rows.filter((r) => r.cat === c).map((r) => r.id) }); pollSoon(); } },
    ], pt, c);
  }
  function tagMenu(t, pt) {
    menu([
      { label: 'Вилучити мітку', icon: I.remove, action: () => { tryApi('tag.remove', { name: t }); if (S.filter.tag === t) S.filter.tag = null; pollSoon(); } },
      '-',
      { label: 'Запустити торенти', icon: I.start, action: () => { tryApi('t.start', { ids: S.rows.filter((r) => r.tags.includes(t)).map((r) => r.id) }); pollSoon(); } },
      { label: 'Зупинити торенти', icon: I.stop, action: () => { tryApi('t.stop', { ids: S.rows.filter((r) => r.tags.includes(t)).map((r) => r.id) }); pollSoon(); } },
    ], pt, t);
  }

  // ---------------------------------------------------------------- нижня панель
  function setPtab(t) {
    if (S.ptab === t) {
      S.panelOpen = !S.panelOpen;
    } else {
      S.ptab = t;
      S.panelOpen = true;
      resetDetailsTab();
    }
    layoutPanel();
    saveUi();
    renderPanel(true);
    pollSoon();
  }

  function layoutPanel() {
    for (const id of ['general', 'trackers', 'peers', 'http', 'content', 'speed']) el['pt_' + id].classList.toggle('on', S.panelOpen && id === S.ptab);
    el.props.classList.toggle('hidden', !S.panelOpen);
    el.splitter.classList.toggle('hidden', !S.panelOpen);
    const avail = el.transfers.clientHeight || (window.innerHeight - 160);
    el.props.style.height = Math.round(avail * S.panelH) + 'px';
  }

  function bindSplitter() {
    let startY = 0, startH = 0, avail = 0;
    el.splitter.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      startH = el.props.getBoundingClientRect().height;
      avail = el.transfers.clientHeight;
      el.splitter.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const hh = Math.max(80, Math.min(avail - 120, startH - (ev.clientY - startY)));
        el.props.style.height = hh + 'px';
      };
      const up = () => {
        el.splitter.removeEventListener('pointermove', move);
        el.splitter.removeEventListener('pointerup', up);
        S.panelH = el.props.getBoundingClientRect().height / avail;
        saveUi();
      };
      el.splitter.addEventListener('pointermove', move);
      el.splitter.addEventListener('pointerup', up);
    });
  }

  function resetDetails() { S.fv = ''; S.files = null; S.tree = null; S.details = null; Panel.reset(); }
  function resetDetailsTab() { S.details = null; Panel.reset(); }
  It.resetDetails = resetDetails;

  function renderPanel(force) {
    if (!S.panelOpen) return;
    Panel.render(el.propsBody, force);
  }

  // ---------------------------------------------------------------- рядок стану
  function renderStatus() {
    const s = S.session || {};
    const key = JSON.stringify([s.dl, s.ul, s.dlS, s.ulS, s.dht, s.conn, s.alt, s.dlLim, s.ulLim, s.pause, s.free]);
    if (el.status._k === key) return;
    el.status._k = key;
    el.status.innerHTML = '';
    const sbx = (cls, kids, fn, title) => {
      const b = h('button', { class: 'sbx ' + (cls || ''), title: title || '', onclick: fn }, kids);
      el.status.appendChild(b);
      return b;
    };
    if (s.pause) sbx('warn', [svg(I.pause), s.pause], () => U.alert('Передачі призупинено', U.esc(s.pause) + '. Умови роботи можна змінити в налаштуваннях, розділ «Живлення й мережа».', I.pause));
    const conn = s.conn === 'online' ? I.connOn : s.conn === 'firewalled' ? I.connFw : I.connOff;
    const connTitle = s.conn === 'online' ? "Стан з'єднання: у мережі" : s.conn === 'firewalled' ? "Стан з'єднання: за брандмауером. Немає вхідних з'єднань." : "Стан з'єднання: немає з'єднання";
    sbx('icon', [svg(conn)], () => U.alert("Стан з'єднання", U.esc(connTitle) + '<br><br>Порт: ' + (s.port || '—') + (s.ip ? '<br>Зовнішня IP-адреса: ' + U.esc(s.ip) : ''), I.globe), connTitle);
    const turtle = svg(I.turtle);
    if (s.alt) turtle.style.setProperty('--tc', 'var(--sel)');
    const tb = sbx('icon', [turtle], toggleAlt, s.alt ? 'Альтернативні ліміти увімкнено' : 'Альтернативні ліміти вимкнено');
    tb.style.color = s.alt ? 'var(--accent)' : 'var(--muted)';
    const lim = (v) => (v > 0 ? h('span', { class: 'lim' }, '[' + speed(v * 1024) + ']') : null);
    const narrow = window.innerWidth < 480;
    const tot = (v) => (narrow ? null : h('span', { class: 'tot' }, '(' + size(v || 0) + ')'));
    sbx('', [svg(I.dl), speed(s.dl), lim(s.dlLim), tot(s.dlS)], () => Dialogs.globalLimits(), 'Завантаження за сеанс: ' + size(s.dlS || 0));
    sbx('', [svg(I.ul), speed(s.ul), lim(s.ulLim), tot(s.ulS)], () => Dialogs.globalLimits(), 'Вивантаження за сеанс: ' + size(s.ulS || 0));
    sbx('', ['DHT: ' + (s.dht || 0) + ' ' + plural(s.dht || 0, 'вузол', 'вузли', 'вузлів')], () => Dialogs.stats());
    if (s.free >= 0) sbx('', [svg(I.hdd), 'Вільно: ' + size(s.free)], null);
  }

  // ---------------------------------------------------------------- журнал
  It.logLevels = { 0: true, 1: true, 2: true, 3: true };
  function renderLog(full) {
    if (S.tab !== 'log') return;
    const v = el.logView;
    if (full || !v._list) {
      v.innerHTML = '';
      const tools = h('div', { class: 'rss-tools' });
      const lv = [[0, 'Звичайні'], [1, 'Інформація'], [2, 'Попередження'], [3, 'Критичні']];
      for (const [k, l] of lv) {
        const c = U.check(l, It.logLevels[k], (on) => { It.logLevels[k] = on; saveUi(); renderLog(true); });
        c.style.marginRight = '6px';
        c.style.fontSize = '12px';
        c.style.minHeight = '34px';
        tools.appendChild(c);
      }
      v._list = h('div', { class: 'log' });
      U.longPress(v._list, (e, pt) => {
        const line = e.target.closest('.log-line');
        menu([
          line ? { label: 'Копіювати', icon: I.copy, action: () => copy(line.textContent) } : null,
          { label: 'Копіювати все', icon: I.copy, action: () => copy(S.logs.map((l) => U.date(l[1]) + ' ' + l[3]).join('\n')) },
          { label: 'Очистити', icon: I.trash, action: () => { S.logs = []; renderLog(true); } },
        ], pt);
      });
      v.append(tools, v._list);
      v._n = 0;
    }
    const list = v._list;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
    const frag = document.createDocumentFragment();
    for (let i = v._n; i < S.logs.length; i++) {
      const l = S.logs[i];
      if (!It.logLevels[l[2]]) continue;
      frag.appendChild(h('div', { class: 'log-line l' + l[2] }, h('span', { class: 't' }, U.date(l[1]).slice(11) + ':' + String(new Date(l[1]).getSeconds()).padStart(2, '0')), h('span', { class: 'm' }, l[3])));
    }
    v._n = S.logs.length;
    list.appendChild(frag);
    if (atBottom || full) list.scrollTop = list.scrollHeight;
  }

  // ---------------------------------------------------------------- опитування рушія
  let pollT = null;
  let busy = false;
  function pollSoon() { clearTimeout(pollT); pollT = setTimeout(poll, 60); }
  It.pollSoon = pollSoon;

  function poll() {
    clearTimeout(pollT);
    pollT = setTimeout(poll, document.hidden ? 3000 : 1000);
    if (busy || document.hidden) return;
    busy = true;
    try {
      let r;
      try {
        r = api('poll', { sel: S.focus || '', tab: S.panelOpen ? S.ptab : '', fv: S.fv, logSince: S.logSince });
      } catch (e) { return; }
      S.started = r.started;
      S.session = r.s || {};
      S.rows = r.t || [];
      S.byId = new Map(S.rows.map((x) => [x.id, x]));
      S.cats = r.cats || {};
      S.tags = r.tags || [];
      S.save = r.save || S.save;
      if (r.logs && r.logs.length) {
        for (const l of r.logs) S.logs.push(l);
        S.logSince = r.logs[r.logs.length - 1][0];
        if (S.logs.length > 2000) { S.logs.splice(0, S.logs.length - 2000); if (el.logView._n) el.logView._n = 0, el.logView._list = null; }
      }
      const g = S.graph;
      g.dl.push(S.session.dl || 0);
      g.ul.push(S.session.ul || 0);
      if (g.dl.length > 1800) { g.dl.shift(); g.ul.shift(); }
      for (const id of Array.from(S.sel)) if (!S.byId.has(id)) S.sel.delete(id);
      if (S.focus && !S.byId.has(S.focus) && S.started) { S.focus = null; resetDetails(); }
      if (r.d && r.d.id === S.focus) {
        S.details = r.d;
        if (r.d.content && r.d.content.files) { S.fv = r.d.content.v; S.files = r.d.content.files; S.tree = null; }
      }
      if (r.rssV !== undefined && r.rssV !== S.rssV) { S.rssV = r.rssV; if (S.tab === 'rss') Rss.refresh(); }
      renderAll();
      el.notice.classList.toggle('hidden', S.session.storage !== false);
    } finally {
      busy = false;
    }
  }

  function renderAll() {
    if (S.tab === 'transfers') { renderTransfers(); renderPanel(false); }
    else renderTransfers();
    renderSidebar();
    renderStatus();
    renderLog(false);
  }
  It.renderAll = renderAll;

  // ---------------------------------------------------------------- події від рушія
  It.onEvent = function (type, d) {
    switch (type) {
      case 'toast': toast(d.msg); break;
      case 'error': toast(d.msg, true); break;
      case 'preview': Dialogs.addTorrent(d); break;
      case 'preview.meta': Dialogs.previewMeta(d); break;
      case 'finished': toast('Завантаження завершено: ' + d.name); break;
      case 'added': pollSoon(); break;
      case 'create.progress': case 'create.done': case 'create.error': Dialogs.creatorEvent(type, d); break;
      case 'rss': if (S.tab === 'rss') Rss.refresh(); break;
      case 'storage':
        INFO.storage = d.granted;
        if (d.granted) toast('Доступ до файлів надано. Типова папка: ' + d.savePath);
        pollSoon();
        break;
      case 'ipfilter': Options.onIpFilter(d); break;
      case 'theme': INFO.dark = d.dark; applyTheme(); break;
      case 'select':
        if (S.byId.has(d.id)) { S.sel = new Set([d.id]); S.focus = d.id; resetDetails(); setTab('transfers'); renderAll(); }
        else setTimeout(() => It.onEvent('select', d), 1200);
        break;
      case 'exit': showExiting(); break;
    }
  };

  It.back = function () {
    if (closeMenu()) return true;
    if (U.stack.length) { U.stack[U.stack.length - 1].back(); return true; }
    if (closeDrawer()) return true;
    if (Rss.back && S.tab === 'rss' && Rss.back()) return true;
    if (S.searchOpen) { toggleSearch(); return true; }
    if (S.multi) { exitMulti(); return true; }
    if (S.tab !== 'transfers') { setTab('transfers'); return true; }
    return false;
  };

  It.prefs = () => P;
  It.setPrefs = (p) => { P = p; };
  It.info = () => INFO;

  // ---------------------------------------------------------------- запуск
  function start() {
    try { INFO = api('init'); } catch (e) { console.error('init: ' + e.message); document.body.textContent = 'Не вдалося запустити: ' + e.message; return; }
    if (INFO.debug) console.log('ui start');
    P = INFO.prefs;
    loadUi();
    applyTheme();
    build();
    setTab('transfers');
    layoutPanel();
    layoutSidebar();
    poll();
    setTimeout(layoutPanel, 50);
    if (!P.firstRunDone) setTimeout(() => Dialogs.welcome(), 400);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollSoon(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
