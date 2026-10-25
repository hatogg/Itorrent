// RSS: канали, статті, перегляд статті та правила автоматичного завантаження.
(function () {
  const { h, svg, tryApi, toast, dialog, check, select, menu, prompt, date, size, plural } = U;

  let root = null;
  let data = { feeds: [], rules: [] };
  let feedSel = null; // url або '*' — непрочитані
  let artSel = null;

  function load() { data = tryApi('rss.get') || data; }

  function show(container) {
    root = container;
    load();
    render();
  }

  function refresh() { if (!root || root.classList.contains('hidden')) return; load(); render(); }

  function back() {
    if (artSel) { artSel = null; render(); return true; }
    if (feedSel) { feedSel = null; render(); return true; }
    return false;
  }

  const unread = (f) => (f.articles || []).filter((a) => !a.read).length;

  function render() {
    if (!root) return;
    root.innerHTML = '';
    const tb = (icon, label, fn) => h('button', { class: 'tb', onclick: fn }, svg(I[icon]), h('span', null, label));
    root.appendChild(h('div', { class: 'rss-tools' },
      tb('plus', 'Канал', addFeed),
      tb('refresh', 'Оновити', () => { tryApi('rss.refresh', {}); toast('Оновлення каналів…'); setTimeout(refresh, 300); }),
      tb('check', 'Прочитано', () => { tryApi('rss.markRead', { url: feedSel && feedSel !== '*' ? feedSel : '' }); refresh(); }),
      h('span', { style: { flex: 1 } }),
      tb('edit', 'Правила', () => rules())));
    const wrap = h('div', { class: 'rss' });
    root.appendChild(wrap);
    if (!feedSel) renderFeeds(wrap); else renderArticles(wrap);
  }

  function renderFeeds(wrap) {
    const list = h('div', { class: 'rss-list' });
    const total = data.feeds.reduce((s, f) => s + unread(f), 0);
    const row = (icon, title, sub, n, onclick, onlong, err) => {
      const r = h('div', { class: 'rss-feed', onclick }, svg(icon), h('div', { class: 'n' }, h('div', null, title), sub ? h('div', { class: 'sub', style: err ? { color: 'var(--s-err)' } : null }, sub) : null), n > 0 ? h('span', { class: 'badge' }, n) : null);
      if (onlong) U.longPress(r, (e, pt) => onlong(pt));
      list.appendChild(r);
    };
    row(I.rss, 'Непрочитані', null, total, () => { feedSel = '*'; render(); });
    for (const f of data.feeds) {
      const sub = f.refreshing ? 'Оновлення…' : f.error ? 'Помилка: ' + f.error : (f.updated ? 'Оновлено ' + date(f.updated) : 'Ще не оновлювався');
      row(I.rss, f.name || f.title || f.url, sub, unread(f), () => { feedSel = f.url; render(); }, (pt) => feedMenu(f, pt), !!f.error && !f.refreshing);
    }
    if (!data.feeds.length) {
      list.appendChild(h('div', { class: 'pane-empty' },
        h('p', null, 'Немає RSS-каналів. Додайте канал трекера чи сайту, щоб бачити нові роздачі й завантажувати їх автоматично за правилами.'),
        h('button', { class: 'btn', onclick: addFeed }, svg(I.plus), 'Новий канал')));
    }
    wrap.appendChild(list);
  }

  function articlesOf() {
    if (feedSel === '*') {
      const all = [];
      for (const f of data.feeds) for (const a of f.articles || []) if (!a.read) all.push(Object.assign({ feed: f.url }, a));
      return all.sort((a, b) => b.date - a.date);
    }
    const f = data.feeds.find((x) => x.url === feedSel);
    return f ? (f.articles || []).map((a) => Object.assign({ feed: f.url }, a)) : [];
  }

  function renderArticles(wrap) {
    const f = data.feeds.find((x) => x.url === feedSel);
    const title = feedSel === '*' ? 'Непрочитані' : f ? (f.name || f.title || f.url) : '';
    wrap.appendChild(h('div', { class: 'rss-crumb' }, h('button', { class: 'btn icon small', onclick: () => { feedSel = null; artSel = null; render(); } }, svg(I.back)), h('span', { class: 't' }, title),
      f ? h('button', { class: 'btn icon small', onclick: () => { tryApi('rss.refresh', { url: f.url }); toast('Оновлення…'); setTimeout(refresh, 300); } }, svg(I.refresh)) : null));
    const list = h('div', { class: 'rss-list' });
    const arts = articlesOf();
    for (const a of arts) {
      const sel = artSel && artSel.id === a.id && artSel.feed === a.feed;
      const r = h('div', { class: 'rss-art' + (a.read ? '' : ' unread') + (sel ? ' sel' : ''), onclick: () => openArticle(a) },
        svg(/^magnet:|\.torrent($|\?)/i.test(a.torrent) ? I.magnet : I.file),
        h('div', { class: 'n' }, h('div', null, a.title), h('div', { class: 'sub' }, [a.date ? date(a.date) : '', a.size > 0 ? size(a.size) : ''].filter(Boolean).join(' · '))));
      U.longPress(r, (e, pt) => articleMenu(a, pt));
      list.appendChild(r);
    }
    if (!arts.length) list.appendChild(h('div', { class: 'pane-empty' }, feedSel === '*' ? 'Усі статті прочитано.' : (f && f.error ? 'Не вдалося отримати канал: ' + f.error : 'Канал порожній.')));
    wrap.appendChild(list);
    if (artSel) {
      const a = artSel;
      const doc = new DOMParser().parseFromString('<div>' + (a.desc || '') + '</div>', 'text/html');
      for (const br of doc.querySelectorAll('br,p,div,li,tr')) br.append('\n');
      const text = (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
      wrap.appendChild(h('div', { class: 'art-view' },
        h('h3', null, a.title),
        h('div', { class: 'd' }, a.date ? date(a.date) : ''),
        h('div', { class: 'btns' },
          h('button', { class: 'btn primary', onclick: () => download(a, true) }, svg(I.download), 'Завантажити'),
          a.link ? h('button', { class: 'btn', onclick: () => tryApi('openUrl', { url: a.link }) }, svg(I.open), 'Відкрити посилання') : null),
        text ? h('div', { class: 'desc' }, text) : null));
    }
  }

  function openArticle(a) {
    artSel = a;
    if (!a.read) { tryApi('rss.markRead', { url: a.feed, id: a.id }); a.read = true; load(); }
    render();
  }

  function download(a, dialogFlag) {
    tryApi('rss.download', { url: a.feed, id: a.id, dialog: dialogFlag && It.prefs().showAddDialog });
    if (!dialogFlag || !It.prefs().showAddDialog) toast('Завантаження: ' + a.title);
  }

  function articleMenu(a, pt) {
    menu([
      { label: 'Завантажити', icon: I.download, action: () => download(a, true) },
      a.link ? { label: 'Відкрити посилання', icon: I.open, action: () => tryApi('openUrl', { url: a.link }) } : null,
      { label: 'Копіювати посилання на торент', icon: I.copy, action: () => It.copy(a.torrent) },
      !a.read ? { label: 'Позначити прочитаною', icon: I.check, action: () => { tryApi('rss.markRead', { url: a.feed, id: a.id }); refresh(); } } : null,
    ], pt, a.title);
  }

  function feedMenu(f, pt) {
    menu([
      { label: 'Оновити', icon: I.refresh, action: () => { tryApi('rss.refresh', { url: f.url }); setTimeout(refresh, 300); } },
      { label: 'Позначити все прочитаним', icon: I.check, action: () => { tryApi('rss.markRead', { url: f.url }); refresh(); } },
      { label: 'Перейменувати…', icon: I.rename, action: () => prompt('Перейменувати канал', 'Нова назва', f.name || f.title).then((v) => { if (v !== undefined) { tryApi('rss.renameFeed', { url: f.url, name: v }); refresh(); } }) },
      { label: 'Копіювати адресу каналу', icon: I.copy, action: () => It.copy(f.url) },
      '-',
      { label: 'Вилучити канал', icon: I.remove, action: () => U.confirm('Вилучити канал', 'Вилучити канал «' + U.esc(f.name || f.title || f.url) + '»?', 'Вилучити').then((ok) => { if (ok) { tryApi('rss.removeFeed', { url: f.url }); refresh(); } }) },
    ], pt, f.name || f.title || f.url);
  }

  function addFeed() {
    const url = h('input', { class: 'field', type: 'url', placeholder: 'https://example.org/rss', autofocus: true });
    const name = h('input', { class: 'field', placeholder: 'Необов\'язково' });
    const body = h('div', null, h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Адреса RSS-каналу:'), url,
      h('div', { class: 'hint', style: { color: 'var(--text)', marginTop: '10px' } }, 'Назва:'), name);
    dialog({
      title: 'Новий RSS-канал', icon: I.rss, body,
      buttons: [{ label: 'Скасувати' }, { label: 'Додати', primary: true, action: () => {
        if (tryApi('rss.addFeed', { url: url.value.trim(), name: name.value.trim() }) === undefined) return false;
        setTimeout(refresh, 200);
        return true;
      } }],
    });
  }

  // ---------------------------------------------------------------- правила
  function rules() {
    load();
    let list = JSON.parse(JSON.stringify(data.rules || []));
    let selIdx = list.length ? 0 : -1;
    const left = h('div', { style: { borderBottom: '1px solid var(--line)', background: 'var(--panel)', maxHeight: '30%', overflow: 'auto', flex: 'none' } });
    const right = h('div', { style: { flex: 1, overflow: 'auto', padding: '4px 12px 16px' } });
    const body = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h('div', { class: 'rss-tools' },
        h('button', { class: 'tb', onclick: () => {
          prompt('Нове правило', 'Назва правила', '').then((n) => {
            if (!n || !n.trim()) return;
            list.push({ name: n.trim(), enabled: true, mustContain: '', mustNotContain: '', useRegex: false, feeds: [], category: '', savePath: '', addStopped: 'default' });
            selIdx = list.length - 1;
            draw();
          });
        } }, svg(I.plus), h('span', null, 'Нове правило')),
        h('button', { class: 'tb', onclick: () => { if (selIdx >= 0) { list.splice(selIdx, 1); selIdx = Math.min(selIdx, list.length - 1); draw(); } } }, svg(I.remove), h('span', null, 'Вилучити'))),
      left, right);

    function draw() {
      left.innerHTML = '';
      list.forEach((r, i) => {
        const cb = h('input', { type: 'checkbox', class: 'chk' });
        cb.checked = r.enabled !== false;
        cb.addEventListener('click', (e) => { e.stopPropagation(); r.enabled = cb.checked; });
        left.appendChild(h('div', { class: 'rule-item' + (i === selIdx ? ' on' : ''), onclick: () => { selIdx = i; draw(); } }, cb, h('span', { class: 'n' }, r.name)));
      });
      if (!list.length) left.appendChild(h('div', { class: 'pane-empty' }, 'Правил ще немає.'));
      right.innerHTML = '';
      const r = list[selIdx];
      if (!r) return;
      const inp = (k, ph) => { const i = h('input', { class: 'field', placeholder: ph || '' }); i.value = r[k] || ''; i.addEventListener('input', () => { r[k] = i.value; test(); }); return i; };
      const must = inp('mustContain', 'Наприклад: 1080p серіал');
      const not = inp('mustNotContain', 'Наприклад: CAM|TS');
      const regex = check('Використовувати регулярні вирази', r.useRegex, (on) => { r.useRegex = on; test(); });
      const cats = Object.keys(It.S.cats).sort();
      const cat = select([['', '(Без категорії)']].concat(cats.map((c) => [c, c])), r.category || '', (v) => { r.category = v; });
      const path = U.pathField(r.savePath || '', { title: 'Шлях збереження для правила', placeholder: 'Типовий' });
      path.input.addEventListener('change', () => { r.savePath = path.input.value.trim(); });
      path.input.addEventListener('input', () => { r.savePath = path.input.value.trim(); });
      const stopped = select([['default', 'Як у налаштуваннях'], ['no', 'Запускати'], ['yes', 'Додавати зупиненим']], r.addStopped || 'default', (v) => { r.addStopped = v; });
      const feeds = h('div');
      if (!r.feeds) r.feeds = [];
      for (const f of data.feeds) {
        feeds.appendChild(check(f.name || f.title || f.url, r.feeds.includes(f.url), (on) => { r.feeds = on ? r.feeds.concat([f.url]) : r.feeds.filter((u) => u !== f.url); test(); }));
      }
      if (!data.feeds.length) feeds.appendChild(h('div', { class: 'hint' }, 'Спершу додайте RSS-канали.'));
      const matches = h('div', { class: 'hint' });
      function test() {
        const m = tryApi('rss.test', { rule: r }) || [];
        matches.innerHTML = '';
        matches.appendChild(h('div', { style: { color: 'var(--text)', marginBottom: '4px' } }, 'Збіги серед наявних статей: ' + m.length));
        for (const t of m.slice(0, 30)) matches.appendChild(h('div', null, '• ' + t));
      }
      right.append(
        h('fieldset', { class: 'group' }, h('legend', null, 'Визначення правила'),
          regex,
          h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Має містити:'), must,
          h('div', { class: 'hint', style: { color: 'var(--text)', marginTop: '8px' } }, 'Не має містити:'), not,
          h('div', { class: 'hint' }, r.useRegex ? 'Регулярні вирази без урахування регістру.' : 'Пробіл — «і», | — «або», * і ? — шаблони. Регістр не враховується.')),
        h('fieldset', { class: 'group' }, h('legend', null, 'Що робити зі збігами'),
          h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Категорія:'), h('div', { class: 'grow' }, cat)),
          h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Зберігати в:'), path,
          h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Додавати:'), h('div', { class: 'grow' }, stopped))),
        h('fieldset', { class: 'group' }, h('legend', null, 'Застосовувати до каналів'), feeds, h('div', { class: 'hint' }, 'Жоден не вибрано — до всіх каналів.')),
        h('fieldset', { class: 'group' }, h('legend', null, 'Перевірка'), matches));
      test();
    }
    draw();
    dialog({
      title: 'RSS-завантажувач', icon: I.rss, body, full: true, flush: true,
      buttons: [{ label: 'Скасувати' }, { label: 'Зберегти', primary: true, action: () => { tryApi('rss.rules', { rules: list }); toast('Правила збережено'); refresh(); return true; } }],
    });
  }

  function openFeed(url) { feedSel = url; artSel = null; render(); }
  window.Rss = { show, refresh, back, rules, openFeed, state: () => ({ feedSel, artSel: artSel && artSel.id, feeds: data.feeds.length }) };
})();
