#!/usr/bin/env node
/* Builds the fast-loading files from the readable sources:
     billing-suite/index.src.html  →  billing-suite/index.html  + app.v19.js + app.v19.css
     index.src.html                →  index.html                + menu.v19.js
   Run after editing any source file:  node tools/build-v19.js WEBSITE
   Uses esbuild to shrink the files when it is installed (npm i -g esbuild, or set ESBUILD=/path/to/esbuild);
   without it the files are joined but not shrunk. Owner-edited config.js files are never bundled. */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const site = path.resolve(process.argv[2] || 'WEBSITE');
const VERSION = process.env.BUNDLE_VERSION || '19';
const esbuild = [process.env.ESBUILD, '/opt/npm-tools/node_modules/esbuild/bin/esbuild', 'esbuild'].find(p => { if (!p) return false; try { execFileSync(p, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } });

function minify(code, loader) {
  if (!esbuild) return code;
  return execFileSync(esbuild, ['--minify', '--loader=' + loader, '--target=es2020', '--legal-comments=none', '--charset=utf8'], { input: code, maxBuffer: 64 << 20 }).toString();
}
const strip = src => src.replace(/\?.*$/, '');
function joinScripts(dir, srcs) {
  // Every source file is strict already, so one strict file behaves the same as the separate files.
  return "'use strict';\n" + srcs.map(s => `/* ${s} */\n;` + fs.readFileSync(path.join(dir, strip(s)), 'utf8').replace(/^﻿/, '') + '\n').join('');
}
function joinCss(dir, hrefs) {
  return hrefs.map(h => {
    const file = path.join(dir, strip(h)), base = path.dirname(strip(h));
    // Rewrite relative url(...) so they still work from the bundle's folder.
    return fs.readFileSync(file, 'utf8').replace(/url\((['"]?)(?!data:|https?:|\/|#)([^'")]+)\1\)/g, (m, q, u) => `url(${q}${path.posix.join(base, u)}${q})`);
  }).join('\n');
}

/* ---------- staff workspace ---------- */
{
  const dir = path.join(site, 'billing-suite'), srcFile = path.join(dir, 'index.src.html');
  const html = fs.readFileSync(srcFile, 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => s !== '../config.js');
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
  fs.writeFileSync(path.join(dir, `app.v${VERSION}.js`), minify(joinScripts(dir, scripts), 'js'));
  fs.writeFileSync(path.join(dir, `app.v${VERSION}.css`), minify(joinCss(dir, css), 'css'));
  let out = html;
  let first = true;
  out = out.replace(/\s*<script src="([^"]+)"><\/script>/g, (m, s) => { if (s === '../config.js') return m; if (first) { first = false; return `\n  <script src="app.v${VERSION}.js?v=${VERSION}"></script>`; } return ''; });
  let firstCss = true;
  out = out.replace(/\s*<link rel="stylesheet" href="([^"]+)">/g, () => { if (firstCss) { firstCss = false; return `\n  <link rel="stylesheet" href="app.v${VERSION}.css?v=${VERSION}">`; } return ''; });
  // The persist flag must run before the bundle: move it above.
  out = out.replace(/\n\s*<script>window\.RESTAURANT_STAFF_PERSIST = true;<\/script>/, '');
  out = out.replace(`<script src="app.v${VERSION}.js?v=${VERSION}"></script>`, `<script>window.RESTAURANT_STAFF_PERSIST = true;</script>\n  <script src="app.v${VERSION}.js?v=${VERSION}"></script>`);
  out = out.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Built by tools/build-v19.js from index.src.html. Edit the source files, then run the build again. -->');
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  console.log('staff:', scripts.length, 'scripts,', css.length, 'stylesheets →', fs.statSync(path.join(dir, `app.v${VERSION}.js`)).size, 'bytes JS');
}

/* ---------- customer menu ---------- */
{
  const dir = site, srcFile = path.join(dir, 'index.src.html');
  const html = fs.readFileSync(srcFile, 'utf8');
  const KEEP = new Set(['config.js', 'theme-engine.js', 'pwa-install.js', 'nav-drawer.js']);
  const tags = [...html.matchAll(/<script src="([^"]+)"( defer)?><\/script>/g)].filter(m => !m[2] && !KEEP.has(strip(m[1])));
  const scripts = tags.map(m => m[1]);
  fs.writeFileSync(path.join(dir, `menu.v${VERSION}.js`), minify(joinScripts(dir, scripts), 'js'));
  let first = true, out = html;
  for (const m of tags) { out = out.replace(m[0], first ? `<script src="menu.v${VERSION}.js?v=${VERSION}"></script>` : ''); first = false; }
  out = out.replace(/<!doctype html>/i, s => s + '\n<!-- Built by tools/build-v19.js from index.src.html. Edit the source files, then run the build again. -->');
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  console.log('menu:', scripts.length, 'scripts →', fs.statSync(path.join(dir, `menu.v${VERSION}.js`)).size, 'bytes JS', esbuild ? '(minified)' : '(not minified)');
}
