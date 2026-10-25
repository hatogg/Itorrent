// Вікно налаштувань: сторінки зліва, групи параметрів справа, «Гаразд / Скасувати / Застосувати».
(function () {
  const { h, svg, tryApi, toast, dialog, check, select, numField, pathField } = U;

  let pending = {};
  let cur = {};
  let current = null;

  const DAYS = [['every', 'Щодня'], ['weekdays', 'Будні'], ['weekends', 'Вихідні'], ['mon', 'Понеділок'], ['tue', 'Вівторок'], ['wed', 'Середа'], ['thu', 'Четвер'], ['fri', "П'ятниця"], ['sat', 'Субота'], ['sun', 'Неділя']];

  const val = (k) => (k in pending ? pending[k] : cur[k]);
  const set = (k, v) => { pending[k] = v; };

  // будівельні блоки
  const C = (label, k, opts) => {
    opts = opts || {};
    const c = check(label, opts.invert ? !val(k) : val(k), (on) => { set(k, opts.invert ? !on : on); if (opts.onchange) opts.onchange(on); }, opts.sub ? 'sub' : '');
    return c;
  };
  const N = (label, k, unit, min, max, step) => {
    const i = numField(val(k), min, max, step);
    i.addEventListener('input', () => {
      const v = step && step < 1 ? parseFloat(String(i.value).replace(',', '.')) : parseInt(i.value, 10);
      if (!isNaN(v)) set(k, v);
    });
    return h('div', { class: 'row' }, h('label', { class: 'lbl grow' }, label), i, unit ? h('span', { class: 'unit', style: { minWidth: '38px' } }, unit) : null);
  };
  const SEL = (label, k, options) => {
    const s = select(options, val(k), (v) => set(k, typeof cur[k] === 'number' ? +v : v));
    return h('div', { class: 'row' }, h('label', { class: 'lbl' }, label), h('div', { class: 'grow' }, s));
  };
  const T = (label, k, ph, type) => {
    const i = h('input', { class: 'field', type: type || 'text', placeholder: ph || '' });
    i.value = val(k);
    i.addEventListener('input', () => set(k, i.value));
    return h('div', { class: 'row' }, h('label', { class: 'lbl' }, label), h('div', { class: 'grow' }, i));
  };
  const TIME = (k) => {
    const i = h('input', { class: 'field', type: 'time', style: { width: '110px' } });
    i.value = val(k);
    i.addEventListener('change', () => set(k, i.value || '00:00'));
    return i;
  };
  const AREA = (k, ph, rows) => {
    const t = h('textarea', { class: 'field', rows: rows || 4, placeholder: ph || '' });
    t.value = val(k);
    t.addEventListener('input', () => set(k, t.value));
    return t;
  };
  const PATH = (k, title, ph) => {
    const p = pathField(val(k), { title, placeholder: ph });
    p.input.addEventListener('input', () => set(k, p.input.value.trim()));
    p.input.addEventListener('change', () => set(k, p.input.value.trim()));
    return p;
  };
  const G = (title, ...kids) => h('fieldset', { class: 'group' }, h('legend', null, title), ...kids);
  const HINT = (t, indent) => h('div', { class: 'hint' + (indent ? ' indent' : '') }, t);
  const enableWith = (c, ...els) => {
    const sync = () => { for (const e of els) { e.style.opacity = c.input.checked ? 1 : 0.45; e.style.pointerEvents = c.input.checked ? '' : 'none'; } };
    c.input.addEventListener('change', sync);
    sync();
    return c;
  };

  const PAGES = [
    ['behavior', 'Поведінка', 'monitor', () => {
      const info = It.info();
      const perm = h('div');
      const permRow = (ok, label, fn) => h('div', { class: 'row' }, svg(ok ? I.connOn : I.connFw), h('span', { class: 'grow' }, label), ok ? h('span', { class: 'hint', style: { margin: 0 } }, 'Надано') : h('button', { class: 'btn small', onclick: fn }, 'Надати'));
      perm.append(
        permRow(It.S.session.storage !== false && info.storage, 'Доступ до всіх файлів', () => tryApi('perm.storage')),
        permRow(info.notifPerm, 'Сповіщення', () => tryApi('perm.notifications')));
      return [
        G('Інтерфейс', SEL('Тема:', 'theme', [['system', 'Як у системі'], ['light', 'Світла'], ['dark', 'Темна']])),
        G('Список передач', C('Підтверджувати вилучення торентів', 'confirmDelete'), C('Типово видаляти файли разом із торентом', 'deleteFilesDefault')),
        G('Сповіщення', C('Сповіщати про завершення завантаження', 'notifyFinished')),
        G('Робота у фоні',
          C('Запускати Itorrent під час увімкнення пристрою', 'startOnBoot'),
          C('Вийти, коли всі завантаження завершено', 'exitWhenDone'),
          C('Не давати пристрою засинати під час передач', 'keepAwake'),
          HINT('Itorrent працює у фоні, доки ви не виберете «Вихід» у меню або сповіщенні.')),
        G('Дозволи', perm),
      ];
    }],
    ['downloads', 'Завантаження', 'download', () => {
      const temp = PATH('tempPath', 'Папка для незавершених', 'Наприклад, /storage/emulated/0/Download/Itorrent/.incomplete');
      return [
        G('Додавання торента',
          C('Показувати діалог додавання торента', 'showAddDialog'),
          C('Запускати торенти одразу після додавання', 'addStopped', { invert: true }),
          C('Завантажувати послідовно (типово)', 'seqDefault'),
          C('Спершу перша й остання частини (типово)', 'firstLastDefault')),
        G('Збереження файлів',
          h('div', { class: 'hint', style: { color: 'var(--text)' } }, 'Типовий шлях збереження:'),
          PATH('savePath', 'Типовий шлях збереження', It.info().publicDownloads),
          HINT('Порожньо — «' + It.info().publicDownloads + '».'),
          enableWith(C('Тримати незавершені торенти в:', 'tempPathEnabled'), temp), temp,
          C('Резервувати місце на диску для всіх файлів', 'preallocate')),
      ];
    }],
    ['connection', "З'єднання", 'network', () => {
      const portIn = numField(val('listenPort'), 1024, 65535);
      portIn.addEventListener('input', () => { const v = parseInt(portIn.value, 10); if (v >= 1024 && v <= 65535) set('listenPort', v); });
      const proxyBox = h('div', null, T('Хост:', 'proxyHost', '127.0.0.1'), N('Порт:', 'proxyPort', '', 1, 65535));
      const authBox = h('div', null, T("Ім'я:", 'proxyUser'), T('Пароль:', 'proxyPass', '', 'password'));
      const ipPath = h('input', { class: 'field', readonly: true });
      ipPath.value = val('ipFilterPath') ? val('ipFilterPath').split('/').pop() : '';
      current.ipPath = ipPath;
      const ipBox = h('div', null, h('div', { class: 'pathrow' }, ipPath, h('button', { class: 'btn', onclick: () => tryApi('ipfilter.pick') }, 'Вибрати файл')),
        HINT('Підтримуються формати eMule (.dat), PeerGuardian (.p2p) і списки адрес чи підмереж (CIDR).'),
        C('Застосовувати до трекерів', 'ipFilterTrackers'));
      return [
        G('Порт прослуховування',
          h('div', { class: 'row' }, h('label', { class: 'lbl grow' }, 'Порт для вхідних з\'єднань:'), portIn,
            h('button', { class: 'btn small', onclick: () => { const p = 20000 + Math.floor(Math.random() * 40000); portIn.value = p; set('listenPort', p); } }, 'Випадковий')),
          C('Переадресовувати порт через UPnP / NAT-PMP', 'upnp')),
        G("Обмеження з'єднань",
          N("Глобальна макс. кількість з'єднань:", 'maxConn', '', 2, 5000),
          N("Макс. з'єднань на торент:", 'maxConnTorrent', '', 0, 5000),
          N('Глобальна макс. кількість слотів вивантаження:', 'maxUploads', '', 0, 1000),
          N('Макс. слотів вивантаження на торент:', 'maxUploadsTorrent', '', 0, 1000),
          HINT('0 — без обмеження.')),
        G('Проксі-сервер',
          SEL('Тип:', 'proxyType', [['none', 'Немає'], ['socks4', 'SOCKS4'], ['socks5', 'SOCKS5'], ['http', 'HTTP']]),
          proxyBox,
          enableWith(C('Автентифікація', 'proxyAuth'), authBox), authBox,
          C("Використовувати проксі для з'єднань із пірами", 'proxyPeers'),
          C('Виконувати DNS-запити через проксі', 'proxyHostnames')),
        G('IP-фільтрування',
          enableWith(C('Фільтр IP-адрес', 'ipFilterEnabled'), ipBox), ipBox,
          h('div', { class: 'hint', style: { color: 'var(--text)', marginTop: '8px' } }, 'Вручну заблоковані IP-адреси (по одній у рядку):'),
          AREA('bannedIps', '192.0.2.1\n198.51.100.0/24', 3)),
      ];
    }],
    ['speed', 'Швидкість', 'speed', () => {
      const sched = h('div', null,
        h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'З:'), TIME('altFrom'), h('label', { style: { marginLeft: '8px' } }, 'до:'), TIME('altTo')),
        SEL('Коли:', 'altDays', DAYS));
      return [
        G('Глобальні ліміти', N('Завантаження:', 'dlLimit', 'КіБ/с', 0, 1000000), N('Вивантаження:', 'upLimit', 'КіБ/с', 0, 1000000), HINT('0 — без обмеження.')),
        G('Альтернативні ліміти', N('Завантаження:', 'altDlLimit', 'КіБ/с', 0, 1000000), N('Вивантаження:', 'altUpLimit', 'КіБ/с', 0, 1000000),
          HINT('Вмикаються значком черепахи в рядку стану.'),
          enableWith(C('Розклад використання альтернативних лімітів', 'altSchedule'), sched), sched),
        G('Параметри лімітів', C('Враховувати службовий трафік у лімітах', 'limitOverhead')),
      ];
    }],
    ['bittorrent', 'BitTorrent', 'magnet', () => {
      const queue = h('div', null,
        N('Макс. активних завантажень:', 'maxActiveDl', '', -1, 999),
        N('Макс. активних роздач:', 'maxActiveUp', '', -1, 999),
        N('Макс. активних торентів:', 'maxActiveTorrents', '', -1, 999),
        C('Не враховувати повільні торенти', 'dontCountSlow'));
      const ratioIn = N('Рейтинг:', 'ratioLimit', '', 0, 9998, 0.05);
      const timeIn = N('Час роздачі:', 'seedTime', 'хв', 0, 525600);
      const trk = AREA('addTrackers', 'udp://tracker.opentrackr.org:1337/announce', 4);
      return [
        G('Приватність',
          C('Увімкнути DHT (децентралізована мережа) для пошуку пірів', 'dht'),
          C('Увімкнути обмін пірами (PeX)', 'pex'),
          C('Увімкнути локальний пошук пірів (LSD)', 'lsd'),
          SEL('Шифрування:', 'encryption', [[0, 'Дозволити шифрування'], [1, 'Вимагати шифрування'], [2, 'Вимкнути шифрування']]),
          C('Анонімний режим', 'anonymous'),
          HINT('Анонімний режим приховує відомості про клієнт, але не IP-адресу.')),
        G('Черга торентів', enableWith(C('Увімкнути чергу торентів', 'queueing'), queue), queue),
        G('Обмеження роздачі',
          enableWith(C('Коли рейтинг досягає', 'ratioLimitEnabled'), ratioIn), ratioIn,
          enableWith(C('Коли загальний час роздачі досягає', 'seedTimeEnabled'), timeIn), timeIn,
          SEL('Тоді:', 'seedAction', [['stop', 'Зупинити торент'], ['remove', 'Вилучити торент'], ['removeFiles', 'Вилучити торент і файли'], ['superSeed', 'Увімкнути суперроздачу']])),
        G('Трекери', enableWith(C('Автоматично додавати ці трекери до нових завантажень:', 'addTrackersEnabled'), trk), trk),
      ];
    }],
    ['power', 'Живлення й мережа', 'battery', () => {
      const bat = N('Поріг заряду:', 'batteryLimit', '%', 1, 99);
      const sched = h('div', null,
        h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'З:'), TIME('schedFrom'), h('label', { style: { marginLeft: '8px' } }, 'до:'), TIME('schedTo')),
        SEL('Коли:', 'schedDays', DAYS));
      return [
        G('Мережа',
          C('Лише через Wi‑Fi (безлімітні мережі)', 'wifiOnly'),
          HINT('У мобільній мережі передачі ставляться на паузу.', true),
          C('Лише через VPN', 'vpnOnly'),
          HINT('Без активного VPN передачі ставляться на паузу, а сесія прив’язується до інтерфейсу VPN — так ваша IP-адреса не потрапить до пірів.', true)),
        G('Батарея',
          C('Лише під час заряджання', 'chargingOnly'),
          enableWith(C('Зупиняти, коли заряд батареї нижче порогу', 'batteryLimitEnabled'), bat), bat),
        G('Розклад роботи',
          enableWith(C('Працювати лише в заданий час', 'schedEnabled'), sched), sched,
          HINT('Поза розкладом усі передачі ставляться на паузу.')),
      ];
    }],
    ['rss', 'RSS', 'rssMono', () => {
      const box = h('div', null, N('Оновлювати канали кожні:', 'rssInterval', 'хв', 5, 1440), N('Макс. статей на канал:', 'rssMaxArticles', '', 5, 1000));
      return [
        G('RSS-читач', enableWith(C('Увімкнути автоматичне оновлення каналів', 'rssEnabled'), box), box),
        G('RSS-завантажувач',
          C('Автоматично завантажувати торенти за правилами', 'rssAutoDownload'),
          h('button', { class: 'btn', style: { marginTop: '6px' }, onclick: () => Rss.rules() }, svg(I.edit), 'Правила завантаження…')),
      ];
    }],
  ];

  function open(pageId) {
    cur = tryApi('prefs.get') || It.prefs();
    pending = {};
    current = { page: pageId || (current && current.last) || 'behavior' };
    const nav = h('div', { class: 'opts-nav' });
    const page = h('div', { class: 'opts-page' });
    const show = (id) => {
      current.page = id;
      current.last = id;
      for (const n of nav.children) n.classList.toggle('on', n._id === id);
      const def = PAGES.find((p) => p[0] === id);
      page.innerHTML = '';
      page.appendChild(h('h2', null, def[1]));
      for (const g of def[3]()) page.appendChild(g);
      page.scrollTop = 0;
    };
    for (const [id, label, icon] of PAGES) {
      const it = h('div', { class: 'on-item', onclick: () => show(id) }, svg(I[icon]), h('span', null, label));
      it._id = id;
      nav.appendChild(it);
    }
    const body = h('div', { class: 'opts' }, nav, page);
    const apply = () => {
      if (!Object.keys(pending).length) return true;
      const np = tryApi('prefs.set', { values: pending });
      if (!np) return false;
      const themeChanged = 'theme' in pending;
      cur = np;
      pending = {};
      It.setPrefs(np);
      if (themeChanged) It.applyTheme();
      It.pollSoon();
      return true;
    };
    dialog({
      title: 'Налаштування', icon: I.gear, body, full: true, flush: true,
      buttons: [
        { label: 'Застосувати', left: true, action: () => { apply(); toast('Налаштування застосовано'); return false; } },
        { label: 'Скасувати' },
        { label: 'Гаразд', primary: true, action: () => (apply() ? true : false) },
      ],
      onClose: () => { current.ipPath = null; },
    });
    show(current.page);
  }

  function onIpFilter(d) {
    pending.ipFilterPath = d.path;
    pending.ipFilterEnabled = true;
    if (current && current.ipPath) current.ipPath.value = d.name;
    toast('Вибрано фільтр: ' + d.name + '. Натисніть «Гаразд», щоб застосувати.');
    if (current && current.page === 'connection') {
      const c = document.querySelectorAll('.opts-page .check input');
      void c;
    }
  }

  window.Options = { open, onIpFilter };
})();
