/* 20 complete colour themes. Admin picks one for everyone (and can give each role its own).
   Each theme sets every colour token the app uses, so the whole interface changes together. */
'use strict';
const Themes = (() => {
  // [id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper]
  const T = [
    ['ledger',    'Ledger',        'light', '#eef1f4', '#ffffff', '#f6f8fa', '#d9dfe6', '#1c2433', '#6b7685', '#1f5fbf', '#1c2433', '#c4cdd9', '#fffefa'],
    ['mint',      'Mint Counter',  'light', '#edf5f1', '#ffffff', '#f4faf7', '#d3e5dc', '#14302a', '#5f766d', '#0f7a5a', '#0f3d33', '#bfdcd2', '#fffffb'],
    ['saffron',   'Saffron',       'light', '#f7f1e8', '#fffdf9', '#fbf6ee', '#e8dccb', '#2e2216', '#7a6a58', '#c2410c', '#3b2414', '#e7cdb5', '#fffdf6'],
    ['lavender',  'Lavender',      'light', '#f2f0f8', '#ffffff', '#f7f6fb', '#ddd8ec', '#251f3a', '#6e6886', '#6d3fc0', '#2a2145', '#cfc6ea', '#fffefd'],
    ['rose',      'Rose Bazaar',   'light', '#f8eef1', '#ffffff', '#fbf4f6', '#ecd6dd', '#3a1b26', '#82606c', '#be185d', '#3d1626', '#efc5d3', '#fffdfb'],
    ['ocean',     'Ocean',         'light', '#ebf3f8', '#ffffff', '#f3f8fb', '#cfe0ea', '#132b3a', '#5c7584', '#0369a1', '#0c2b40', '#bcd8ea', '#fefefe'],
    ['sand',      'Sand & Ink',    'light', '#f3efe7', '#fffcf6', '#f8f4ec', '#e0d8c8', '#24211b', '#726b5d', '#8a5a00', '#24211b', '#d9cfbd', '#fffbf0'],
    ['slate',     'Slate Pro',     'light', '#eceff3', '#ffffff', '#f4f6f9', '#d5dbe3', '#111827', '#64748b', '#334155', '#0f172a', '#b8c2d1', '#ffffff'],
    ['forest',    'Forest',        'light', '#eef2ea', '#ffffff', '#f5f8f2', '#d6dfcd', '#1d2b17', '#66745d', '#3f6212', '#1f2e17', '#c7d7b6', '#fffff8'],
    ['paper',     'Paper White',   'light', '#f6f6f4', '#ffffff', '#fafaf8', '#e2e2dd', '#1f1f1d', '#73736d', '#2563eb', '#ffffff', '#45454a', '#ffffff'],
    ['coral',     'Coral',         'light', '#fbf0ec', '#ffffff', '#fdf6f3', '#f0d8cf', '#341c14', '#86675c', '#d9480f', '#3a1d14', '#f1c7b6', '#fffdfa'],
    ['teal',      'Teal Clean',    'light', '#ecf6f6', '#ffffff', '#f4fafa', '#cfe5e4', '#102f2e', '#5a7877', '#0f766e', '#0d3533', '#b3dcd8', '#fefffe'],
    ['midnight',  'Midnight',      'dark',  '#12161d', '#1a2029', '#212834', '#2f3845', '#e6eaf0', '#8b96a6', '#5b93e6', '#0d1015', '#a9b3c1', '#f4f1e8'],
    ['charcoal',  'Charcoal Gold', 'dark',  '#141414', '#1d1d1d', '#252525', '#353535', '#efeae0', '#9a9387', '#e0a526', '#0c0c0c', '#b9b2a4', '#f6f1e4'],
    ['deepsea',   'Deep Ocean',    'dark',  '#0b1622', '#112233', '#16293d', '#22394f', '#e2edf7', '#8aa1b6', '#38bdf8', '#07111b', '#9fb8cc', '#f2f6f8'],
    ['plum',      'Plum Night',    'dark',  '#17121f', '#211a2c', '#2a2137', '#3b2f4c', '#eee7f7', '#9f93b2', '#b48cf2', '#100c16', '#b8a9cc', '#f5f1f8'],
    ['emerald',   'Emerald Night', 'dark',  '#0e1815', '#15231f', '#1b2c27', '#28403a', '#e3f2ec', '#8aa59b', '#34d399', '#09110f', '#a4c3b8', '#f1f6f3'],
    ['graphite',  'Graphite Red',  'dark',  '#151515', '#1f1f20', '#28282a', '#38383b', '#eeeeee', '#9b9b9f', '#f05252', '#0e0e0f', '#b5b5ba', '#f4f2ef'],
    ['cyber',     'Cyber Teal',    'dark',  '#0b1416', '#11201f', '#162a29', '#21403d', '#dff7f3', '#86aaa5', '#2dd4bf', '#071012', '#9cc9c3', '#f0f7f6'],
    ['mocha',     'Mocha',         'dark',  '#1a1512', '#241d19', '#2d2520', '#40352e', '#f2e8df', '#a8988b', '#e08a4f', '#120e0c', '#c4b0a1', '#f7efe6']
  ];
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  const lum = h => { const [r, g, b] = hex(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };

  const list = T.map(([id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper]) => ({ id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper }));
  const get = id => list.find(t => t.id === id) || list[0];

  function tokens(t, accent) {
    const dark = t.mode === 'dark', p = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : t.primary;
    const sideLight = lum(t.side) > .5;
    return {
      '--bg': t.bg, '--surface': t.surface, '--surface-2': t.surface2, '--line': t.line, '--line-2': mix(t.line, t.surface, .45),
      '--ink': t.ink, '--ink-2': mix(t.ink, t.muted, .45), '--muted': t.muted,
      '--primary': p, '--primary-hover': dark ? mix(p, '#ffffff', .18) : mix(p, '#000000', .16), '--primary-soft': mix(p, t.surface, dark ? .78 : .88),
      '--primary-ink': lum(p) > .45 ? '#0b1220' : '#ffffff',
      '--side': t.side, '--side-ink': t.sideInk, '--side-hi': sideLight ? '#111111' : '#ffffff', '--side-on': sideLight ? mix(t.side, p, .12) : mix(t.side, '#ffffff', .1),
      '--side-line': sideLight ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)',
      '--paper': t.paper, '--paper-ink': '#1f1f1f', '--paper-rule': '#c9c4b8',
      '--green': dark ? '#4cc38a' : '#13795b', '--green-soft': dark ? mix('#4cc38a', t.surface, .8) : '#e3f3ec',
      '--red': dark ? '#ef6b62' : '#c2362f', '--red-soft': dark ? mix('#ef6b62', t.surface, .8) : '#fbe9e7',
      '--amber': dark ? '#e3ac4f' : '#95600a', '--amber-soft': dark ? mix('#e3ac4f', t.surface, .8) : '#fdf1d8',
      '--focus': `0 0 0 3px ${p}${dark ? '73' : '59'}`
    };
  }
  /* Applies a theme to the whole page. */
  function apply(id, accent) {
    const t = get(id);
    document.documentElement.dataset.theme = t.mode;
    let st = document.getElementById('themeStyle');
    if (!st) { st = document.createElement('style'); st.id = 'themeStyle'; document.head.append(st); }
    st.textContent = `:root,:root[data-theme]{${Object.entries(tokens(t, accent)).map(([k, v]) => `${k}:${v}`).join(';')};color-scheme:${t.mode}}`;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.side);
    try { localStorage.setItem('SHOPBILL_LAST_THEME', JSON.stringify([t.id, accent || ''])); } catch { /* ignore */ }
    return t;
  }
  /* Small preview card used in the theme pickers. */
  function swatch(t, accent) {
    const k = tokens(t, accent);
    return `<span class="theme-mini" style="background:${k['--bg']}"><i style="background:${k['--side']}"></i><b style="background:${k['--surface']};border-color:${k['--line']}"><em style="background:${k['--primary']}"></em><u style="background:${k['--ink']}"></u></b></span>`;
  }
  return { list, get, apply, swatch, tokens };
})();
