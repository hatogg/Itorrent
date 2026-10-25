// Діалоги: додавання торентів і посилань, вилучення, категорії, ліміти, статистика, створення торента.
(function () {
  const { h, svg, size, speed, date, tryApi, toast, dialog, check, select, numField, pathField, esc, plural } = U;
  const S = () => It.S;
  const P = () => It.prefs();

  // ---------------------------------------------------------------- посилання
  function addLinks() {
    let pre = '';
    const ta = h('textarea', { class: 'field', rows: 7, autofocus: true, placeholder: 'magnet:?xt=urn:btih:…\nhttps://example.org/file.torrent' });
    try {
      const clip = window.Android && Android.call ? JSON.parse(Android.call('clip.get', '{}')).r : '';
      if (clip && /^(magnet:|https?:\/\/.+\.torrent|[0-9a-f]{40}$)/i.test(clip.trim())) pre = clip.trim();
    } catch (e) {}
    ta.value = pre;
    const body = h('div', null,
      h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Одне посилання в рядку (magnet-посилання, HTTP-адреси торент-файлів і хеші інформації підтримуються):'),
      ta);
    dialog({
      title: 'Завантаження з посилань', icon: I.addLink, body,
      buttons: [{ label: 'Скасувати' }, { label: 'Завантажити', primary: true, action: () => {
        const text = ta.value.trim();
        if (!text) { toast('Додайте хоча б одне посилання', true); return false; }
        const n = tryApi('add.links', { text, dialog: P().showAddDialog });
        if (n > 1 || !P().showAddDialog) toast('Додається торентів: ' + n);
        return true;
      } }],
    });
  }

  // ---------------------------------------------------------------- новий торент
  let addOpen = null;

  function addTorrent(info) {
    if (info.exists) {
      toast('Торент «' + info.name + '» уже є у списку передач');
    }
    const p = P();
    const st = { prio: null, tree: null, grid: null };
    const save = pathField(info.savePath || S().save, { title: 'Зберегти в' });
    const cats = Object.keys(S().cats).sort((a, b) => a.localeCompare(b, 'uk'));
    const cat = select([['', '(Без категорії)']].concat(cats.map((c) => [c, c])), '');
    cat.addEventListener('change', () => {
      const cp = cat.value && S().cats[cat.value] && S().cats[cat.value].savePath;
      if (cp) save.input.value = cp;
    });
    const tagsIn = h('input', { class: 'field', placeholder: 'Мітки через кому' });
    const nameIn = h('input', { class: 'field' });
    nameIn.value = info.name;
    const startC = check('Запустити торент', !p.addStopped);
    const skipC = check('Пропустити перевірку хешів', false);
    const seqC = check('Завантажувати послідовно', p.seqDefault);
    const flC = check('Спершу перша й остання частини', p.firstLastDefault);
    const infoBox = h('div', { class: 'add-info' });
    const contentBox = h('div', { class: 'content-box' });
    const ctools = h('div', { class: 'row', style: { marginTop: '8px' } });
    const filterIn = h('input', { class: 'field', type: 'search', placeholder: 'Фільтр файлів…', style: { flex: 1 } });
    ctools.append(filterIn,
      h('button', { class: 'btn small', onclick: () => setAll(4) }, 'Усі'),
      h('button', { class: 'btn small', onclick: () => setAll(0) }, 'Жоден'));
    const sizeLine = h('div', { class: 'hint' });

    function fillInfo(d) {
      infoBox.innerHTML = '';
      const kv = (k, v) => { infoBox.append(h('span', { class: 'k' }, k), h('span', { class: 'v' }, v)); };
      kv('Розмір:', d.hasMeta ? size(d.size) : 'Невідомо');
      if (d.created > 0) kv('Дата:', date(d.created));
      kv('Хеш інформації v1:', d.v1 || (d.hasMeta ? 'Немає' : d.id));
      if (d.v2) kv('Хеш інформації v2:', d.v2);
      if (d.priv) kv('Приватний:', 'Так');
      if (d.createdBy) kv('Створено:', d.createdBy);
      if (d.comment) kv('Коментар:', d.comment);
    }

    function setAll(v) {
      if (!st.prio) return;
      for (const l of st.tree.leaves) st.prio[l.index] = v;
      refresh();
    }

    function refresh() {
      if (!st.tree) return;
      st.tree.compute(null, st.prio, null);
      let rows = st.tree.visible();
      const q = filterIn.value.trim().toLowerCase();
      if (q) { rows = st.tree.leaves.filter((l) => l.path.toLowerCase().includes(q)); for (const l of rows) l.depth = 0; }
      st.grid.setRows(rows, (n) => st.tree.key(n));
      let sel = 0;
      for (const l of st.tree.leaves) if (st.prio[l.index] > 0) sel += l.size;
      const free = S().session.free;
      sizeLine.textContent = 'Вибрано: ' + size(sel) + ' із ' + size(st.total) + (free >= 0 ? ' · вільно на диску: ' + size(free) : '');
    }
    filterIn.addEventListener('input', refresh);

    function fillContent(d) {
      contentBox.innerHTML = '';
      if (!d.hasMeta) {
        contentBox.appendChild(h('div', { class: 'loading-row' }, h('span', { class: 'spin' }), 'Отримання метаданих…'));
        ctools.classList.add('hidden');
        sizeLine.textContent = '';
        return;
      }
      ctools.classList.remove('hidden');
      st.prio = new Array(d.nfiles).fill(4);
      for (let i = 0; i < d.nfiles; i++) st.prio[i] = 4;
      st.tree = new FileTree(d.files);
      st.total = d.size;
      st.grid = new Grid([
        { k: 'name', l: 'Назва', w: 230, render: treeNameRender(st.tree, (n) => { if (st.tree.open.has(n.path)) st.tree.open.delete(n.path); else st.tree.open.add(n.path); refresh(); }, (n, on) => { for (const l of st.tree.leavesOf(n)) st.prio[l.index] = on ? 4 : 0; refresh(); }) },
        { k: 'size', l: 'Розмір', w: 86, num: true, f: (n) => size(n.tsize) },
        { k: 'prio', l: 'Пріоритет', w: 124, f: (n) => prioLabel(n.prio) },
      ], {
        onTap: (n) => { if (n.dir) { if (st.tree.open.has(n.path)) st.tree.open.delete(n.path); else st.tree.open.add(n.path); refresh(); } },
        onLong: (n, pt) => U.menu(window.PRIO.map(([pv, l]) => ({ label: l, checked: n.prio === pv, action: () => { for (const x of st.tree.leavesOf(n)) st.prio[x.index] = pv; refresh(); } })), pt, n.name),
      });
      st.grid.wrap.style.overflow = 'visible';
      contentBox.appendChild(st.grid.wrap);
      refresh();
    }

    const body = h('div', null,
      h('fieldset', { class: 'group', style: { marginTop: 0 } }, h('legend', null, 'Зберегти в'), save),
      h('fieldset', { class: 'group' }, h('legend', null, 'Параметри торента'),
        h('div', { class: 'row' }, h('label', { class: 'lbl', style: { minWidth: '84px' } }, 'Назва:'), h('div', { class: 'grow' }, nameIn)),
        h('div', { class: 'row' }, h('label', { class: 'lbl', style: { minWidth: '84px' } }, 'Категорія:'), h('div', { class: 'grow' }, cat)),
        h('div', { class: 'row' }, h('label', { class: 'lbl', style: { minWidth: '84px' } }, 'Мітки:'), h('div', { class: 'grow' }, tagsIn)),
        startC, skipC, seqC, flC),
      h('fieldset', { class: 'group' }, h('legend', null, 'Вміст'), ctools, sizeLine, contentBox),
      h('fieldset', { class: 'group' }, h('legend', null, 'Інформація про торент'), infoBox));

    fillInfo(info);
    fillContent(info);
    let titleEl = null;
    addOpen = { pid: info.pid, update: (d) => {
      fillInfo(d); fillContent(d);
      if (nameIn.value === info.name || nameIn.value === info.id) nameIn.value = d.name;
      if (titleEl) titleEl.textContent = d.name;
      info = d;
    } };

    let done = false;
    dialog({
      title: info.name, icon: I.addFile, body, wide: true, modal: true,
      ready: ({ title }) => { titleEl = title.querySelector('.t'); },
      buttons: [
        { label: 'Скасувати' },
        { label: 'Гаразд', primary: true, action: () => {
          const opts = {
            savePath: save.input.value.trim(),
            category: cat.value,
            tags: tagsIn.value.split(',').map((x) => x.trim()).filter(Boolean),
            start: startC.input.checked,
            skipCheck: skipC.input.checked,
            seq: seqC.input.checked,
            firstLast: flC.input.checked,
            rename: nameIn.value.trim() !== info.name ? nameIn.value.trim() : '',
          };
          if (st.prio && info.hasMeta) {
            if (!st.prio.some((x) => x > 0)) { toast('Виберіть хоча б один файл', true); return false; }
            opts.prio = st.prio;
          }
          const r = tryApi('add.confirm', { pid: info.pid, opts });
          if (r === undefined) return false;
          done = true;
          It.pollSoon();
          return true;
        } },
      ],
      onClose: () => {
        if (!done) tryApi('add.cancel', { pid: info.pid });
        addOpen = null;
      },
    });
  }

  function previewMeta(d) {
    if (addOpen && addOpen.pid === d.pid) addOpen.update(d);
  }

  // ---------------------------------------------------------------- вилучення
  function remove(rows) {
    const p = P();
    const filesC = check('Також видалити файли з диска', p.deleteFilesDefault);
    const text = rows.length === 1
      ? 'Ви справді хочете вилучити «' + esc(rows[0].name) + '» зі списку передач?'
      : 'Ви справді хочете вилучити ' + rows.length + ' ' + plural(rows.length, 'вибраний торент', 'вибрані торенти', 'вибраних торентів') + ' зі списку передач?';
    if (!p.confirmDelete) return Promise.resolve(p.deleteFilesDefault);
    const body = h('div', null, h('div', { class: 'msg' }, svg(I.warn), h('div', { html: text })), filesC);
    return dialog({
      title: rows.length === 1 ? 'Вилучити торент' : 'Вилучити торенти', icon: I.remove, body,
      buttons: [{ label: 'Скасувати' }, { label: 'Вилучити', primary: true, action: () => filesC.input.checked }],
    });
  }

  // ---------------------------------------------------------------- категорія
  function category(name) {
    const cur = name ? S().cats[name] || {} : {};
    const nameIn = h('input', { class: 'field', autofocus: true, placeholder: 'Фільми' });
    nameIn.value = name || '';
    const path = pathField(cur.savePath || '', { title: 'Шлях збереження категорії', placeholder: 'Типовий: ' + S().save });
    const body = h('div', null,
      h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Назва:'), nameIn,
      h('div', { class: 'hint', style: { color: 'var(--text)', marginTop: '10px' } }, 'Шлях збереження (порожньо — типовий):'), path);
    return dialog({
      title: name ? 'Змінити категорію' : 'Нова категорія', icon: I.category, body,
      buttons: [{ label: 'Скасувати' }, { label: 'Гаразд', primary: true, action: () => {
        const n = nameIn.value.trim();
        if (!n) { toast('Вкажіть назву категорії', true); return false; }
        if (n !== name && S().cats[n]) { toast('Така категорія вже є', true); return false; }
        if (tryApi('cat.save', { name: n, savePath: path.input.value.trim(), old: name || '' }) === undefined) return false;
        It.pollSoon();
        return n;
      } }],
    });
  }

  // ---------------------------------------------------------------- ліміти
  function limitControl(kib) {
    const inf = check('Без обмежень', !kib);
    const inp = numField(kib || 1024, 1, 1000000);
    const slider = h('input', { type: 'range', min: 0, max: 100, style: { width: '100%' } });
    const toSlider = (v) => Math.round(Math.log(Math.max(1, v)) / Math.log(102400) * 100);
    const fromSlider = (s) => Math.max(1, Math.round(Math.pow(102400, s / 100)));
    slider.value = toSlider(kib || 1024);
    slider.addEventListener('input', () => { inp.value = fromSlider(+slider.value); inf.input.checked = false; sync(); });
    inp.addEventListener('input', () => { slider.value = toSlider(+inp.value); inf.input.checked = false; sync(); });
    const sync = () => { inp.disabled = inf.input.checked; slider.style.opacity = inf.input.checked ? 0.4 : 1; };
    inf.input.addEventListener('change', sync);
    sync();
    const el = h('div', null, inf, slider, h('div', { class: 'row' }, inp, h('span', { class: 'unit' }, 'КіБ/с')));
    el.value = () => (inf.input.checked ? 0 : Math.max(1, parseInt(inp.value, 10) || 0));
    return el;
  }

  function rateLimit(kind, rows) {
    const cur = rows.length === 1 ? (kind === 'dl' ? rows[0].dlLim : rows[0].ulLim) : 0;
    const ctl = limitControl(cur);
    dialog({
      title: kind === 'dl' ? 'Ліміт швидкості завантаження торента' : 'Ліміт швидкості вивантаження торента', icon: kind === 'dl' ? I.limitDl : I.limitUl,
      body: h('div', null, h('p', null, rows.length === 1 ? rows[0].name : rows.length + ' ' + plural(rows.length, 'торент', 'торенти', 'торентів')), ctl),
      buttons: [{ label: 'Скасувати' }, { label: 'Гаразд', primary: true, action: () => {
        const v = ctl.value();
        tryApi('t.limits', kind === 'dl' ? { ids: rows.map((r) => r.id), dl: v } : { ids: rows.map((r) => r.id), ul: v });
        It.pollSoon();
        return true;
      } }],
    });
  }

  function shareLimit(rows) {
    const r0 = rows[0];
    const mode0 = r0.ratioLim < -1.5 && r0.seedLim < -1 ? 'global' : r0.ratioLim < 0 && r0.seedLim < 0 ? 'none' : 'set';
    const name = 'sl' + Date.now();
    const radio = (v, l) => { const i = h('input', { type: 'radio', name, value: v }); i.checked = v === mode0; return h('label', { class: 'radio' }, i, l); };
    const ratioC = check('Рейтинг:', r0.ratioLim >= 0);
    const ratioIn = numField(r0.ratioLim >= 0 ? r0.ratioLim : (P().ratioLimit || 1), 0, 9998, 0.05);
    const timeC = check('Час роздачі:', r0.seedLim >= 0);
    const timeIn = numField(r0.seedLim >= 0 ? r0.seedLim : (P().seedTime || 1440), 0, 525600);
    const body = h('div', null,
      radio('global', 'Використовувати глобальне обмеження'),
      radio('none', 'Без обмеження'),
      radio('set', 'Встановити обмеження'),
      h('div', { class: 'row', style: { marginLeft: '28px' } }, ratioC, ratioIn),
      h('div', { class: 'row', style: { marginLeft: '28px' } }, timeC, timeIn, h('span', { class: 'unit' }, 'хв')));
    dialog({
      title: 'Обмеження рейтингу роздачі', icon: I.ratio, body,
      buttons: [{ label: 'Скасувати' }, { label: 'Гаразд', primary: true, action: () => {
        const mode = body.querySelector('input[name="' + name + '"]:checked').value;
        let ratio = -2, seed = -2;
        if (mode === 'none') { ratio = -1; seed = -1; }
        if (mode === 'set') {
          ratio = ratioC.input.checked ? Math.max(0, parseFloat(String(ratioIn.value).replace(',', '.')) || 0) : -1;
          seed = timeC.input.checked ? Math.max(0, parseInt(timeIn.value, 10) || 0) : -1;
        }
        tryApi('t.shareLimits', { ids: rows.map((r) => r.id), ratio, seed });
        It.pollSoon();
        return true;
      } }],
    });
  }

  function globalLimits() {
    const p = P();
    const dl = limitControl(p.dlLimit), ul = limitControl(p.upLimit);
    const adl = limitControl(p.altDlLimit), aul = limitControl(p.altUpLimit);
    const altC = check('Використовувати альтернативні ліміти зараз', !!S().session.alt);
    const body = h('div', null,
      h('fieldset', { class: 'group', style: { marginTop: 0 } }, h('legend', null, 'Глобальні ліміти'),
        h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Завантаження:'), dl,
        h('div', { class: 'hint', style: { color: 'var(--text)', marginTop: '8px' } }, 'Вивантаження:'), ul),
      h('fieldset', { class: 'group' }, h('legend', null, 'Альтернативні ліміти'),
        h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Завантаження:'), adl,
        h('div', { class: 'hint', style: { color: 'var(--text)', marginTop: '8px' } }, 'Вивантаження:'), aul, altC));
    dialog({
      title: 'Ліміти швидкості', icon: I.speed, body,
      buttons: [{ label: 'Скасувати' }, { label: 'Гаразд', primary: true, action: () => {
        const np = tryApi('prefs.set', { values: { dlLimit: dl.value(), upLimit: ul.value(), altDlLimit: adl.value(), altUpLimit: aul.value(), altEnabled: altC.input.checked } });
        if (np) It.setPrefs(np);
        It.pollSoon();
        return true;
      } }],
    });
  }

  // ---------------------------------------------------------------- статистика й «про програму»
  function stats() {
    const st = tryApi('stats');
    if (!st) return;
    const t = h('table', { class: 'stat-table' });
    const row = (k, v, cls) => t.appendChild(h('tr', { class: cls || '' }, h('td', null, k), h('td', null, v)));
    row('Статистика користувача', '', 'h');
    row('Завантажено за весь час', size(st.allDl + st.sesDl));
    row('Вивантажено за весь час', size(st.allUl + st.sesUl));
    const r = (st.allDl + st.sesDl) > 0 ? (st.allUl + st.sesUl) / (st.allDl + st.sesDl) : 0;
    row('Рейтинг за весь час', U.ratio(r));
    row('Завантажено за сеанс', size(st.sesDl));
    row('Вивантажено за сеанс', size(st.sesUl));
    row('Втрачено за сеанс', size(st.wasted));
    row("Під'єднаних пірів", String(st.peers));
    row('Сесія', '', 'h');
    row('Торентів у списку', String(st.torrents));
    row('Вузлів DHT', String(st.dht));
    if (st.free >= 0) row('Вільне місце в типовій папці', size(st.free));
    dialog({ title: 'Статистика', icon: I.stats, body: t, buttons: [{ label: 'Закрити', primary: true }] });
  }

  function about() {
    const info = It.info();
    const logo = h('div', { class: 'logo', html: '<svg viewBox="0 0 108 108"><rect width="108" height="108" fill="#1F6FEB"/><rect width="108" height="54" fill="#2B7CF5"/><circle cx="54" cy="35" r="6" fill="#fff"/><path d="M49 47h10v15h8.5L54 76 40.5 62H49z" fill="#fff"/><rect x="36" y="79" width="36" height="4" rx="2" fill="#BFD7FF"/></svg>' });
    const body = h('div', { class: 'about' }, logo, h('h1', null, 'Itorrent'), h('p', null, 'Версія ' + info.version),
      h('p', { style: { color: 'var(--text)' } }, 'Торент-клієнт для Android на рушії libtorrent. Магнет-посилання, DHT, PeX, LSD, шифрування, черга, ліміти, RSS із автозавантаженням, перегляд відео під час завантаження й створення торентів.'),
      h('p', null, 'Інтерфейс натхненний класичними настільними торент-клієнтами. Без реклами й трекерів.'),
      h('p', null, 'libtorrent © Arvid Norberg (BSD) · libtorrent4j © Alden Torres (MIT)'));
    dialog({ title: 'Про Itorrent', icon: I.info, body, buttons: [{ label: 'Закрити', primary: true }] });
  }

  function welcome() {
    const info = It.info();
    const body = h('div', null,
      h('div', { class: 'msg' }, svg(I.folder),
        h('div', null,
          h('p', { style: { marginTop: 0 } }, h('b', null, 'Доступ до файлів. '), 'Щоб зберігати завантаження в «Download/Itorrent», вибирати будь-яку папку й роздавати власні файли, Itorrent потрібен дозвіл «Доступ до всіх файлів».'),
          h('p', null, 'Без нього завантаження зберігатимуться в папці застосунку, яку видаляє система разом із ним.'))),
      info.notifPerm ? null : h('div', { class: 'msg' }, svg(I.info), h('p', null, h('b', null, 'Сповіщення. '), 'Дозвольте сповіщення, щоб бачити швидкість у шторці й дізнаватися про завершені завантаження.')));
    dialog({
      title: 'Ласкаво просимо до Itorrent', icon: I.info, body, modal: true,
      buttons: [{ label: 'Пізніше' }, { label: 'Надати доступ', primary: true, value: true }],
    }).then((ok) => {
      tryApi('firstRunDone');
      if (!info.notifPerm) tryApi('perm.notifications');
      if (ok && !info.storage) setTimeout(() => tryApi('perm.storage'), info.notifPerm ? 0 : 900);
    });
  }

  // ---------------------------------------------------------------- створення торента
  let creator = null;
  function creatorDialog() {
    const path = pathField('', { title: 'Файл або папка для торента', files: true, placeholder: 'Виберіть файл або папку' });
    const pieceSel = select([[0, 'Автоматично'], [16, '16 КіБ'], [32, '32 КіБ'], [64, '64 КіБ'], [128, '128 КіБ'], [256, '256 КіБ'], [512, '512 КіБ'], [1024, '1 МіБ'], [2048, '2 МіБ'], [4096, '4 МіБ'], [8192, '8 МіБ'], [16384, '16 МіБ'], [32768, '32 МіБ']], 0);
    const fmtSel = select([['v1', 'v1 (найкраща сумісність)'], ['hybrid', 'Гібридний (v1 + v2)'], ['v2', 'v2']], 'v1');
    const privC = check('Приватний торент (без DHT і PeX)', false);
    const seedC = check('Почати роздачу одразу', true);
    const ignC = check('Ігнорувати обмеження роздачі для цього торента', false);
    const trackers = h('textarea', { class: 'field', rows: 4, placeholder: 'udp://tracker.opentrackr.org:1337/announce' });
    const seeds = h('textarea', { class: 'field', rows: 2, placeholder: 'https://example.org/files/' });
    const comment = h('input', { class: 'field' });
    const out = pathField(S().save, { title: 'Куди зберегти .torrent' });
    const prog = h('div', { class: 'progress-line' }, h('i', { style: { width: '0%' } }));
    const status = h('div', { class: 'hint' });
    const body = h('div', null,
      h('fieldset', { class: 'group', style: { marginTop: 0 } }, h('legend', null, 'Вибрати файл або папку'), path,
        h('div', { class: 'hint' }, 'У вікні вибору відкрийте папку й натисніть «Вибрати цю папку» або торкніться файлу.')),
      h('fieldset', { class: 'group' }, h('legend', null, 'Параметри'),
        h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Розмір частини:'), h('div', { class: 'grow' }, pieceSel)),
        h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Формат торента:'), h('div', { class: 'grow' }, fmtSel)),
        privC, seedC, ignC),
      h('fieldset', { class: 'group' }, h('legend', null, 'Поля'),
        h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Адреси трекерів (порожній рядок відділяє рівні):'), trackers,
        h('div', { class: 'hint', style: { color: 'var(--text)', marginTop: '8px' } }, 'Адреси веб-сідів:'), seeds,
        h('div', { class: 'hint', style: { color: 'var(--text)', marginTop: '8px' } }, 'Коментар:'), comment),
      h('fieldset', { class: 'group' }, h('legend', null, 'Зберегти торент-файл у'), out),
      prog, status);
    let btn;
    creator = {
      progress: (d) => { prog.firstChild.style.width = (d.done / d.total * 100) + '%'; status.textContent = 'Хешування частин: ' + d.done + ' із ' + d.total; },
      done: (d) => { prog.firstChild.style.width = '100%'; status.textContent = 'Готово: ' + d.path; btn.disabled = false; toast('Торент створено'); It.pollSoon(); },
      error: (d) => { status.textContent = 'Помилка: ' + d.msg; btn.disabled = false; toast(d.msg, true); },
    };
    dialog({
      title: 'Створювач торентів', icon: I.create, body, full: true,
      buttons: [{ label: 'Закрити' }, { label: 'Створити торент', primary: true, ref: (b) => { btn = b; }, action: () => {
        const p = path.input.value.trim();
        if (!p) { toast('Виберіть файл або папку', true); return false; }
        const opts = { path: p, pieceSize: +pieceSel.value, format: fmtSel.value, priv: privC.input.checked, seed: seedC.input.checked, ignoreLimits: ignC.input.checked, trackers: trackers.value, webSeeds: seeds.value, comment: comment.value, outDir: out.input.value.trim() };
        if (tryApi('create', { opts }) !== undefined) { btn.disabled = true; status.textContent = 'Підготовка…'; prog.firstChild.style.width = '0%'; }
        return false;
      } }],
      onClose: () => { creator = null; },
    });
  }
  function creatorEvent(type, d) {
    if (!creator) { if (type === 'create.done') toast('Торент створено: ' + d.path); if (type === 'create.error') toast(d.msg, true); return; }
    if (type === 'create.progress') creator.progress(d);
    else if (type === 'create.done') creator.done(d);
    else creator.error(d);
  }

  window.Dialogs = { addLinks, addTorrent, previewMeta, remove, category, rateLimit, shareLimit, globalLimits, stats, about, welcome, creator: creatorDialog, creatorEvent };
})();
