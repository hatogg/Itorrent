// Набір іконок у дусі пласких кольорових іконок настільних торент-клієнтів (власне малювання).
(function () {
  const S = (body, extra) => '<svg viewBox="0 0 24 24" ' + (extra || '') + '>' + body + '</svg>';
  const L = (d, w) => S('<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (w || 1.8) + '" stroke-linecap="round" stroke-linejoin="round"/>');
  const plus = (c) => '<circle cx="17.6" cy="17.6" r="5.6" fill="' + (c || '#2da44e') + '"/><path d="M17.6 14.6v6M14.6 17.6h6" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>';
  const doc = '<path d="M5.5 2.5h8.2l4.8 4.8v13.7a.6.6 0 0 1-.6.6H5.5a.6.6 0 0 1-.6-.6V3.1a.6.6 0 0 1 .6-.6z" style="fill:var(--panel)" stroke="#6e7781" stroke-width="1.2"/><path d="M13.6 2.6v4.8h4.8" fill="none" stroke="#6e7781" stroke-width="1.2"/>';
  const arrowDown = (c, hollow) => hollow
    ? '<path d="M9.6 3.8h4.8v7.7h3.8L12 18.2l-6.2-6.7h3.8z" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linejoin="round"/>'
    : '<path d="M9.6 3.8h4.8v7.7h3.8L12 18.2l-6.2-6.7h3.8z" fill="' + c + '"/><rect x="5" y="19.6" width="14" height="1.9" rx=".9" fill="' + c + '" opacity=".55"/>';
  const arrowUp = (c, hollow) => hollow
    ? '<path d="M9.6 20.2h4.8v-7.7h3.8L12 5.8l-6.2 6.7h3.8z" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linejoin="round"/>'
    : '<path d="M9.6 20.2h4.8v-7.7h3.8L12 5.8l-6.2 6.7h3.8z" fill="' + c + '"/><rect x="5" y="2.5" width="14" height="1.9" rx=".9" fill="' + c + '" opacity=".55"/>';
  const v = (n) => 'var(--' + n + ')';

  const I = {
    menu: L('M4 6.5h16M4 12h16M4 17.5h16', 2),
    filters: S('<path d="M3.5 5h17l-6.6 7.6v5.6l-3.8 2.1v-7.7z" style="fill:var(--btn-hover)" stroke="#57606a" stroke-width="1.5" stroke-linejoin="round"/>'),
    addFile: S(doc + plus()),
    addLink: S('<path d="M8.6 14.9l5.9-5.9" stroke="#0969da" stroke-width="2" stroke-linecap="round"/><path d="M10.6 6.6l1.6-1.6a4 4 0 0 1 5.7 5.7l-1.6 1.6M12.6 16.6L11 18.2a4 4 0 0 1-5.7-5.7l1.6-1.6" fill="none" stroke="#0969da" stroke-width="2" stroke-linecap="round"/>' + plus()),
    remove: S('<circle cx="12" cy="12" r="9" fill="#cf222e"/><path d="M7.4 12h9.2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'),
    start: S('<path d="M7.2 4.6v14.8L19.6 12z" fill="#2da44e" stroke="#1a7f37" stroke-width="1.2" stroke-linejoin="round"/>'),
    stop: S('<rect x="5.6" y="5.6" width="12.8" height="12.8" rx="1.6" style="fill:var(--s-stop)"/>'),
    force: S('<path d="M3.6 5.2v13.6L12 12zM12 5.2v13.6L20.4 12z" fill="#2da44e" stroke="#1a7f37" stroke-width="1.1" stroke-linejoin="round"/>'),
    gear: S('<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.3 2.8h3.4l.5 2.4 1.7.9 2.3-.9 1.7 2.9-1.8 1.6v2l1.8 1.6-1.7 2.9-2.3-.9-1.7.9-.5 2.4h-3.4l-.5-2.4-1.7-.9-2.3.9-1.7-2.9 1.8-1.6v-2L4.1 8.1l1.7-2.9 2.3.9 1.7-.9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
    search: L('M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3L20.5 20.5', 2),
    more: S('<circle cx="12" cy="5.5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="18.5" r="1.9" fill="currentColor"/>'),
    close: L('M6 6l12 12M18 6L6 18', 1.8),
    back: L('M15 5l-7 7 7 7', 2),
    up: L('M12 19V5M6 11l6-6 6 6', 2),
    chevR: L('M9 5l7 7-7 7', 2.2),
    chevD: L('M5 9l7 7 7-7', 2.2),
    check: L('M5 12.5l4.5 4.5L19 7.5', 2.2),
    plus: L('M12 5v14M5 12h14', 2),
    minus: L('M5 12h14', 2),
    edit: L('M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', 1.7),
    copy: L('M8.5 8.5h10.5v12H8.5zM5 15.5V3.5h10.5', 1.7),
    link: L('M10 14l4-4M9.5 6.5L11 5a3.9 3.9 0 0 1 5.5 5.5L15 12M14.5 17.5L13 19a3.9 3.9 0 0 1-5.5-5.5L9 12', 1.8),
    magnet: S('<path d="M5 4.5h4.4v7.6a2.6 2.6 0 0 0 5.2 0V4.5H19v7.6a7 7 0 0 1-14 0z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M5 8.4h4.4M14.6 8.4H19" stroke="currentColor" stroke-width="1.7"/>'),
    refresh: L('M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2', 1.9),
    folder: S('<path d="M2.8 6.2a1.2 1.2 0 0 1 1.2-1.2h5.2l2 2.2h8.8a1.2 1.2 0 0 1 1.2 1.2v10.4a1.2 1.2 0 0 1-1.2 1.2H4a1.2 1.2 0 0 1-1.2-1.2z" style="fill:var(--folder)"/><path d="M2.8 9.2h18.4v9.6a1.2 1.2 0 0 1-1.2 1.2H4a1.2 1.2 0 0 1-1.2-1.2z" style="fill:var(--folder);filter:brightness(1.12)"/>'),
    folderUp: S('<path d="M2.8 6.2a1.2 1.2 0 0 1 1.2-1.2h5.2l2 2.2h8.8a1.2 1.2 0 0 1 1.2 1.2v10.4a1.2 1.2 0 0 1-1.2 1.2H4a1.2 1.2 0 0 1-1.2-1.2z" style="fill:var(--folder)"/><path d="M12 17v-6.5M9 13l3-3 3 3" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'),
    file: S('<path d="M6 2.8h7.6l4.6 4.6v13a.8.8 0 0 1-.8.8H6a.8.8 0 0 1-.8-.8V3.6a.8.8 0 0 1 .8-.8z" style="fill:var(--panel)" stroke="#8c959f" stroke-width="1.3"/><path d="M13.6 2.9v4.6h4.6" fill="none" stroke="#8c959f" stroke-width="1.3"/>'),
    fileMedia: S('<path d="M6 2.8h7.6l4.6 4.6v13a.8.8 0 0 1-.8.8H6a.8.8 0 0 1-.8-.8V3.6a.8.8 0 0 1 .8-.8z" style="fill:var(--panel)" stroke="#8c959f" stroke-width="1.3"/><path d="M10 11v6.5l5.2-3.25z" fill="#8250df"/>'),
    download: L('M12 4v11M7 10.5l5 5 5-5M5 19.5h14', 2),
    share: L('M7 13.5v6h10v-6M12 4v11M8 8l4-4 4 4', 1.8),
    play: S('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
    stats: L('M4.5 20V10M9.5 20V4M14.5 20v-7M19.5 20V8M3 20.5h18', 1.9),
    info: S('<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 10.8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.25" fill="currentColor"/>'),
    power: L('M12 3.5v8M7.2 6.3a7.5 7.5 0 1 0 9.6 0', 2),
    create: S(doc + '<path d="M17.4 12.2l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1z" fill="#bf8700"/>'),
    tag: S('<path d="M3.5 4.8v6.1l9.4 9.4a1 1 0 0 0 1.4 0l6-6a1 1 0 0 0 0-1.4L10.9 3.5H4.8a1.3 1.3 0 0 0-1.3 1.3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/>'),
    globe: S('<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.6 12h16.8M12 3.4c2.4 2.4 3.5 5.3 3.5 8.6s-1.1 6.2-3.5 8.6c-2.4-2.4-3.5-5.3-3.5-8.6S9.6 5.8 12 3.4z" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
    server: S('<rect x="4" y="4" width="16" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="13.5" width="16" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7.6" cy="7.25" r="1.1" fill="currentColor"/><circle cx="7.6" cy="16.75" r="1.1" fill="currentColor"/>'),
    antenna: S('<path d="M12 11.2V21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="9.5" r="1.9" fill="currentColor"/><path d="M8.2 13.4a5.3 5.3 0 0 1 0-7.8M15.8 5.6a5.3 5.3 0 0 1 0 7.8M5.4 16.2a9.3 9.3 0 0 1 0-13.4M18.6 2.8a9.3 9.3 0 0 1 0 13.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    peers: S('<circle cx="9" cy="8.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M2.8 19.6c.5-3.4 3-5.4 6.2-5.4s5.7 2 6.2 5.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M15.6 5.2a3.1 3.1 0 0 1 0 6M17.4 14.4c2 .6 3.4 2.4 3.8 5.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    content: S('<path d="M3 6.2A1.2 1.2 0 0 1 4.2 5h4.9l2 2.2h8.7A1.2 1.2 0 0 1 21 8.4v10.4a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 18.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    speed: L('M3.5 19.5h17M4.5 16l4.2-5.4 3.6 3 4-6.1 3.4 3.6', 1.8),
    rss: S('<rect x="3" y="3" width="18" height="18" rx="3.5" fill="#f06a1d"/><circle cx="7.8" cy="16.2" r="1.7" fill="#fff"/><path d="M6.4 11.2a6.4 6.4 0 0 1 6.4 6.4M6.4 6.9a10.7 10.7 0 0 1 10.7 10.7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'),
    rssMono: L('M5.5 18.5h.01M5.5 11.5a7 7 0 0 1 7 7M5.5 5a13.5 13.5 0 0 1 13.5 13.5', 2.1),
    log: L('M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01', 2),
    transfers: S('<path d="M7.5 3.8v13.4M3.8 13.5l3.7 3.7 3.7-3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 20.2V6.8M12.8 10.5l3.7-3.7 3.7 3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    hdd: S('<rect x="3.2" y="6" width="17.6" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.4 13.4h17.2" stroke="currentColor" stroke-width="1.4"/><circle cx="17" cy="15.8" r="1" fill="currentColor"/>'),
    dht: S('<circle cx="12" cy="5" r="2.2" fill="currentColor"/><circle cx="5" cy="17.5" r="2.2" fill="currentColor"/><circle cx="19" cy="17.5" r="2.2" fill="currentColor"/><path d="M12 5L5 17.5h14z" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
    turtle: S('<path d="M4.5 15.2c0-4 3.4-7.2 7.5-7.2s7.5 3.2 7.5 7.2z" style="fill:var(--tc,none)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M19.4 13.8h1.6a1.6 1.6 0 0 0 0-3.2h-.4M6.6 15.2v2.6M17.4 15.2v2.6M3 15.2h18M9.5 8.6l2.5 6.6 2.5-6.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    connOn: S('<circle cx="12" cy="12" r="8.8" fill="#2da44e"/><path d="M3.6 12h16.8M12 3.4c2.4 2.4 3.4 5.3 3.4 8.6s-1 6.2-3.4 8.6c-2.4-2.4-3.4-5.3-3.4-8.6S9.6 5.8 12 3.4z" fill="none" stroke="#fff" stroke-width="1.3"/>'),
    connFw: S('<circle cx="12" cy="12" r="8.8" fill="#d4a72c"/><path d="M12 7v6.2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="#fff"/>'),
    connOff: S('<circle cx="12" cy="12" r="8.8" fill="#cf222e"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
    dl: S(arrowDown(v('s-dl'))),
    ul: S(arrowUp(v('s-up'))),
    pause: S('<circle cx="12" cy="12" r="8.8" fill="#bf8700"/><path d="M9.6 8v8M14.4 8v8" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/>'),
    warn: S('<path d="M12 3.2L2.6 19.6h18.8z" fill="#d4a72c" stroke="#9a6700" stroke-width="1" stroke-linejoin="round"/><path d="M12 9v5.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.25" fill="#fff"/>'),
    error: S('<circle cx="12" cy="12" r="8.8" style="fill:var(--s-err)"/><path d="M12 7v6.2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="#fff"/>'),
    question: S('<circle cx="12" cy="12" r="8.8" fill="#0969da"/><path d="M9.4 9.4a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.3 1-1.3 2v.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.2" fill="#fff"/>'),
    location: S('<path d="M2.8 6.2a1.2 1.2 0 0 1 1.2-1.2h5.2l2 2.2h8.8a1.2 1.2 0 0 1 1.2 1.2v10.4a1.2 1.2 0 0 1-1.2 1.2H4a1.2 1.2 0 0 1-1.2-1.2z" style="fill:var(--folder)"/><path d="M8 13.6h7.4M12.6 10.8l2.8 2.8-2.8 2.8" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'),
    rename: L('M4 19.5h16M7 15.5l8.7-8.7 2.5 2.5-8.7 8.7H7z', 1.7),
    seq: L('M5 6h9M5 12h9M5 18h9M18 5v14M15.5 16.5L18 19l2.5-2.5', 1.8),
    firstLast: S('<rect x="3" y="8" width="18" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3.8" y="8.8" width="4" height="6.4" fill="currentColor"/><rect x="16.2" y="8.8" width="4" height="6.4" fill="currentColor"/>'),
    export: L('M14 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8zM14 3.5V8h4.5M12 17.5v-6M9.5 14L12 11.5 14.5 14', 1.6),
    recheck: L('M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3M17.5 3v4h-4M6.5 21v-4h4', 1.8),
    announce: S('<path d="M4 9.6v4.8h3.4L13 18.6V5.4L7.4 9.6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16.2 9a4 4 0 0 1 0 6M18.6 6.6a7.4 7.4 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    queue: L('M5 6h10M5 12h10M5 18h6M18.5 20V9.5M15.5 12.5l3-3 3 3', 1.8),
    qtop: L('M5 4.5h14M12 20V8.5M7 13.5l5-5 5 5', 1.9),
    qup: L('M12 19V6M6.5 11.5L12 6l5.5 5.5', 1.9),
    qdown: L('M12 5v13M6.5 12.5L12 18l5.5-5.5', 1.9),
    qbottom: L('M5 19.5h14M12 4v11.5M7 10.5l5 5 5-5', 1.9),
    limitDl: S(arrowDown(v('s-dl')) + ''),
    limitUl: S(arrowUp(v('s-up')) + ''),
    ratio: L('M12 4v16M6 20h12M4 8h16M6.5 8L3.5 14a3 3 0 0 0 6 0zM17.5 8l-3 6a3 3 0 0 0 6 0z', 1.5),
    superSeed: L('M12 3.5c3 2.2 4.6 5.2 4.6 9l-2 3h-5.2l-2-3c0-3.8 1.6-6.8 4.6-9zM9.4 15.5L7 19.5h3M14.6 15.5L17 19.5h-3M12 9.5h.01', 1.6),
    select: S('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 12.2l3 3 6-6.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    category: S('<path d="M2.8 6.2a1.2 1.2 0 0 1 1.2-1.2h5.2l2 2.2h8.8a1.2 1.2 0 0 1 1.2 1.2v10.4a1.2 1.2 0 0 1-1.2 1.2H4a1.2 1.2 0 0 1-1.2-1.2z" style="fill:var(--folder)"/>'),
    open: L('M14 4.5h5.5V10M19.5 4.5l-8 8M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10', 1.7),
    eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
    trash: L('M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6', 1.6),
    key: L('M14.5 9.5a4.5 4.5 0 1 1-1.3-3.2M13.2 12.8l7.3 7.2M17.5 17l2-2M15.5 15l2-2', 1.7),
    phone: S('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 18h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    battery: S('<rect x="3" y="7" width="16" height="10" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="5" y="9" width="8" height="6" fill="currentColor"/><path d="M20.6 10.5v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    monitor: S('<rect x="3" y="4" width="18" height="12.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 20h7M12 16.5V20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    network: S('<rect x="9" y="3" width="6" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="2.8" y="16" width="6" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="15.2" y="16" width="6" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v4M5.8 16v-4h12.4v4" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
    bolt: S('<path d="M13.2 2.8L5.4 13.4h5.8l-1.2 7.8 7.8-10.6H12z" fill="#bf8700"/>'),
    moon: S('<path d="M15.8 15.6A7.5 7.5 0 0 1 9 4.4a7.6 7.6 0 1 0 10.6 10.4 7.4 7.4 0 0 1-3.8.8z" fill="#8c959f"/>'),
    list: S('<path d="M8 6.5h12M8 12h12M8 17.5h12" stroke="#57606a" stroke-width="2" stroke-linecap="round"/><circle cx="4.2" cy="6.5" r="1.4" fill="#57606a"/><circle cx="4.2" cy="12" r="1.4" fill="#57606a"/><circle cx="4.2" cy="17.5" r="1.4" fill="#57606a"/>'),
    hourglass: S('<path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5" fill="none" stroke="#8c959f" stroke-width="1.7" stroke-linecap="round"/><path d="M9.2 18.6c.8-1.6 2.8-2.4 2.8-3.8 0 1.4 2 2.2 2.8 3.8z" fill="#bf8700"/>'),
    untagged: S('<path d="M3.5 4.8v6.1l9.4 9.4a1 1 0 0 0 1.4 0l6-6a1 1 0 0 0 0-1.4L10.9 3.5H4.8a1.3 1.3 0 0 0-1.3 1.3z" fill="none" stroke="#8c959f" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray="2.2 2"/>'),
    trackerless: S('<circle cx="12" cy="12" r="8.6" fill="none" stroke="#8c959f" stroke-width="1.6"/><path d="M5.8 5.8l12.4 12.4" stroke="#8c959f" stroke-width="1.7"/>'),
    trackerHost: S('<circle cx="12" cy="12" r="8.6" fill="none" stroke="#0969da" stroke-width="1.6"/><path d="M3.6 12h16.8M12 3.4c2.4 2.4 3.5 5.3 3.5 8.6s-1.1 6.2-3.5 8.6c-2.4-2.4-3.5-5.3-3.5-8.6S9.6 5.8 12 3.4z" fill="none" stroke="#0969da" stroke-width="1.3"/>'),
  };

  // Іконки станів торента
  I.st = {
    downloading: S(arrowDown(v('s-dl'))),
    forcedDL: S(arrowDown(v('s-dl'))),
    stalledDL: S(arrowDown(v('s-dl-stall'), true)),
    metaDL: S('<circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="var(--s-dl)" stroke-width="2"/><path d="M15 15l5 5" stroke="var(--s-dl)" stroke-width="2.4" stroke-linecap="round"/>'),
    forcedMetaDL: null,
    uploading: S(arrowUp(v('s-up'))),
    forcedUP: S(arrowUp(v('s-up'))),
    stalledUP: S(arrowUp(v('s-up-stall'), true)),
    queuedDL: S('<circle cx="12" cy="12" r="8.6" fill="none" stroke="var(--s-queue)" stroke-width="1.9"/><path d="M12 7v5.4l3.4 2.2" fill="none" stroke="var(--s-queue)" stroke-width="1.9" stroke-linecap="round"/>'),
    queuedUP: null,
    checkingDL: S('<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3M17.5 3v4h-4M6.5 21v-4h4" fill="none" stroke="var(--s-check)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    checkingUP: null, checkingResumeData: null,
    stoppedDL: S('<rect x="6" y="6" width="12" height="12" rx="1.5" fill="var(--s-stop)"/>'),
    stoppedUP: S('<circle cx="12" cy="12" r="8.8" fill="var(--s-done)"/><path d="M7.8 12.3l2.8 2.8 5.6-5.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    moving: S('<path d="M3.5 12h13M12.5 6.5L18 12l-5.5 5.5" fill="none" stroke="var(--s-dl)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    error: I.error,
  };
  I.st.forcedMetaDL = I.st.metaDL;
  I.st.queuedUP = I.st.queuedDL;
  I.st.checkingUP = I.st.checkingDL;
  I.st.checkingResumeData = I.st.checkingDL;

  // Іконки фільтрів бічної панелі
  I.flt = {
    all: I.list,
    downloading: S(arrowDown('#1a7f37')),
    seeding: S(arrowUp('#0969da')),
    completed: S('<circle cx="12" cy="12" r="8.8" fill="#8250df"/><path d="M7.8 12.3l2.8 2.8 5.6-5.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    running: S('<path d="M7.2 4.6v14.8L19.6 12z" fill="#2da44e"/>'),
    stopped: S('<rect x="5.6" y="5.6" width="12.8" height="12.8" rx="1.6" fill="#6e7781"/>'),
    active: I.bolt,
    inactive: I.moon,
    stalled: I.hourglass,
    stalledUploading: S(arrowUp('#0550ae', true)),
    stalledDownloading: S(arrowDown('#1f883d', true)),
    checking: I.st.checkingDL,
    moving: I.st.moving,
    errored: I.error,
  };

  // var(...) у атрибутах SVG надійніше задавати через style
  const fix = (x) => typeof x === 'string' ? x.replace(/(fill|stroke)="(var\([^)]*\))"/g, 'style="$1:$2"') : x;
  for (const k of Object.keys(I)) if (typeof I[k] === 'string') I[k] = fix(I[k]);
  for (const g of [I.st, I.flt]) for (const k of Object.keys(g)) g[k] = fix(g[k]);

  window.I = I;
})();
