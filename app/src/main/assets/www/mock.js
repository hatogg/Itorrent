// Заглушка рушія: дає змогу відкрити інтерфейс у звичайному браузері з правдоподібними даними.
(function () {
  if (window.Android) return;
  const params = new URLSearchParams(location.search);
  const now = Date.now();
  const GiB = 1073741824, MiB = 1048576;
  const prefs = {
    theme: params.get('theme') || 'system', confirmDelete: true, deleteFilesDefault: false, showAddDialog: true, startOnBoot: false,
    notifyFinished: true, exitWhenDone: false, keepAwake: true, savePath: '', tempPathEnabled: false, tempPath: '', addStopped: false,
    preallocate: false, seqDefault: false, firstLastDefault: false, listenPort: 48213, randomPort: false, upnp: true, maxConn: 200,
    maxConnTorrent: 100, maxUploads: 20, maxUploadsTorrent: 4, proxyType: 'none', proxyHost: '', proxyPort: 1080, proxyAuth: false,
    proxyUser: '', proxyPass: '', proxyPeers: true, proxyHostnames: true, ipFilterEnabled: false, ipFilterPath: '', ipFilterTrackers: false,
    bannedIps: '', dlLimit: 0, upLimit: 2048, altDlLimit: 512, altUpLimit: 128, altEnabled: false, altSchedule: false, altFrom: '08:00',
    altTo: '20:00', altDays: 'every', limitOverhead: false, dht: true, pex: true, lsd: true, encryption: 0, anonymous: false,
    queueing: true, maxActiveDl: 3, maxActiveUp: 3, maxActiveTorrents: 5, dontCountSlow: false, ratioLimitEnabled: false, ratioLimit: 1,
    seedTimeEnabled: false, seedTime: 1440, seedAction: 'stop', addTrackersEnabled: false, addTrackers: '', wifiOnly: false,
    chargingOnly: false, batteryLimitEnabled: false, batteryLimit: 15, vpnOnly: false, schedEnabled: false, schedFrom: '01:00',
    schedTo: '07:00', schedDays: 'every', rssEnabled: true, rssInterval: 30, rssMaxArticles: 50, rssAutoDownload: true,
    ui: params.get('ui') || '{}', categories: '{}', tags: '[]', allTimeDl: 812 * GiB, allTimeUl: 1310 * GiB, firstRunDone: params.get('first') !== '1',
  };
  const cats = { 'Фільми': { savePath: '/storage/emulated/0/Movies' }, 'Linux': { savePath: '' }, 'Книги': { savePath: '' } };
  let tags = ['4K', 'архів', 'роздаю'];
  const T = (id, name, size, progress, state, o) => Object.assign({
    id, name, size, total: size, progress, state, dl: 0, ul: 0, seeds: 0, seedsT: 0, peers: 0, peersT: 0, eta: -1, ratio: 0,
    cat: '', tags: [], added: now - 86400e3, completed: 0, path: '/storage/emulated/0/Download/Itorrent', dlAll: size * progress,
    ulAll: 0, dlS: 0, ulS: 0, left: size * (1 - progress), active: 3600, seeding: 0, seq: false, fl: false, superSeed: false,
    dlLim: 0, ulLim: 0, tracker: '', lastAct: 30, queue: -1, meta: true, err: '', priv: false, ratioLim: -2, seedLim: -2, conns: 0,
  }, o || {});
  let rows = [
    T('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'ubuntu-24.04.3-desktop-amd64.iso', 6.0 * GiB, 0.4527, 'downloading', { dl: 6.3 * MiB, ul: 412e3, seeds: 48, seedsT: 2311, peers: 7, peersT: 154, eta: 540, ratio: 0.08, cat: 'Linux', tags: ['роздаю'], tracker: 'https://torrent.ubuntu.com/announce', queue: 0, conns: 55, added: now - 1800e3 }),
    T('b2c3d4e5f60718293a4b5c6d7e8f901234567890', 'debian-13.1.0-amd64-netinst.iso', 754 * MiB, 1, 'uploading', { ul: 1.2 * MiB, seeds: 0, seedsT: 412, peers: 6, peersT: 31, ratio: 2.41, cat: 'Linux', tracker: 'http://bttracker.debian.org:6969/announce', completed: now - 3 * 86400e3, ulAll: 1.8 * GiB, conns: 6, added: now - 4 * 86400e3 }),
    T('c3d4e5f60718293a4b5c6d7e8f90123456789012', 'Big Buck Bunny (2008) [1080p] [BluRay]', 885 * MiB, 0.7811, 'stalledDL', { seeds: 0, seedsT: 3, peers: 1, peersT: 2, cat: 'Фільми', tags: ['4K'], tracker: 'udp://tracker.opentrackr.org:1337/announce', queue: 1, added: now - 2 * 86400e3 }),
    T('d4e5f60718293a4b5c6d7e8f9012345678901234', 'Sintel.2010.1080p.mkv', 1.17 * GiB, 0.1203, 'metaDL', { meta: false, size: -1, total: -1, queue: 2, added: now - 600e3 }),
    T('e5f60718293a4b5c6d7e8f901234567890123456', 'Шевченко Т. Г. — Кобзар (аудіокнига, MP3 128 kbps)', 412 * MiB, 1, 'stoppedUP', { ratio: 0.73, cat: 'Книги', tags: ['архів'], completed: now - 20 * 86400e3, added: now - 21 * 86400e3, ulAll: 300 * MiB }),
    T('f60718293a4b5c6d7e8f90123456789012345678', 'ukwiki-20261001-pages-articles-multistream.xml.bz2', 4.8 * GiB, 0.0213, 'stoppedDL', { added: now - 5 * 86400e3 }),
    T('0718293a4b5c6d7e8f9012345678901234567890', 'LibreOffice_25.8.2_Linux_x86-64_deb', 233 * MiB, 0, 'queuedDL', { queue: 3, tracker: 'udp://tracker.opentrackr.org:1337/announce' }),
    T('18293a4b5c6d7e8f901234567890123456789012', 'ukraine-latest.osm.pbf', 1.42 * GiB, 0.664, 'error', { err: 'Немає місця на пристрої', added: now - 7 * 86400e3 }),
    T('293a4b5c6d7e8f9012345678901234567890abcd', 'Fedora-Workstation-Live-x86_64-43', 2.3 * GiB, 1, 'stalledUP', { ratio: 1.02, cat: 'Linux', completed: now - 9 * 86400e3, added: now - 10 * 86400e3, tracker: 'http://torrent.fedoraproject.org:6969/announce' }),
  ];
  const logs = [];
  let logId = 0;
  const log = (lvl, m) => logs.push([++logId, Date.now(), lvl, m]);
  log(0, 'Itorrent 1.0 запущено');
  log(1, 'libtorrent 2.0.11.0');
  log(1, 'Прослуховування: 0.0.0.0, порт TCP/48213');
  log(1, 'Відновлення торентів: 9');
  log(1, 'Зовнішня IP-адреса: 93.170.44.12');
  log(2, 'Не вдалося переадресувати порт: UPnP не знайдено');
  log(0, 'Завантаження завершено: debian-13.1.0-amd64-netinst.iso');
  log(3, 'Помилка торента «ukraine-latest.osm.pbf»: Немає місця на пристрої');
  const files = [
    [0, 'ubuntu-24.04.3-desktop-amd64.iso', 6.0 * GiB],
  ];
  const bbbFiles = [
    [0, 'Big Buck Bunny (2008)/Big.Buck.Bunny.2008.1080p.BluRay.mkv', 860 * MiB],
    [1, 'Big Buck Bunny (2008)/Subs/eng.srt', 41e3],
    [2, 'Big Buck Bunny (2008)/Subs/ukr.srt', 43e3],
    [3, 'Big Buck Bunny (2008)/Extras/Making of.mp4', 24 * MiB],
    [4, 'Big Buck Bunny (2008)/poster.jpg', 512e3],
    [5, 'Big Buck Bunny (2008)/README.txt', 2e3],
  ];
  const prio = { c3d4e5f60718293a4b5c6d7e8f90123456789012: [4, 4, 4, 0, 4, 4] };
  let rss = {
    v: 1,
    feeds: [
      { url: 'https://linuxtracker.example/rss', name: 'Linux-дистрибутиви', title: 'LinuxTracker', updated: now - 600e3, error: '', articles: [
        { id: 'a1', title: 'Linux Mint 22.2 Cinnamon 64-bit', link: 'https://linuxtracker.example/t/1', torrent: 'https://linuxtracker.example/d/1.torrent', date: now - 3600e3, desc: 'Офіційний образ Linux Mint 22.2 «Zara» з робочим середовищем Cinnamon.<br>Розмір: 2,9 ГіБ', size: 3.1e9, read: false },
        { id: 'a2', title: 'Arch Linux 2026.10.01 x86_64', link: 'https://linuxtracker.example/t/2', torrent: 'magnet:?xt=urn:btih:abcdef', date: now - 2 * 86400e3, desc: 'Щомісячний образ Arch Linux.', size: 1.2e9, read: true },
        { id: 'a3', title: 'Fedora Workstation 43 x86_64', link: 'https://linuxtracker.example/t/3', torrent: 'https://linuxtracker.example/d/3.torrent', date: now - 4 * 86400e3, desc: '', size: 2.4e9, read: false },
      ] },
      { url: 'https://archive.example/rss/public-domain', name: '', title: 'Архів: суспільне надбання', updated: now - 7200e3, error: 'Сервер відповів кодом 503', articles: [] },
    ],
    rules: [{ name: 'Mint Cinnamon', enabled: true, mustContain: 'mint cinnamon', mustNotContain: 'beta|rc', useRegex: false, feeds: [], category: 'Linux', savePath: '', addStopped: 'default' }],
  };
  let alt = false;
  let t = 0;
  const pending = {};
  let emitQ = [];
  const emit = (type, d, delay) => setTimeout(() => window.It && It.onEvent(type, d), delay || 0);

  function step() {
    t++;
    for (const r of rows) {
      if (r.state === 'downloading') {
        r.dl = (5 + Math.sin(t / 5) * 2 + Math.random()) * MiB;
        r.progress = Math.min(1, r.progress + r.dl / r.size);
        r.left = r.size * (1 - r.progress);
        r.dlAll = r.size * r.progress;
        r.eta = Math.round(r.left / r.dl);
        r.ul = (300 + Math.random() * 200) * 1024;
      }
      if (r.state === 'uploading') r.ul = (0.9 + Math.random() * 0.6) * MiB;
    }
  }

  function general(r) {
    const n = 1536;
    const pieces = [], partial = [], avail = [];
    for (let i = 0; i < 480; i++) {
      const p = i / 480;
      pieces.push(p < r.progress ? 100 : (Math.random() < 0.05 ? 100 : 0));
      partial.push(p >= r.progress && p < r.progress + 0.02 ? 50 : 0);
      avail.push(Math.round((2 + Math.sin(i / 20) * 1.5 + Math.random()) * 100));
    }
    return {
      pieces: r.meta ? pieces : null, partial, avail: r.meta ? avail : null, have: Math.round(n * r.progress), numPieces: r.meta ? n : 0, pieceLen: 4 * MiB,
      totalSize: r.total, copies: 3.217, timeActive: r.active, seedingTime: r.seeding, conns: r.conns, connsLim: 100, seeds: r.seeds, seedsT: r.seedsT,
      peers: r.peers, peersT: r.peersT, dlS: 1.2 * GiB, ulS: 120 * MiB, dlAll: r.dlAll, ulAll: r.ulAll, dl: r.dl, ul: r.ul, dlAvg: 4.1 * MiB, ulAvg: 300e3,
      dlLim: r.dlLim, ulLim: r.ulLim, wasted: 3.2 * MiB, ratio: r.ratio, eta: r.eta, reannounce: 1620, lastSeen: now - 120e3, added: r.added,
      completed: r.completed, createdBy: 'mktorrent 1.1', created: now - 40 * 86400e3, comment: 'Ubuntu CD releases.ubuntu.com — https://ubuntu.com/download', priv: false,
      savePath: r.path, name: r.name, state: r.state, err: r.err, magnet: 'magnet:?xt=urn:btih:' + r.id, v1: r.id, v2: '',
    };
  }
  function trackers(r) {
    return {
      list: [
        { url: r.tracker || 'udp://tracker.opentrackr.org:1337/announce', tier: 0, status: 0, msg: '', seeds: 2311, leeches: 154, downloaded: 98123, next: 1620 },
        { url: 'udp://open.stealth.si:80/announce', tier: 1, status: 3, msg: 'Час очікування вичерпано', seeds: -1, leeches: -1, downloaded: -1, next: 300 },
        { url: 'https://tracker.example.org:443/announce', tier: 2, status: 2, msg: '', seeds: -1, leeches: -1, downloaded: -1, next: -1 },
      ],
      dht: { on: true, peers: 31 }, pex: { on: true, peers: 12 }, lsd: { on: true, peers: 0 }, priv: false,
    };
  }
  const PEERS = [
    ['185.21.216.143', 51413, 'BT', 'D X E', 'qBittorrent 5.0.4', 1, 1.9 * MiB, 0, 412 * MiB, 0, 1],
    ['91.214.64.12', 6881, 'µTP', 'D U H P', 'Transmission 4.0.6', 0.62, 820e3, 120e3, 98 * MiB, 12 * MiB, 0],
    ['2a01:4f8:c17:1234::1', 50000, 'BT', 'd K', 'libtorrent (Rasterbar) 2.0.11', 1, 0, 0, 0, 0, 1],
    ['46.219.4.200', 32154, 'BT', 'U I E', 'µTorrent 3.6.0', 0.11, 0, 210e3, 0, 33 * MiB, 0],
    ['178.150.11.7', 23781, 'Web', 'D', 'https://webseed.example.org/', 1, 640e3, 0, 120 * MiB, 0, 1],
  ];
  function content(r, fv) {
    const list = r.id.startsWith('c3') ? bbbFiles : [[0, r.name, r.total]];
    const v = r.id + ':' + list.length;
    const pr = prio[r.id] || list.map(() => 4);
    return { v, files: fv === v ? undefined : list, prog: list.map((f, i) => (pr[i] ? Math.round(f[2] * Math.min(1, r.progress + (i % 2) * 0.2)) : 0)), prio: pr, avail: list.map((f, i) => (i === 3 ? 500 : 1000)) };
  }

  function fsList(path) {
    path = path || '/storage/emulated/0/Download/Itorrent';
    const parts = path.split('/').filter(Boolean);
    const dirs = path.endsWith('Itorrent') ? ['Фільми', 'Linux', 'Книги'] : ['Download', 'Movies', 'Music', 'Documents', 'Pictures', 'Itorrent'];
    return { path, parent: parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : null, roots: [{ name: "Внутрішня пам'ять", path: '/storage/emulated/0' }, { name: "Карта пам'яті", path: '/storage/1A2B-3C4D' }], writable: true, dirs, files: [['ubuntu.torrent', 64812], ['notes.txt', 1200]] };
  }

  const handlers = {
    init: () => ({ prefs, version: '1.0', debug: true, dark: matchMedia('(prefers-color-scheme: dark)').matches, storage: params.get('nostorage') !== '1', sdk: 34, defaultSave: '/storage/emulated/0/Download/Itorrent', publicDownloads: '/storage/emulated/0/Download/Itorrent', notifPerm: true }),
    poll: (a) => {
      step();
      const r = rows.find((x) => x.id === a.sel);
      let d = null;
      if (r) {
        d = { id: r.id, tab: a.tab };
        if (a.tab === 'general') d.general = general(r);
        if (a.tab === 'trackers') d.trackers = trackers(r);
        if (a.tab === 'peers') d.peers = PEERS;
        if (a.tab === 'http') d.http = r.id.startsWith('c3') ? ['https://webseed.example.org/bbb/'] : [];
        if (a.tab === 'content') d.content = r.meta ? content(r, a.fv) : { nometa: true };
      }
      const dl = rows.reduce((s, x) => s + x.dl, 0), ul = rows.reduce((s, x) => s + x.ul, 0);
      const out = {
        s: { dl, ul, dlS: 1.9 * GiB + t * dl, ulS: 260 * MiB + t * ul, dht: 287, conn: 'online', alt, dlLim: alt ? prefs.altDlLimit : prefs.dlLimit, ulLim: alt ? prefs.altUpLimit : prefs.upLimit, pause: params.get('pause') || '', free: 23.4 * GiB, port: 48213, ip: '93.170.44.12', storage: params.get('nostorage') !== '1', downloading: 2 },
        t: params.get('empty') === '1' ? [] : JSON.parse(JSON.stringify(rows)), d, cats, tags, logs: logs.filter((l) => l[0] > (a.logSince || 0)), rssV: rss.v, save: '/storage/emulated/0/Download/Itorrent', started: true,
      };
      return out;
    },
    'prefs.get': () => prefs,
    'prefs.set': (a) => { Object.assign(prefs, a.values); return prefs; },
    'ui.save': (a) => { prefs.ui = a.ui; },
    setBars: () => null,
    'add.file': () => { emit('preview', previewFor(false), 300); },
    'add.links': (a) => { const n = a.text.split('\n').filter((x) => x.trim()).length; if (a.dialog) emit('preview', previewFor(/^magnet/.test(a.text.trim())), 300); return n; },
    'add.confirm': (a) => { rows.push(T('new' + Date.now(), pending[a.pid] || 'Новий торент', 700 * MiB, 0, 'downloading', { dl: 2 * MiB })); return null; },
    'add.cancel': () => null,
    haptic: () => null,
    'clip.get': () => 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel',
    't.start': (a) => { for (const r of rows) if (a.ids.includes(r.id)) r.state = r.progress >= 1 ? 'stalledUP' : 'downloading'; },
    't.force': (a) => { for (const r of rows) if (a.ids.includes(r.id)) r.state = r.progress >= 1 ? 'forcedUP' : 'forcedDL'; },
    't.stop': (a) => { for (const r of rows) if (a.ids.includes(r.id)) { r.state = r.progress >= 1 ? 'stoppedUP' : 'stoppedDL'; r.dl = 0; r.ul = 0; } },
    't.remove': (a) => { rows = rows.filter((r) => !a.ids.includes(r.id)); },
    't.category': (a) => { for (const r of rows) if (a.ids.includes(r.id)) r.cat = a.cat; },
    't.tags': (a) => { for (const r of rows) if (a.ids.includes(r.id)) { if (a.clear) r.tags = []; for (const x of a.add || []) { if (!r.tags.includes(x)) r.tags.push(x); if (!tags.includes(x)) tags.push(x); } r.tags = r.tags.filter((x) => !(a.remove || []).includes(x)); } },
    't.rename': (a) => { const r = rows.find((x) => x.id === a.id); if (r) r.name = a.name; },
    't.seq': (a) => { for (const r of rows) if (a.ids.includes(r.id)) r.seq = a.on; },
    't.firstLast': (a) => { for (const r of rows) if (a.ids.includes(r.id)) r.fl = a.on; },
    't.limits': (a) => { for (const r of rows) if (a.ids.includes(r.id)) { if ('dl' in a) r.dlLim = a.dl; if ('ul' in a) r.ulLim = a.ul; } },
    't.magnet': (a) => a.ids.map((x) => 'magnet:?xt=urn:btih:' + x).join('\n'),
    'files.prio': (a) => { const p = prio[a.id] || (prio[a.id] = bbbFiles.map(() => 4)); for (const i of a.idx) p[i] = a.prio; },
    'cat.save': (a) => { if (a.old && a.old !== a.name) delete cats[a.old]; cats[a.name] = { savePath: a.savePath }; },
    'cat.remove': (a) => { delete cats[a.name]; },
    'tag.add': (a) => { if (!tags.includes(a.name)) tags.push(a.name); },
    'tag.remove': (a) => { tags = tags.filter((x) => x !== a.name); },
    'alt.toggle': () => (alt = !alt),
    'fs.list': (a) => fsList(a.path),
    'fs.mkdir': (a) => a.path,
    'rss.get': () => rss,
    'rss.test': (a) => rss.feeds[0].articles.filter((x) => x.title.toLowerCase().includes((a.rule.mustContain || '').split(' ')[0])).map((x) => x.title),
    'rss.rules': (a) => { rss.rules = a.rules; },
    'rss.markRead': (a) => { for (const f of rss.feeds) for (const x of f.articles) if ((!a.url || f.url === a.url) && (!a.id || x.id === a.id)) x.read = true; },
    'peers.add': (a) => a.peers.length,
    stats: () => ({ allDl: prefs.allTimeDl, allUl: prefs.allTimeUl, sesDl: 1.9 * GiB, sesUl: 260 * MiB, wasted: 3 * MiB, peers: 68, torrents: rows.length, dht: 287, free: 23.4 * GiB }),
  };
  let pidN = 0;
  function previewFor(magnet) {
    const pid = 'p' + (++pidN);
    pending[pid] = magnet ? 'Sintel' : 'Big Buck Bunny (2008)';
    if (magnet) {
      setTimeout(() => It.onEvent('preview.meta', Object.assign(previewFor(false), { pid, name: 'Sintel', id: '08ada5a7a6183aae1e09d831df6748d566095a10' })), 2500);
      return { pid, id: '08ada5a7a6183aae1e09d831df6748d566095a10', name: 'Sintel', exists: false, hasMeta: false, size: -1, trackers: 4, savePath: '/storage/emulated/0/Download/Itorrent' };
    }
    return { pid, id: 'c3d4e5f60718293a4b5c6d7e8f9012345678901f', name: 'Big Buck Bunny (2008)', exists: false, hasMeta: true, files: bbbFiles, nfiles: bbbFiles.length, size: 885 * MiB, pieces: 885, pieceLen: MiB, priv: false, v1: 'c3d4e5f60718293a4b5c6d7e8f9012345678901f', v2: '', comment: 'Blender Foundation — https://peach.blender.org', createdBy: 'qBittorrent v5.0.4', created: now - 400 * 86400e3, trackers: 3, savePath: '/storage/emulated/0/Download/Itorrent' };
  }

  window.Android = {
    call(method, args) {
      try {
        const f = handlers[method];
        const r = f ? f(JSON.parse(args || '{}')) : null;
        return JSON.stringify({ ok: true, r: r === undefined ? null : r });
      } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
      }
    },
  };
  window.__mock = { emit, rows: () => rows };
})();
