// Нижня панель властивостей вибраного торента: Загальне, Трекери, Піри, HTTP-джерела, Вміст, Швидкість.
(function () {
  const { h, svg, size, speed, eta, dur, ratio, date, tryApi, menu, toast, plural } = U;
  const S = () => It.S;

  let mounted = null; // { tab, id, root, ... }

  function reset() { mounted = null; }

  function render(container, force) {
    const s = S();
    const tab = s.ptab;
    const id = s.focus;
    const needsTorrent = tab !== 'speed';
    const key = tab + ':' + (needsTorrent ? id : '');
    if (!mounted || mounted.key !== key || force && mounted.key !== key) {
      container.innerHTML = '';
      mounted = { key, tab, id };
      if (needsTorrent && !id) {
        container.appendChild(h('div', { class: 'pane-empty' }, 'Виберіть торент у списку, щоб побачити його властивості.'));
        mounted.empty = true;
        return;
      }
      const m = MOUNT[tab];
      if (m) m(container, mounted);
    }
    if (mounted.empty) return;
    const u = UPDATE[tab];
    if (u) u(mounted, s.details && s.details.tab === tab ? s.details[tab] : null);
  }

  // ---------------------------------------------------------------- Загальне
  function drawBar(canvas, bins, partial, color, partColor, maxVal) {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, w, hh);
    if (!bins || !bins.length) return;
    const n = bins.length;
    const cs = getComputedStyle(document.documentElement);
    const col = cs.getPropertyValue(color).trim();
    const pcol = partColor ? cs.getPropertyValue(partColor).trim() : null;
    for (let i = 0; i < n; i++) {
      const x0 = Math.floor(i * w / n), x1 = Math.floor((i + 1) * w / n);
      const v = maxVal ? Math.min(1, bins[i] / maxVal) : bins[i] / 100;
      if (v > 0) {
        c.globalAlpha = maxVal ? 0.25 + 0.75 * v : Math.max(0.15, v);
        c.fillStyle = col;
        c.fillRect(x0, 0, Math.max(1, x1 - x0), hh);
      } else if (partial && partial[i] > 0 && pcol) {
        c.globalAlpha = 0.85;
        c.fillStyle = pcol;
        c.fillRect(x0, 0, Math.max(1, x1 - x0), hh);
      }
    }
    c.globalAlpha = 1;
  }

  const GEN_FIELDS = {
    transfer: [
      ['timeActive', 'Активний час'], ['eta', 'Залишилось'], ['conns', "З'єднання"],
      ['dl', 'Завантажено'], ['ul', 'Вивантажено'], ['seeds', 'Сіди'],
      ['dlSpeed', 'Швидкість завантаження'], ['ulSpeed', 'Швидкість вивантаження'], ['peers', 'Піри'],
      ['dlLim', 'Ліміт завантаження'], ['ulLim', 'Ліміт вивантаження'], ['wasted', 'Втрачено'],
      ['ratio', 'Рейтинг'], ['reannounce', 'Наступне оголошення'], ['lastSeen', 'Востаннє бачили завершеним'],
      ['popularity', 'Популярність'],
    ],
    info: [
      ['totalSize', 'Загальний розмір'], ['pieces', 'Частин'], ['createdBy', 'Створено програмою'],
      ['added', 'Додано'], ['completed', 'Завершено'], ['created', 'Дата створення'],
      ['priv', 'Приватний'], ['v1', 'Хеш інформації v1', true], ['v2', 'Хеш інформації v2', true],
      ['savePath', 'Шлях збереження', true], ['comment', 'Коментар', true],
    ],
  };

  function mountGeneral(c, m) {
    const pad = h('div', { class: 'pane-pad' });
    m.pc = h('canvas');
    m.ac = h('canvas');
    m.pv = h('span', { class: 'v' });
    m.av = h('span', { class: 'v' });
    pad.append(
      h('div', { class: 'pbar-row' }, h('span', { class: 'k' }, 'Прогрес:'), m.pc, m.pv),
      h('div', { class: 'pbar-row' }, h('span', { class: 'k' }, 'Доступність:'), m.ac, m.av));
    m.err = h('div', { class: 'notice hidden', style: { margin: '6px 0', borderRadius: '3px', border: '1px solid var(--warn-line)' } });
    pad.appendChild(m.err);
    m.f = {};
    for (const [grp, title] of [['transfer', 'Передача'], ['info', 'Інформація']]) {
      const kv = h('div', { class: 'kv' });
      for (const [k, l, wideF] of GEN_FIELDS[grp]) {
        const v = h('span', { class: 'v' });
        m.f[k] = v;
        kv.appendChild(h('div', { class: wideF ? 'wide' : '' }, h('span', { class: 'k' }, l + ':'), v));
      }
      pad.appendChild(h('fieldset', { class: 'group' }, h('legend', null, title), kv));
    }
    U.longPress(pad, (e, pt) => {
      const sel = window.getSelection && String(window.getSelection());
      const d = S().details && S().details.general;
      if (!d) return;
      menu([
        sel ? { label: 'Копіювати виділене', icon: I.copy, action: () => It.copy(sel) } : null,
        { label: 'Копіювати хеш', icon: I.copy, action: () => It.copy(d.v1 || d.v2) },
        { label: 'Копіювати magnet-посилання', icon: I.magnet, action: () => It.copy(d.magnet) },
        { label: 'Копіювати шлях збереження', icon: I.folder, action: () => It.copy(d.savePath) },
        d.comment ? { label: 'Копіювати коментар', icon: I.copy, action: () => It.copy(d.comment) } : null,
      ], pt);
    });
    c.appendChild(pad);
  }

  function linkify(el, text) {
    el.innerHTML = '';
    const parts = String(text || '').split(/(https?:\/\/[^\s<>"']+)/g);
    for (const p of parts) {
      if (/^https?:\/\//.test(p)) el.appendChild(h('a', { href: '#', style: { color: 'var(--accent)' }, onclick: (e) => { e.preventDefault(); tryApi('openUrl', { url: p }); } }, p));
      else if (p) el.appendChild(document.createTextNode(p));
    }
  }

  function updateGeneral(m, d) {
    if (!d) return;
    const row = S().byId.get(S().focus) || {};
    const prog = row.progress !== undefined ? row.progress : 0;
    m.pv.textContent = U.pct(prog);
    drawBar(m.pc, d.pieces, d.partial, '--pieces', '--pieces-part');
    let maxA = 1;
    if (d.avail) for (const v of d.avail) if (v > maxA) maxA = v;
    drawBar(m.ac, d.avail, null, '--avail', null, maxA);
    m.av.textContent = d.copies >= 0 ? U.num(d.copies, 3) : '—';
    if (d.err) { m.err.classList.remove('hidden'); m.err.textContent = 'Помилка: ' + d.err; } else m.err.classList.add('hidden');
    const set = (k, v) => { const e = m.f[k]; if (e && e._v !== v) { e._v = v; e.textContent = v; } };
    set('timeActive', dur(d.timeActive) + (d.seedingTime > 0 ? ' (роздача ' + dur(d.seedingTime) + ')' : ''));
    set('eta', eta(d.eta));
    set('conns', d.conns + ' (' + (d.connsLim > 0 ? d.connsLim : '∞') + ' макс.)');
    set('dl', size(d.dlAll) + ' (' + size(d.dlS) + ' за сеанс)');
    set('ul', size(d.ulAll) + ' (' + size(d.ulS) + ' за сеанс)');
    set('seeds', d.seeds + ' (' + Math.max(0, d.seedsT) + ' усього)');
    set('peers', d.peers + ' (' + Math.max(0, d.peersT) + ' усього)');
    set('dlSpeed', speed(d.dl) + ' (' + speed(d.dlAvg) + ' у середньому)');
    set('ulSpeed', speed(d.ul) + ' (' + speed(d.ulAvg) + ' у середньому)');
    set('dlLim', d.dlLim ? speed(d.dlLim * 1024) : '∞');
    set('ulLim', d.ulLim ? speed(d.ulLim * 1024) : '∞');
    set('wasted', size(d.wasted));
    set('ratio', ratio(d.ratio));
    set('reannounce', d.reannounce > 0 ? dur(d.reannounce) : '—');
    set('lastSeen', d.lastSeen > 0 ? date(d.lastSeen) : 'Ніколи');
    const months = d.timeActive > 0 ? d.timeActive / (30 * 86400) : 0;
    set('popularity', months > 0 ? U.num(d.ratio / Math.max(months, 1 / 30), 2) : '—');
    set('totalSize', d.totalSize ? size(d.totalSize) : 'Невідомо');
    set('pieces', d.numPieces ? d.numPieces + ' × ' + size(d.pieceLen) + ' (маємо ' + d.have + ')' : 'Невідомо');
    set('createdBy', d.createdBy || '—');
    set('added', date(d.added));
    set('completed', d.completed > 0 ? date(d.completed) : '—');
    set('created', d.created > 0 ? date(d.created) : '—');
    set('priv', d.priv ? 'Так' : 'Ні');
    set('v1', d.v1 || 'Немає');
    set('v2', d.v2 || 'Немає');
    set('savePath', d.savePath);
    if (m.f.comment._v !== d.comment) { m.f.comment._v = d.comment; linkify(m.f.comment, d.comment || '—'); }
  }

  // ---------------------------------------------------------------- Трекери
  const TR_STATUS = ['Працює', 'Оновлюється…', 'Ще не зв\'язувався', 'Не працює', 'Вимкнено'];
  function mountTrackers(c, m) {
    const add = h('button', { class: 'btn small', onclick: () => addTrackers() }, svg(I.plus), 'Додати трекери');
    c.appendChild(h('div', { class: 'pane-tools' }, add, h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => { It.act('t.reannounce'); toast('Оголошення надіслано'); } }, svg(I.announce), 'Оголосити')));
    m.grid = new Grid([
      { k: 'url', l: 'URL / джерело', w: 220, f: (r) => r.url },
      { k: 'tier', l: 'Рівень', w: 58, num: true, f: (r) => (r.tier >= 0 ? r.tier : '') },
      { k: 'status', l: 'Стан', w: 120, f: (r) => r.statusText },
      { k: 'peers', l: 'Піри', w: 58, num: true, f: (r) => (r.peers >= 0 ? r.peers : '') },
      { k: 'seeds', l: 'Сіди', w: 58, num: true, f: (r) => (r.seeds >= 0 ? r.seeds : '') },
      { k: 'leeches', l: 'Лічери', w: 64, num: true, f: (r) => (r.leeches >= 0 ? r.leeches : '') },
      { k: 'downloaded', l: 'Завантажень', w: 92, num: true, f: (r) => (r.downloaded >= 0 ? r.downloaded : '') },
      { k: 'next', l: 'Наступне оголошення', w: 132, num: true, f: (r) => (r.next >= 0 ? dur(r.next) : '') },
      { k: 'msg', l: 'Повідомлення', w: 260, f: (r) => r.msg },
    ], {
      rowClass: (r) => (r.status === 3 ? 'st-error' : r.status === 0 ? '' : r.status === 4 ? 'st-stoppedDL' : ''),
      onLong: (r, pt) => trackerMenu(r, pt),
    });
    c.appendChild(m.grid.wrap);
    m.grid.wrap.style.overflow = 'visible';
  }

  function updateTrackers(m, d) {
    if (!d) return;
    const rows = [];
    const pseudo = (name, o) => rows.push({ url: name, tier: -1, status: o.on ? 0 : 4, statusText: d.priv ? 'Вимкнено для приватного торента' : (o.on ? 'Працює' : 'Вимкнено'), peers: o.peers, seeds: -1, leeches: -1, downloaded: -1, next: -1, msg: '', pseudo: true });
    pseudo('** [DHT] **', d.dht);
    pseudo('** [PeX] **', d.pex);
    pseudo('** [LSD] **', d.lsd);
    for (const t of d.list) rows.push(Object.assign({}, t, { statusText: TR_STATUS[t.status] || '', peers: -1 }));
    m.grid.setRows(rows, (r) => r.url);
  }

  function addTrackers() {
    U.prompt('Додати трекери', 'Список трекерів, по одному в рядку', '', { multiline: true, icon: I.antenna, placeholder: 'udp://tracker.example.org:6969/announce' }).then((v) => {
      if (!v) return;
      tryApi('trackers.add', { id: S().focus, urls: v.split('\n').map((x) => x.trim()).filter(Boolean) });
      It.pollSoon();
    });
  }

  function trackerMenu(r, pt) {
    const id = S().focus;
    menu([
      { label: 'Додати трекери…', icon: I.plus, action: addTrackers },
      r.pseudo ? null : { label: 'Змінити URL трекера…', icon: I.edit, action: () => U.prompt('Змінити трекер', 'Нова адреса трекера', r.url, { icon: I.edit }).then((v) => { if (v && v.trim() && v.trim() !== r.url) { tryApi('trackers.edit', { id, old: r.url, new: v.trim() }); It.pollSoon(); } }) },
      r.pseudo ? null : { label: 'Вилучити трекер', icon: I.remove, action: () => { tryApi('trackers.remove', { id, urls: [r.url] }); It.pollSoon(); } },
      r.pseudo ? null : { label: 'Копіювати URL трекера', icon: I.copy, action: () => It.copy(r.url) },
      '-',
      { label: 'Примусове оголошення', icon: I.announce, action: () => It.act('t.reannounce') },
    ], pt, r.pseudo ? r.url : null);
  }

  // ---------------------------------------------------------------- Піри
  function mountPeers(c, m) {
    c.appendChild(h('div', { class: 'pane-tools' }, h('button', { class: 'btn small', onclick: addPeers }, svg(I.plus), 'Додати пірів'), h('span', { class: 'grow' }), m.count = h('span', { class: 'hint', style: { margin: 0 } })));
    m.grid = new Grid([
      { k: 'ip', l: 'IP / адреса', w: 150, f: (r) => (r[0].includes(':') ? '[' + r[0] + ']' : r[0]) + ':' + r[1] },
      { k: 'type', l: "З'єднання", w: 76, f: (r) => r[2] },
      { k: 'flags', l: 'Прапорці', w: 110, f: (r) => r[3] },
      { k: 'client', l: 'Клієнт', w: 150, f: (r) => r[4] },
      { k: 'progress', l: 'Прогрес', w: 76, num: true, f: (r) => U.pct(r[5]) },
      { k: 'dl', l: 'Завантаження', w: 100, num: true, f: (r) => (r[6] > 0 ? speed(r[6]) : '') },
      { k: 'ul', l: 'Вивантаження', w: 100, num: true, f: (r) => (r[7] > 0 ? speed(r[7]) : '') },
      { k: 'dlt', l: 'Завантажено', w: 92, num: true, f: (r) => size(r[8]) },
      { k: 'ult', l: 'Вивантажено', w: 92, num: true, f: (r) => size(r[9]) },
    ], {
      onLong: (r, pt) => menu([
        { label: 'Додати пірів…', icon: I.plus, action: addPeers },
        { label: 'Копіювати IP:порт', icon: I.copy, action: () => It.copy((r[0].includes(':') ? '[' + r[0] + ']' : r[0]) + ':' + r[1]) },
        '-',
        { label: 'Заблокувати піра назавжди', icon: I.remove, action: () => U.confirm('Заблокувати піра', 'Заблокувати ' + U.esc(r[0]) + ' назавжди? Адресу буде додано до списку заблокованих у налаштуваннях.', 'Заблокувати').then((ok) => { if (ok) tryApi('peers.ban', { ips: [r[0]] }); }) },
      ], pt, r[4] || r[0]),
    });
    m.grid.wrap.style.overflow = 'visible';
    c.appendChild(m.grid.wrap);
  }
  function updatePeers(m, d) {
    if (!d) return;
    const rows = d.slice().sort((a, b) => (b[6] + b[7]) - (a[6] + a[7]) || a[0].localeCompare(b[0]));
    m.grid.setRows(rows, (r) => r[0] + ':' + r[1]);
    m.count.textContent = d.length + ' ' + plural(d.length, 'пір', 'піри', 'пірів');
  }
  function addPeers() {
    U.prompt('Додати пірів', 'Список пірів у форматі IP:порт, по одному в рядку', '', { multiline: true, icon: I.peers, placeholder: '192.0.2.10:51413\n[2001:db8::1]:6881' }).then((v) => {
      if (!v) return;
      const n = tryApi('peers.add', { id: S().focus, peers: v.split('\n') });
      if (n !== undefined) toast(n > 0 ? 'Додано пірів: ' + n : 'Не вдалося розпізнати жодної адреси');
    });
  }

  // ---------------------------------------------------------------- HTTP-джерела
  function mountHttp(c, m) {
    c.appendChild(h('div', { class: 'pane-tools' }, h('button', { class: 'btn small', onclick: addSeeds }, svg(I.plus), 'Додати веб-сіди')));
    m.grid = new Grid([{ k: 'url', l: 'URL', w: 420, f: (r) => r }], {
      onLong: (r, pt) => menu([
        { label: 'Додати веб-сіди…', icon: I.plus, action: addSeeds },
        { label: 'Змінити веб-сід…', icon: I.edit, action: () => U.prompt('Змінити веб-сід', 'Нова адреса', r).then((v) => { if (v && v.trim() && v.trim() !== r) { tryApi('seeds.remove', { id: S().focus, urls: [r] }); tryApi('seeds.add', { id: S().focus, urls: [v.trim()] }); It.pollSoon(); } }) },
        { label: 'Вилучити веб-сід', icon: I.remove, action: () => { tryApi('seeds.remove', { id: S().focus, urls: [r] }); It.pollSoon(); } },
        { label: 'Копіювати URL', icon: I.copy, action: () => It.copy(r) },
      ], pt),
    });
    m.grid.wrap.style.overflow = 'visible';
    m.empty = h('div', { class: 'pane-empty' }, 'Немає HTTP-джерел. Веб-сіди дають змогу завантажувати частини торента напряму з вебсервера.');
    c.append(m.grid.wrap, m.empty);
  }
  function updateHttp(m, d) {
    if (!d) return;
    m.grid.setRows(d, (r) => r);
    m.empty.classList.toggle('hidden', d.length > 0);
  }
  function addSeeds() {
    U.prompt('Додати веб-сіди', 'Адреси, по одній у рядку', '', { multiline: true, icon: I.globe, placeholder: 'https://example.org/files/' }).then((v) => {
      if (!v) return;
      tryApi('seeds.add', { id: S().focus, urls: v.split('\n').map((x) => x.trim()).filter(Boolean) });
      It.pollSoon();
    });
  }

  // ---------------------------------------------------------------- Вміст
  function mountContent(c, m) {
    m.tools = h('div', { class: 'pane-tools' });
    m.filter = h('input', { class: 'field', type: 'search', placeholder: 'Фільтр файлів…', style: { height: '30px' } });
    m.filter.addEventListener('input', () => { m.dirty = true; updateContent(m, null); });
    m.tools.append(m.filter,
      h('button', { class: 'btn small', onclick: () => setPrio(m, allLeaves(m), 4) }, 'Усі'),
      h('button', { class: 'btn small', onclick: () => setPrio(m, allLeaves(m), 0) }, 'Жоден'));
    c.appendChild(m.tools);
    m.msg = h('div', { class: 'pane-empty hidden' });
    c.appendChild(m.msg);
  }

  function allLeaves(m) { return m.tree ? m.tree.leaves : []; }

  function setPrio(m, leaves, p) {
    if (!leaves.length) return;
    tryApi('files.prio', { id: S().focus, idx: leaves.map((l) => l.index), prio: p });
    // відобразити одразу
    const d = S().details && S().details.content;
    if (d && d.prio) for (const l of leaves) d.prio[l.index] = p;
    m.dirty = true;
    updateContent(m, null);
    It.pollSoon();
  }

  function buildGrid(m) {
    const tree = m.tree;
    m.grid = new Grid([
      { k: 'name', l: 'Назва', w: 220, render: treeNameRender(tree, (n) => { if (tree.open.has(n.path)) tree.open.delete(n.path); else tree.open.add(n.path); m.dirty = true; updateContent(m, null); }, (n, on) => setPrio(m, tree.leavesOf(n), on ? 4 : 0)) },
      { k: 'size', l: 'Розмір', w: 86, num: true, f: (n) => size(n.tsize) },
      { k: 'progress', l: 'Прогрес', w: 104, bar: true, v: (n) => (n.tsize > 0 ? n.done / n.tsize : 1) },
      { k: 'prio', l: 'Пріоритет', w: 124, f: (n) => prioLabel(n.prio) },
      { k: 'left', l: 'Залишилось', w: 90, num: true, f: (n) => size(Math.max(0, n.tsize - n.done)) },
      { k: 'avail', l: 'Доступність', w: 90, num: true, f: (n) => (n.avail < 0 ? '' : U.pct(n.avail / 1000)) },
    ], {
      onTap: (n) => { if (n.dir) { if (tree.open.has(n.path)) tree.open.delete(n.path); else tree.open.add(n.path); m.dirty = true; updateContent(m, null); } },
      onLong: (n, pt) => fileMenu(m, n, pt),
    });
    m.grid.wrap.style.overflow = 'visible';
    m.tools.after(m.grid.wrap);
  }

  const MEDIA = /\.(mkv|mp4|avi|mov|wmv|webm|m4v|ts|mpg|mpeg|flv|3gp|mp3|flac|ogg|m4a|aac|wav|opus|m4b)$/i;

  function fileMenu(m, n, pt) {
    const id = S().focus;
    const leaves = m.tree.leavesOf(n);
    const done = n.tsize > 0 && n.done >= n.tsize;
    const prioItems = window.PRIO.map(([p, l]) => ({ label: l, checked: n.prio === p || (p === 4 && n.prio > 0 && n.prio < 5), action: () => setPrio(m, leaves, p) }));
    menu([
      !n.dir ? { label: done ? 'Відкрити' : 'Відкрити (завантажено не повністю)', icon: I.open, disabled: n.done <= 0, action: () => tryApi('files.open', { id, index: n.index }) } : null,
      !n.dir && MEDIA.test(n.name) ? { label: done ? 'Відтворити' : 'Переглянути під час завантаження', icon: I.play, action: () => { tryApi('files.stream', { id, index: n.index }); } } : null,
      { label: 'Перейменувати…', icon: I.rename, action: () => renameNode(m, n) },
      { label: 'Пріоритет', icon: I.queue, items: prioItems },
      '-',
      { label: 'Копіювати назву', icon: I.copy, action: () => It.copy(n.name) },
      !n.dir ? { label: 'Копіювати повний шлях', icon: I.copy, action: () => { const p = tryApi('files.path', { id, index: n.index }); if (p) It.copy(p); } } : null,
    ], pt, n.name);
  }

  function renameNode(m, n) {
    U.prompt(n.dir ? 'Перейменувати папку' : 'Перейменувати файл', 'Нова назва', n.name, { icon: I.rename }).then((v) => {
      if (!v || !v.trim() || v.trim() === n.name || /[\\/]/.test(v)) { if (v && /[\\/]/.test(v)) toast('Назва не може містити / або \\', true); return; }
      const name = v.trim();
      const id = S().focus;
      if (n.dir) {
        const old = n.path;
        const parent = old.includes('/') ? old.slice(0, old.lastIndexOf('/') + 1) : '';
        const nw = parent + name;
        for (const l of m.tree.leavesOf(n)) tryApi('files.rename', { id, index: l.index, path: nw + l.path.slice(old.length) });
      } else {
        const parent = n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/') + 1) : '';
        tryApi('files.rename', { id, index: n.index, path: parent + name });
      }
      toast('Перейменування…');
      setTimeout(It.pollSoon, 600);
    });
  }

  function updateContent(m, d) {
    const s = S();
    const det = s.details && s.details.tab === 'content' ? s.details.content : null;
    if (det && det.nometa) {
      m.msg.textContent = 'Отримання метаданих… Список файлів з\'явиться, щойно торент знайде пірів.';
      m.msg.classList.remove('hidden');
      m.tools.classList.add('hidden');
      return;
    }
    m.msg.classList.add('hidden');
    m.tools.classList.remove('hidden');
    if (!s.files) return;
    if (!m.tree || m.treeFiles !== s.files) {
      const open = m.tree ? m.tree.open : null;
      m.tree = new FileTree(s.files);
      if (open) m.tree.open = open;
      m.treeFiles = s.files;
      if (m.grid) { m.grid.wrap.remove(); m.grid = null; }
    }
    if (!m.grid) buildGrid(m);
    if (det) { m.prog = det.prog; m.prio = det.prio; m.avail = det.avail; }
    m.tree.compute(m.prog, m.prio, m.avail);
    let rows = m.tree.visible();
    const q = m.filter.value.trim().toLowerCase();
    if (q) {
      rows = m.tree.leaves.filter((l) => l.path.toLowerCase().includes(q));
      for (const l of rows) l.depth = 0;
    }
    m.grid.setRows(rows, (n) => m.tree.key(n));
  }

  // ---------------------------------------------------------------- Швидкість
  function mountSpeed(c, m) {
    m.period = 300;
    const per = U.select([[60, '1 хвилина'], [300, '5 хвилин'], [1800, '30 хвилин']], 300, (v) => { m.period = +v; draw(m); });
    per.style.width = 'auto';
    per.style.height = '30px';
    m.showDl = true; m.showUl = true;
    const dlc = U.check('', true, (on) => { m.showDl = on; draw(m); });
    dlc.querySelector('span').append(h('span', { class: 'legend-dot', style: { background: 'var(--graph-dl)', marginRight: '5px' } }), 'Завантаження');
    const ulc = U.check('', true, (on) => { m.showUl = on; draw(m); });
    ulc.querySelector('span').append(h('span', { class: 'legend-dot', style: { background: 'var(--graph-ul)', marginRight: '5px' } }), 'Вивантаження');
    m.canvas = h('canvas');
    m.cur = h('div', { class: 'hint', style: { padding: '0 10px' } });
    c.append(h('div', { class: 'speedctl' }, h('span', null, 'Період:'), per, dlc, ulc), h('div', { class: 'graph' }, m.canvas), m.cur);
  }

  function draw(m) {
    const g = S().graph;
    const cv = m.canvas;
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d');
    c.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement);
    const n = m.period;
    const dl = g.dl.slice(-n), ul = g.ul.slice(-n);
    let max = 1024;
    if (m.showDl) for (const v of dl) max = Math.max(max, v);
    if (m.showUl) for (const v of ul) max = Math.max(max, v);
    // «гарний» максимум
    const pow = Math.pow(1024, Math.floor(Math.log(max) / Math.log(1024)));
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    let top = pow;
    for (const s of steps) { if (s * pow >= max) { top = s * pow; break; } }
    const left = 70 * dpr, padT = 8 * dpr, padB = 18 * dpr;
    c.font = (11 * dpr) + 'px system-ui, sans-serif';
    c.fillStyle = cs.getPropertyValue('--muted');
    c.strokeStyle = cs.getPropertyValue('--line-soft');
    c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (H - padT - padB) * i / 4;
      c.beginPath(); c.moveTo(left, y); c.lineTo(W, y); c.stroke();
      c.fillText(speed(top * (4 - i) / 4), 4 * dpr, y + 4 * dpr);
    }
    c.fillText(n >= 1800 ? '30 хв тому' : n >= 300 ? '5 хв тому' : '1 хв тому', left, H - 4 * dpr);
    const line = (arr, color) => {
      c.strokeStyle = cs.getPropertyValue(color);
      c.lineWidth = 1.6 * dpr;
      c.beginPath();
      const start = n - arr.length;
      arr.forEach((v, i) => {
        const x = left + (W - left) * (start + i) / Math.max(1, n - 1);
        const y = padT + (H - padT - padB) * (1 - v / top);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.stroke();
    };
    if (m.showDl) line(dl, '--graph-dl');
    if (m.showUl) line(ul, '--graph-ul');
    const s = S().session;
    m.cur.textContent = 'Зараз: ↓ ' + speed(s.dl) + ' · ↑ ' + speed(s.ul);
  }

  const MOUNT = { general: mountGeneral, trackers: mountTrackers, peers: mountPeers, http: mountHttp, content: mountContent, speed: mountSpeed };
  const UPDATE = { general: updateGeneral, trackers: updateTrackers, peers: updatePeers, http: updateHttp, content: (m) => updateContent(m), speed: (m) => draw(m) };

  window.Panel = { render, reset };
})();
