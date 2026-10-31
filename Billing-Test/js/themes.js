/* 40 complete colour themes. Only Admin picks them (for everyone, or one per role).
   Every theme sets every colour token the app uses, and each text / control colour is
   checked against the background it sits on and darkened or lightened until it reaches
   the WCAG contrast ratio (4.5:1 for text, 3:1 for controls and borders). */
'use strict';
const Themes = (() => {
  // [id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper]
  const T = [
    ['ledger',    'Ledger',        'light', '#eef1f4', '#ffffff', '#f6f8fa', '#d9dfe6', '#1c2433', '#5f6a79', '#1f5fbf', '#1c2433', '#c4cdd9', '#fffefa'],
    ['mint',      'Mint Counter',  'light', '#edf5f1', '#ffffff', '#f4faf7', '#d3e5dc', '#14302a', '#56695f', '#0f7a5a', '#0f3d33', '#bfdcd2', '#fffffb'],
    ['saffron',   'Saffron',       'light', '#f7f1e8', '#fffdf9', '#fbf6ee', '#e8dccb', '#2e2216', '#6c5d4c', '#b93d0b', '#3b2414', '#e7cdb5', '#fffdf6'],
    ['lavender',  'Lavender',      'light', '#f2f0f8', '#ffffff', '#f7f6fb', '#ddd8ec', '#251f3a', '#625c7a', '#6d3fc0', '#2a2145', '#cfc6ea', '#fffefd'],
    ['rose',      'Rose Bazaar',   'light', '#f8eef1', '#ffffff', '#fbf4f6', '#ecd6dd', '#3a1b26', '#765562', '#be185d', '#3d1626', '#efc5d3', '#fffdfb'],
    ['ocean',     'Ocean',         'light', '#ebf3f8', '#ffffff', '#f3f8fb', '#cfe0ea', '#132b3a', '#516a79', '#0369a1', '#0c2b40', '#bcd8ea', '#fefefe'],
    ['sand',      'Sand & Ink',    'light', '#f3efe7', '#fffcf6', '#f8f4ec', '#e0d8c8', '#24211b', '#665f52', '#8a5a00', '#24211b', '#d9cfbd', '#fffbf0'],
    ['slate',     'Slate Pro',     'light', '#eceff3', '#ffffff', '#f4f6f9', '#d5dbe3', '#111827', '#596579', '#334155', '#0f172a', '#b8c2d1', '#ffffff'],
    ['forest',    'Forest',        'light', '#eef2ea', '#ffffff', '#f5f8f2', '#d6dfcd', '#1d2b17', '#5b6853', '#3f6212', '#1f2e17', '#c7d7b6', '#fffff8'],
    ['paper',     'Paper White',   'light', '#f6f6f4', '#ffffff', '#fafaf8', '#e2e2dd', '#1f1f1d', '#666660', '#2563eb', '#ffffff', '#45454a', '#ffffff'],
    ['coral',     'Coral',         'light', '#fbf0ec', '#ffffff', '#fdf6f3', '#f0d8cf', '#341c14', '#795a4f', '#c2410c', '#3a1d14', '#f1c7b6', '#fffdfa'],
    ['teal',      'Teal Clean',    'light', '#ecf6f6', '#ffffff', '#f4fafa', '#cfe5e4', '#102f2e', '#506d6c', '#0f766e', '#0d3533', '#b3dcd8', '#fefffe'],
    ['sky',       'Sky Blue',      'light', '#eaf4fd', '#ffffff', '#f3f9fe', '#cde3f6', '#0f2740', '#4d6680', '#0b6bcb', '#0b63b8', '#d6e9fb', '#ffffff'],
    ['peach',     'Peach',         'light', '#fdf1ea', '#fffaf6', '#fef5ef', '#f3d9c9', '#3a2014', '#7a5a49', '#c2531a', '#fbe3d3', '#5c3420', '#fffaf5'],
    ['sage',      'Sage',          'light', '#eff3ee', '#fbfcfa', '#f4f7f3', '#d8e1d5', '#1f2a1d', '#5c6a58', '#4a7a3f', '#dfe8db', '#2c3a29', '#fdfdf9'],
    ['sunflower', 'Sunflower',     'light', '#fbf6e6', '#fffdf5', '#fdf9ec', '#ece0b8', '#2b2410', '#6e6341', '#8a6400', '#2b2410', '#f2dc8f', '#fffcef'],
    ['blush',     'Blush',         'light', '#fbf0f4', '#ffffff', '#fdf6f8', '#f1d7e1', '#35182a', '#7b5a6b', '#b0306f', '#f8dde8', '#4a2038', '#fffdfd'],
    ['arctic',    'Arctic',        'light', '#f1f5f9', '#ffffff', '#f8fafc', '#dbe3ec', '#0f172a', '#566377', '#0e7490', '#f8fafc', '#334155', '#ffffff'],
    ['olive',     'Olive Grove',   'light', '#f2f1e6', '#fdfcf6', '#f7f6ec', '#dedcc4', '#25261a', '#626350', '#5f6b16', '#33361f', '#d8dbb3', '#fefdf6'],
    ['terracotta','Terracotta',    'light', '#f6ede7', '#fffbf8', '#faf3ee', '#e7d4c6', '#33201a', '#755b4f', '#a4401f', '#5a2a1c', '#f0cdbd', '#fffaf6'],
    ['indigo',    'Indigo Day',    'light', '#eef0fb', '#ffffff', '#f5f6fd', '#d6daf3', '#161a3b', '#575d84', '#3f46c9', '#22277a', '#cfd3fb', '#fffffe'],
    ['aqua',      'Aqua',          'light', '#e8f7f7', '#ffffff', '#f2fbfb', '#c9e9e8', '#0b2b2c', '#4b6c6d', '#0a7a80', '#d4f0ef', '#123c3e', '#fdffff'],
    ['midnight',  'Midnight',      'dark',  '#12161d', '#1a2029', '#212834', '#2f3845', '#e6eaf0', '#9ba6b5', '#6aa1ee', '#0d1015', '#a9b3c1', '#f4f1e8'],
    ['charcoal',  'Charcoal Gold', 'dark',  '#141414', '#1d1d1d', '#252525', '#353535', '#efeae0', '#a8a194', '#e0a526', '#0c0c0c', '#b9b2a4', '#f6f1e4'],
    ['deepsea',   'Deep Ocean',    'dark',  '#0b1622', '#112233', '#16293d', '#22394f', '#e2edf7', '#98aec2', '#38bdf8', '#07111b', '#9fb8cc', '#f2f6f8'],
    ['plum',      'Plum Night',    'dark',  '#17121f', '#211a2c', '#2a2137', '#3b2f4c', '#eee7f7', '#ab9fbe', '#b48cf2', '#100c16', '#b8a9cc', '#f5f1f8'],
    ['emerald',   'Emerald Night', 'dark',  '#0e1815', '#15231f', '#1b2c27', '#28403a', '#e3f2ec', '#97b2a8', '#34d399', '#09110f', '#a4c3b8', '#f1f6f3'],
    ['graphite',  'Graphite Red',  'dark',  '#151515', '#1f1f20', '#28282a', '#38383b', '#eeeeee', '#a7a7ab', '#f26b6b', '#0e0e0f', '#b5b5ba', '#f4f2ef'],
    ['cyber',     'Cyber Teal',    'dark',  '#0b1416', '#11201f', '#162a29', '#21403d', '#dff7f3', '#93b7b2', '#2dd4bf', '#071012', '#9cc9c3', '#f0f7f6'],
    ['mocha',     'Mocha',         'dark',  '#1a1512', '#241d19', '#2d2520', '#40352e', '#f2e8df', '#b4a497', '#e8955c', '#120e0c', '#c4b0a1', '#f7efe6'],
    ['obsidian',  'Obsidian',      'dark',  '#0f0f14', '#18181f', '#1f1f28', '#2e2e3a', '#ececf3', '#a0a0b2', '#8b8cf8', '#0a0a0e', '#b0b0c4', '#f3f3f6'],
    ['navygold',  'Navy & Gold',   'dark',  '#0c1424', '#131d33', '#18243f', '#263556', '#e8edf7', '#9eabc4', '#f2c14e', '#08101e', '#b4c0d8', '#f6f2e6'],
    ['crimson',   'Crimson Night', 'dark',  '#170d10', '#221418', '#2b1a1f', '#3f262d', '#f5e9ec', '#b8a0a7', '#ff6b81', '#100709', '#cbb0b7', '#f8f0f1'],
    ['moss',      'Moss',          'dark',  '#11150e', '#191f15', '#20271b', '#313b29', '#e9efe2', '#a3ae98', '#a3d65c', '#0b0e09', '#b5c2a8', '#f4f6ef'],
    ['sunset',    'Sunset',        'dark',  '#1b1210', '#251916', '#2f201c', '#45302a', '#f7ebe6', '#bba59c', '#ff8a4c', '#130c0a', '#d2b6aa', '#f9f0eb'],
    ['ink',       'Pure Black',    'dark',  '#000000', '#0b0b0b', '#141414', '#262626', '#f5f5f5', '#a3a3a3', '#4da3ff', '#000000', '#bdbdbd', '#f5f5f5'],
    ['royal',     'Royal Night',   'dark',  '#130f24', '#1b1633', '#221c3f', '#342b5a', '#ece8fb', '#a49dc4', '#e879f9', '#0d0a19', '#bcb3e0', '#f5f2fb'],
    ['copper',    'Copper',        'dark',  '#16110d', '#201913', '#291f18', '#3d2f24', '#f3e9e0', '#b3a291', '#d9925a', '#0f0b08', '#c9b4a1', '#f7efe7'],
    ['sapphire',  'Sapphire',      'dark',  '#08111f', '#0e1a2e', '#13223b', '#1f3354', '#e6eefb', '#9aaccb', '#5b9dff', '#050b15', '#a9bddc', '#f1f5fb'],
    ['contrast',  'High Contrast', 'dark',  '#000000', '#000000', '#0d0d0d', '#8a8a8a', '#ffffff', '#e0e0e0', '#ffd400', '#000000', '#ffffff', '#ffffff']
  ];
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  const lum = h => { const [r, g, b] = hex(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  /* Moves fg toward black or white (away from the backgrounds) until it reaches the ratio on every one of them. */
  function ensure(fg, bgs, min) {
    bgs = [].concat(bgs);
    const ok = c => bgs.every(b => ratio(c, b) >= min);
    if (ok(fg)) return fg;
    const avg = bgs.reduce((s, b) => s + lum(b), 0) / bgs.length;
    const towards = avg > .18 ? '#000000' : '#ffffff';
    for (let t = .04; t <= 1.0001; t += .04) { const c = mix(fg, towards, t); if (ok(c)) return c; }
    return towards;
  }

  const list = T.map(([id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper]) => ({ id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper }));
  const get = id => list.find(t => t.id === id) || list[0];

  function tokens(t, accent) {
    const dark = t.mode === 'dark', S = [t.surface, t.surface2, t.bg];
    let p = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : t.primary;
    p = ensure(p, S, 4.5);                                   // primary is also used as link / tab text
    const soft = mix(p, t.surface, dark ? .8 : .9);
    p = ensure(p, [...S, soft], 4.5);
    const pInk = ratio('#ffffff', p) >= ratio('#0b1220', p) ? '#ffffff' : '#0b1220';
    const sideLight = lum(t.side) > .4;
    const sideOn = sideLight ? mix(t.side, p, .14) : mix(t.side, '#ffffff', .1);
    const status = (light, darkc, lightSoft) => {
      const base = dark ? darkc : light, sft = dark ? mix(darkc, t.surface, .82) : lightSoft;
      return [ensure(base, [...S, sft], 4.5), sft];
    };
    const [green, greenSoft] = status('#13795b', '#4cc38a', '#e3f3ec');
    const [red, redSoft] = status('#c2362f', '#ef6b62', '#fbe9e7');
    const [amber, amberSoft] = status('#8f5c08', '#e3ac4f', '#fdf1d8');
    const [orange, orangeSoft] = status('#b84a00', '#ff9a4d', '#ffedd9');
    const ink = ensure(t.ink, S, 7), muted = ensure(t.muted, [...S, soft], 4.6);
    return {
      '--bg': t.bg, '--surface': t.surface, '--surface-2': t.surface2, '--line': t.line, '--line-2': mix(t.line, t.surface, .45),
      '--line-strong': ensure(mix(t.line, ink, .25), [t.surface, t.surface2, t.bg], 3.15),   // input borders, switch tracks: 3:1
      '--ink': ink, '--ink-2': ensure(mix(ink, muted, .45), S, 4.5), '--muted': muted,
      '--primary': p, '--primary-hover': dark ? mix(p, '#ffffff', .16) : mix(p, '#000000', .16), '--primary-soft': soft,
      '--primary-ink': pInk,
      '--side': t.side, '--side-ink': ensure(t.sideInk, [t.side, sideOn], 4.5), '--side-hi': sideLight ? '#111111' : '#ffffff', '--side-on': sideOn,
      '--side-muted': ensure(mix(t.sideInk, t.side, .25), [t.side, sideOn], 4.5),
      '--side-line': sideLight ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.1)',
      '--paper': t.paper, '--paper-ink': '#1f1f1f', '--paper-rule': '#c9c4b8',
      '--green': green, '--green-soft': greenSoft, '--red': red, '--red-soft': redSoft,
      '--amber': amber, '--amber-soft': amberSoft, '--orange': orange, '--orange-soft': orangeSoft,
      '--on-red': ratio('#ffffff', red) >= ratio('#111111', red) ? '#ffffff' : '#111111',
      '--on-amber': ratio('#ffffff', amber) >= ratio('#111111', amber) ? '#ffffff' : '#111111',
      '--side-gold': ensure(sideLight ? '#8a5a00' : '#f3c969', [t.side, sideOn], 3),
      '--scrim': dark ? 'rgba(0,0,0,.62)' : 'rgba(15,23,42,.45)',
      '--focus': `0 0 0 3px ${p}${dark ? '8c' : '66'}`
    };
  }
  const css = (t, accent) => `html:root,html:root[data-theme]{${Object.entries(tokens(t, accent)).map(([k, v]) => `${k}:${v}`).join(';')};color-scheme:${t.mode}}`;
  /* Applies a theme to the whole page, and remembers the finished CSS so the next start paints it before anything else (no flash). */
  function apply(id, accent) {
    const t = get(id), text = css(t, accent);
    document.documentElement.dataset.theme = t.mode;
    let st = document.getElementById('themeStyle');
    if (!st) { st = document.createElement('style'); st.id = 'themeStyle'; document.head.append(st); }
    if (st.textContent !== text) st.textContent = text;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.side);
    try { localStorage.setItem('SHOPBILL_LAST_THEME', JSON.stringify([t.id, accent || ''])); localStorage.setItem('SHOPBILL_THEME_CSS', JSON.stringify([t.mode, text, t.side])); } catch { /* ignore */ }
    return t;
  }
  /* Small preview card used in the theme gallery. */
  function swatch(t, accent) {
    const k = tokens(t, accent);
    return `<span class="theme-mini" style="background:${k['--bg']}"><i style="background:${k['--side']}"><s style="background:${k['--side-ink']}"></s><s style="background:${k['--side-ink']}"></s></i><b style="background:${k['--surface']};border-color:${k['--line']}"><em style="background:${k['--primary']}"></em><u style="background:${k['--ink']}"></u><u style="background:${k['--muted']}"></u></b></span>`;
  }
  return { list, get, apply, swatch, tokens, ratio, ensure };
})();
