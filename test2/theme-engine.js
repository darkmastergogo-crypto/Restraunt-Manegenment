/* Theme engine — 20 complete looks for the customer menu, kitchen/admin and waiter app.
   The admin picks one in Management → Themes; it is saved with the shared customization
   (restaurant_custom48.settings.theme) so every screen switches together.
   Loaded synchronously in <head> so the saved theme paints before the page appears. */
(function(){
'use strict';
const F=(family,fallback)=>`'${family}', ${fallback}`;
const SERIF='Georgia, "Times New Roman", serif',SANS='Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// Google Fonts families (CSS2 API). Only the active theme's fonts are requested.
const FONTS={
 'Fraunces':'Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700','Plus Jakarta Sans':'Plus+Jakarta+Sans:wght@400;500;600;700;800',
 'Cormorant Garamond':'Cormorant+Garamond:wght@500;600;700','Manrope':'Manrope:wght@400;500;600;700;800','Playfair Display':'Playfair+Display:wght@500;600;700;800',
 'Inter':'Inter:wght@400;500;600;700;800','Fredoka':'Fredoka:wght@400;500;600;700','Nunito':'Nunito:wght@400;600;700;800','Space Grotesk':'Space+Grotesk:wght@400;500;600;700',
 'DM Serif Display':'DM+Serif+Display','Cinzel':'Cinzel:wght@500;600;700','Lora':'Lora:wght@400;500;600;700','Archivo Black':'Archivo+Black','Sora':'Sora:wght@400;500;600;700',
 'Instrument Serif':'Instrument+Serif:ital@0;1','Poppins':'Poppins:wght@400;500;600;700;800','Outfit':'Outfit:wght@400;500;600;700;800','Oswald':'Oswald:wght@400;500;600;700',
 'Righteous':'Righteous','Unbounded':'Unbounded:wght@500;600;700'
};
const fallbackFor=f=>/Fraunces|Cormorant|Playfair|DM Serif|Cinzel|Lora|Instrument/.test(f)?SERIF:SANS;
/* Each theme: scheme (light/dark), fonts, palette and four structural choices:
   surface  elevated | outlined | hairline | glass | brutal   (how cards and panels are built)
   hero     split | poster | minimal | banner                 (customer menu header block)
   chips    pill | underline | boxed                          (category navigation)
   corners  number in px                                      (base radius)            */
const THEMES={
 'royal-momo':{name:'Royal Momo',note:'Warm cream, momo red, refined serif',scheme:'light',display:'Fraunces',body:'Plus Jakarta Sans',surface:'elevated',hero:'split',chips:'pill',corners:20,
  c:{bg:'#FBF7F2',bg2:'#F4ECE2',surface:'#FFFFFF',surface2:'#FFF8F1',ink:'#231815',ink2:'#6E5E57',line:'#EADFD3',accent:'#C8102E',accent2:'#F2A541',onAccent:'#FFFFFF',heroBg:'linear-gradient(135deg,#FFF1E8 0%,#FFE1D6 100%)',heroInk:'#5A0F1B'}},
 'obsidian-gold':{name:'Obsidian Gold',note:'Black lacquer, gold leaf, fine dining',scheme:'dark',display:'Cormorant Garamond',body:'Manrope',surface:'outlined',hero:'poster',chips:'underline',corners:6,
  c:{bg:'#0B0B0C',bg2:'#121214',surface:'#151517',surface2:'#1C1C1F',ink:'#F4EFE6',ink2:'#A39C8F',line:'#2A2826',accent:'#D4AF37',accent2:'#8C6D1F',onAccent:'#0B0B0C',heroBg:'radial-gradient(120% 120% at 80% 0%,#2A2213 0%,#0B0B0C 60%)',heroInk:'#F4EFE6'}},
 'ivory-bistro':{name:'Ivory Bistro',note:'Paper menu, forest green, Parisian',scheme:'light',display:'Playfair Display',body:'Lora',surface:'hairline',hero:'minimal',chips:'underline',corners:2,
  c:{bg:'#F6F1E7',bg2:'#EFE8DA',surface:'#FBF8F1',surface2:'#F3EDE0',ink:'#1F2A22',ink2:'#5F6B60',line:'#D8CFBD',accent:'#2F5D3A',accent2:'#A8452F',onAccent:'#FBF8F1',heroBg:'#F6F1E7',heroInk:'#1F2A22'}},
 'sakura-bloom':{name:'Sakura Bloom',note:'Soft pink, pillowy, playful',scheme:'light',display:'Fredoka',body:'Nunito',surface:'elevated',hero:'banner',chips:'pill',corners:26,
  c:{bg:'#FFF6F8',bg2:'#FFE9EF',surface:'#FFFFFF',surface2:'#FFF0F4',ink:'#3B1F2B',ink2:'#8A6574',line:'#F6D5DF',accent:'#E0567F',accent2:'#7FC8A9',onAccent:'#FFFFFF',heroBg:'linear-gradient(120deg,#FFD6E2 0%,#FFE9D6 100%)',heroInk:'#5B1E36'}},
 'midnight-neon':{name:'Midnight Neon',note:'Navy night, cyan + magenta glow',scheme:'dark',display:'Space Grotesk',body:'Space Grotesk',surface:'glass',hero:'poster',chips:'boxed',corners:14,upper:true,
  c:{bg:'#070B16',bg2:'#0C1224',surface:'rgba(20,28,56,.72)',surface2:'#141C38',ink:'#E8F1FF',ink2:'#8EA0C6',line:'rgba(120,150,255,.18)',accent:'#22D3EE',accent2:'#F472B6',onAccent:'#041018',heroBg:'radial-gradient(80% 120% at 10% 0%,rgba(34,211,238,.35),transparent 60%),radial-gradient(70% 100% at 100% 100%,rgba(244,114,182,.35),transparent 60%),#070B16',heroInk:'#E8F1FF'}},
 'terracotta-clay':{name:'Terracotta Clay',note:'Earthy clay, sunbaked warmth',scheme:'light',display:'DM Serif Display',body:'Manrope',surface:'elevated',hero:'split',chips:'boxed',corners:14,
  c:{bg:'#F3E7DC',bg2:'#EBDACB',surface:'#FBF4EE',surface2:'#F6EBE1',ink:'#3A2219',ink2:'#7D5E50',line:'#E1CBBA',accent:'#C2552D',accent2:'#6B8F71',onAccent:'#FFFFFF',heroBg:'linear-gradient(135deg,#E9C9B2,#F3E1D2)',heroInk:'#4A2617'}},
 'nordic-frost':{name:'Nordic Frost',note:'Clean white, cobalt, Scandinavian',scheme:'light',display:'Inter',body:'Inter',surface:'outlined',hero:'minimal',chips:'pill',corners:10,
  c:{bg:'#F7F9FB',bg2:'#EEF2F6',surface:'#FFFFFF',surface2:'#F4F7FA',ink:'#0F172A',ink2:'#5B6577',line:'#E2E8F0',accent:'#2563EB',accent2:'#0EA5E9',onAccent:'#FFFFFF',heroBg:'#F7F9FB',heroInk:'#0F172A'}},
 'emerald-velvet':{name:'Emerald Velvet',note:'Deep emerald, antique gold',scheme:'dark',display:'Playfair Display',body:'Manrope',surface:'outlined',hero:'split',chips:'underline',corners:12,
  c:{bg:'#0C1B15',bg2:'#10231B',surface:'#132A20',surface2:'#183326',ink:'#EFE9DA',ink2:'#A7B5A6',line:'#24402F',accent:'#C9A45C',accent2:'#6FB08C',onAccent:'#0C1B15',heroBg:'linear-gradient(135deg,#14352A,#0C1B15)',heroInk:'#EFE9DA'}},
 'maharaja':{name:'Maharaja',note:'Royal maroon, saffron and gold',scheme:'light',display:'Cinzel',body:'Lora',surface:'outlined',hero:'banner',chips:'boxed',corners:4,
  c:{bg:'#FFF8EC',bg2:'#F8EBD3',surface:'#FFFCF5',surface2:'#FCF1DE',ink:'#3B0A14',ink2:'#7A4B4F',line:'#E9D3AE',accent:'#8E1B2C',accent2:'#D19A2E',onAccent:'#FFF8EC',heroBg:'linear-gradient(135deg,#7A1424 0%,#3B0A14 100%)',heroInk:'#FCE7BE'}},
 'street-pop':{name:'Street Pop',note:'Bold yellow, black ink, brutalist',scheme:'light',display:'Archivo Black',body:'Inter',surface:'brutal',hero:'banner',chips:'boxed',corners:4,upper:true,
  c:{bg:'#FFE14D',bg2:'#FFD21F',surface:'#FFFFFF',surface2:'#FFF7CC',ink:'#111111',ink2:'#3D3D3D',line:'#111111',accent:'#111111',accent2:'#FF3B30',onAccent:'#FFE14D',heroBg:'#111111',heroInk:'#FFE14D'}},
 'ocean-breeze':{name:'Ocean Breeze',note:'Teal water, sandy calm',scheme:'light',display:'Sora',body:'Sora',surface:'elevated',hero:'split',chips:'pill',corners:18,
  c:{bg:'#F1FAF9',bg2:'#E3F4F2',surface:'#FFFFFF',surface2:'#F2FBFA',ink:'#0B2B2E',ink2:'#557477',line:'#D3ECE9',accent:'#0E9F9A',accent2:'#F4A259',onAccent:'#FFFFFF',heroBg:'linear-gradient(135deg,#D5F3EF 0%,#FFF1DE 100%)',heroInk:'#0B3B3E'}},
 'editorial-mono':{name:'Editorial Mono',note:'Black and white magazine',scheme:'light',display:'Instrument Serif',body:'Inter',surface:'hairline',hero:'minimal',chips:'underline',corners:0,
  c:{bg:'#FFFFFF',bg2:'#F5F5F5',surface:'#FFFFFF',surface2:'#FAFAFA',ink:'#0A0A0A',ink2:'#5C5C5C',line:'#0A0A0A',accent:'#0A0A0A',accent2:'#E4002B',onAccent:'#FFFFFF',heroBg:'#FFFFFF',heroInk:'#0A0A0A'}},
 'cafe-mocha':{name:'Café Mocha',note:'Coffee browns, cosy corner',scheme:'light',display:'Lora',body:'Nunito',surface:'elevated',hero:'split',chips:'pill',corners:16,
  c:{bg:'#EFE6DD',bg2:'#E6D9CC',surface:'#FAF5F0',surface2:'#F3EAE1',ink:'#3E2723',ink2:'#7B5E57',line:'#DDCBBB',accent:'#6F4E37',accent2:'#C08552',onAccent:'#FFFFFF',heroBg:'linear-gradient(135deg,#D9C2AE,#EFE2D5)',heroInk:'#3E2723'}},
 'citrus-fresh':{name:'Citrus Fresh',note:'Lime and orange, juicy bright',scheme:'light',display:'Poppins',body:'Poppins',surface:'elevated',hero:'banner',chips:'pill',corners:24,
  c:{bg:'#FAFFF3',bg2:'#F0FADF',surface:'#FFFFFF',surface2:'#F7FDEB',ink:'#1C2B0B',ink2:'#5E6E4C',line:'#E3F1CC',accent:'#4D9A0F',accent2:'#F97316',onAccent:'#FFFFFF',heroBg:'linear-gradient(120deg,#C8F06B 0%,#FFD166 100%)',heroInk:'#1C2B0B'}},
 'lavender-haze':{name:'Lavender Haze',note:'Violet pastels, frosted glass',scheme:'light',display:'Outfit',body:'Outfit',surface:'glass',hero:'banner',chips:'pill',corners:22,
  c:{bg:'#F5F3FF',bg2:'#ECE7FF',surface:'rgba(255,255,255,.72)',surface2:'#F8F6FF',ink:'#24164A',ink2:'#6F6390',line:'rgba(124,58,237,.16)',accent:'#7C3AED',accent2:'#EC4899',onAccent:'#FFFFFF',heroBg:'radial-gradient(60% 90% at 0% 0%,#D8C8FF,transparent 70%),radial-gradient(60% 90% at 100% 100%,#FFD1EA,transparent 70%),#F5F3FF',heroInk:'#24164A'}},
 'charcoal-ember':{name:'Charcoal Ember',note:'Smoky grill, glowing ember',scheme:'dark',display:'Oswald',body:'Inter',surface:'outlined',hero:'poster',chips:'boxed',corners:8,upper:true,
  c:{bg:'#141210',bg2:'#1B1815',surface:'#211E1B',surface2:'#2A2622',ink:'#F5EEE6',ink2:'#A99D90',line:'#36302A',accent:'#F97316',accent2:'#FACC15',onAccent:'#141210',heroBg:'radial-gradient(90% 120% at 90% 10%,rgba(249,115,22,.35),transparent 55%),#141210',heroInk:'#F5EEE6'}},
 'desert-dune':{name:'Desert Dune',note:'Sand, burnt orange, slow luxury',scheme:'light',display:'Cormorant Garamond',body:'Manrope',surface:'hairline',hero:'split',chips:'underline',corners:2,
  c:{bg:'#F4EBDD',bg2:'#EADDC9',surface:'#F9F3E9',surface2:'#F1E6D5',ink:'#3A2E22',ink2:'#7A6A58',line:'#D9C7AC',accent:'#B5651D',accent2:'#5E7A6E',onAccent:'#FFFFFF',heroBg:'linear-gradient(180deg,#EED9BC,#F4EBDD)',heroInk:'#3A2E22'}},
 'matcha-zen':{name:'Matcha Zen',note:'Matcha green, washi calm',scheme:'light',display:'Fraunces',body:'Inter',surface:'outlined',hero:'minimal',chips:'pill',corners:8,
  c:{bg:'#F2F0E6',bg2:'#E9E6D7',surface:'#FAF9F2',surface2:'#F1EFE3',ink:'#2B2B22',ink2:'#6C6B5B',line:'#DCD9C6',accent:'#5B7B3A',accent2:'#B4573C',onAccent:'#FFFFFF',heroBg:'#F2F0E6',heroInk:'#2B2B22'}},
 'retro-diner':{name:'Retro Diner',note:'50s cherry red and teal',scheme:'light',display:'Righteous',body:'Nunito',surface:'brutal',hero:'banner',chips:'pill',corners:18,
  c:{bg:'#FDF6E3',bg2:'#F7EBCB',surface:'#FFFDF6',surface2:'#FBF2DA',ink:'#2B1B17',ink2:'#6E5A4E',line:'#2B1B17',accent:'#D62828',accent2:'#2A9D8F',onAccent:'#FFFFFF',heroBg:'repeating-linear-gradient(45deg,#2A9D8F 0 18px,#268F82 18px 36px)',heroInk:'#FFFDF6'}},
 'aurora-glass':{name:'Aurora Glass',note:'Night sky aurora, glassmorphism',scheme:'dark',display:'Unbounded',body:'Sora',surface:'glass',hero:'poster',chips:'pill',corners:22,
  c:{bg:'#0B1026',bg2:'#10173A',surface:'rgba(255,255,255,.07)',surface2:'rgba(255,255,255,.1)',ink:'#EEF0FF',ink2:'#A3A9D1',line:'rgba(255,255,255,.12)',accent:'#8B5CF6',accent2:'#06B6D4',onAccent:'#FFFFFF',heroBg:'radial-gradient(70% 100% at 15% 0%,rgba(139,92,246,.55),transparent 60%),radial-gradient(70% 100% at 90% 30%,rgba(6,182,212,.45),transparent 60%),#0B1026',heroInk:'#FFFFFF'}}
};
const DEFAULT='royal-momo',CACHE='YUMMY_THEME_v66';
const hex=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(String(h||'').trim());return m?m[1]:null;};
function mix(a,b,t){const A=hex(a),B=hex(b);if(!A||!B)return a;const p=s=>[0,2,4].map(i=>parseInt(s.slice(i,i+2),16));const x=p(A),y=p(B);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');}
function contrastInk(bg){const h=hex(bg);if(!h)return '#FFFFFF';const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return (0.2126*r+0.7152*g+0.0722*b)>0.45?'#111111':'#FFFFFF';}
function resolve(id,tweaks={}){
 const base=THEMES[id]||THEMES[DEFAULT],t=tweaks&&typeof tweaks==='object'?tweaks:{};
 const c={...base.c};
 if(hex(t.accent)){c.accent='#'+hex(t.accent);c.onAccent=contrastInk(c.accent);}
 const display=FONTS[t.display]?t.display:base.display,body=FONTS[t.body]?t.body:base.body;
 const corners=Number.isFinite(Number(t.corners))&&t.corners!==''&&t.corners!==null?Math.max(0,Math.min(32,Number(t.corners))):base.corners;
 const surface=['elevated','outlined','hairline','glass','brutal'].includes(t.surface)?t.surface:base.surface;
 const hero=['split','poster','minimal','banner'].includes(t.hero)?t.hero:base.hero;
 const chips=['pill','underline','boxed'].includes(t.chips)?t.chips:base.chips;
 const density=['compact','comfortable','spacious'].includes(t.density)?t.density:'comfortable';
 return {id:THEMES[id]?id:DEFAULT,base,c,display,body,corners,surface,hero,chips,density,upper:!!base.upper};
}
function cssVars(r){
 const c=r.c,dark=r.base.scheme==='dark',soft=hex(c.accent)&&hex(c.surface2)?mix(c.surface2,c.accent,dark?.22:.12):c.surface2;
 return {
  '--bg':c.bg,'--bg-2':c.bg2,'--surface':c.surface,'--surface-2':c.surface2,'--ink':c.ink,'--ink-2':c.ink2,'--line':c.line,
  '--accent':c.accent,'--accent-2':c.accent2,'--on-accent':c.onAccent,'--accent-soft':soft,'--hero-bg':c.heroBg,'--hero-ink':c.heroInk,
  '--font-display':F(r.display,fallbackFor(r.display)),'--font-body':F(r.body,fallbackFor(r.body)),
  '--r':r.corners+'px','--r-sm':Math.max(0,Math.round(r.corners*.6))+'px','--r-lg':Math.round(r.corners*1.4)+'px',
  '--display-transform':r.upper?'uppercase':'none','--display-tracking':r.upper?'.02em':'-.015em',
  '--veg':dark?'#3DD68C':'#138A4B','--nonveg':dark?'#FF6B5E':'#C0362C','--warn':'#E8A317',
  // Legacy names used by older stylesheets on the kitchen and waiter screens.
  '--red':c.accent,'--primary':c.accent,'--primary-soft':soft,'--soft':soft,'--muted':c.ink2,'--border':c.line,'--card-bg':c.surface,
  '--text-main':c.ink,'--text-muted':c.ink2,'--surface-alt':c.surface2,'--shadow-sm':dark?'0 1px 2px rgba(0,0,0,.4)':'0 1px 2px rgba(24,16,8,.06),0 2px 8px rgba(24,16,8,.05)',
  // Private copies: older staff stylesheets redefine --bg/--surface/... on <body>, these names are never touched.
  '--t-bg':c.bg,'--t-bg-2':c.bg2,'--t-surface':c.surface,'--t-surface-2':c.surface2,'--t-ink':c.ink,'--t-ink-2':c.ink2,'--t-line':c.line,
  '--t-accent':c.accent,'--t-accent-2':c.accent2,'--t-on-accent':c.onAccent,'--t-accent-soft':soft
 };
}
let fontLink=null,current=null;
function loadFonts(r){
 const fams=[...new Set([r.display,r.body])].map(f=>FONTS[f]).filter(Boolean);if(!fams.length)return;
 const href='https://fonts.googleapis.com/css2?'+fams.map(f=>'family='+f).join('&')+'&display=swap';
 if(fontLink&&fontLink.href===href)return;
 if(!fontLink){fontLink=document.createElement('link');fontLink.rel='stylesheet';fontLink.dataset.themeFonts='';(document.head||document.documentElement).append(fontLink);}
 fontLink.href=href;
}
function apply(id,tweaks){
 const r=resolve(id,tweaks),root=document.documentElement,vars=cssVars(r);
 for(const [k,v]of Object.entries(vars))root.style.setProperty(k,v);
 Object.assign(root.dataset,{theme:r.id,scheme:r.base.scheme,surface:r.surface,hero:r.hero,chips:r.chips,density:r.density});
 root.style.colorScheme=r.base.scheme;
 const meta=document.querySelector('meta[name="theme-color"]');if(meta&&hex(r.c.bg))meta.content=r.c.bg;
 loadFonts(r);current={id:r.id,tweaks:tweaks||{}};
 try{localStorage.setItem(CACHE,JSON.stringify(current));}catch{}
 document.dispatchEvent(new CustomEvent('themechange',{detail:{id:r.id}}));
 return r;
}
function fromSettings(s){if(!s)return;const id=s.theme||DEFAULT,tw=s.themeTweaks||{};if(current&&current.id===id&&JSON.stringify(current.tweaks)===JSON.stringify(tw))return;apply(id,tw);}
// Paint the cached theme immediately (no flash), then Custom48 confirms it from the database.
try{const saved=JSON.parse(localStorage.getItem(CACHE)||'null');apply(saved?.id||DEFAULT,saved?.tweaks||{});}catch{apply(DEFAULT,{});}

/* ---------------- Admin theme studio (kitchen.html → Management) ---------------- */
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function card(id,t,active){const c=t.c;return `<button type="button" class="ts-card${active?' is-active':''}" data-theme-pick="${id}" aria-pressed="${active}" style="--p-bg:${c.bg};--p-surface:${/rgba/.test(c.surface)?c.surface2:c.surface};--p-ink:${c.ink};--p-ink2:${c.ink2};--p-accent:${c.accent};--p-accent2:${c.accent2};--p-on:${c.onAccent};--p-hero:${c.heroBg};--p-line:${c.line};--p-r:${Math.min(t.corners,18)}px;--p-display:${esc(F(t.display,fallbackFor(t.display)))}">
 <span class="ts-preview" aria-hidden="true"><span class="ts-hero"><span class="ts-title">${esc(t.name.split(' ')[0])}</span></span><span class="ts-row"><span class="ts-dish"></span><span class="ts-lines"><i></i><i></i></span><span class="ts-add">ADD</span></span><span class="ts-row"><span class="ts-dish"></span><span class="ts-lines"><i></i><i></i></span><span class="ts-add">ADD</span></span></span>
 <span class="ts-meta"><strong>${esc(t.name)}</strong><small>${esc(t.note)}</small><span class="ts-tags"><em>${t.scheme==='dark'?'Dark':'Light'}</em><em>${esc(t.display)}</em></span></span>${active?'<span class="ts-check" aria-hidden="true">✓ Active</span>':''}</button>`;}
const fontOptions=sel=>`<option value="">Theme default</option>`+Object.keys(FONTS).map(f=>`<option value="${esc(f)}"${f===sel?' selected':''}>${esc(f)}</option>`).join('');
const opt=(list,sel)=>`<option value="">Theme default</option>`+list.map(([v,l])=>`<option value="${v}"${v===sel?' selected':''}>${l}</option>`).join('');
let studioBusy=false;
function renderStudio(){
 const root=document.getElementById('themeStudio');if(!root||!window.Custom48)return;
 const isAdmin=typeof staffRole!=='undefined'&&staffRole==='admin';root.hidden=!isAdmin;if(!isAdmin)return;
 const s=window.Custom48.get()||{},active=THEMES[s.theme]?s.theme:DEFAULT,tw=s.themeTweaks||{};
 root.innerHTML=`<div class="ts-head"><div><p class="ts-eyebrow">Appearance</p><h3>Themes</h3><p class="hint">One click changes the customer menu, kitchen/admin and waiter app on every device. Changes go live within a few seconds.</p></div><p class="ts-status" id="themeStudioStatus" role="status"></p></div>
 <div class="ts-grid" role="list">${Object.entries(THEMES).map(([id,t])=>card(id,t,id===active)).join('')}</div>
 <details class="ts-tweaks"${Object.keys(tw).length?' open':''}><summary>Fine-tune this theme</summary>
  <div class="ts-tweak-grid">
   <label>Accent colour<span class="ts-color"><input type="color" id="tsAccent" value="${hex(tw.accent)?'#'+hex(tw.accent):(THEMES[active].c.accent)}"><button type="button" class="secondary-btn" data-ts-clear="accent">Default</button></span></label>
   <label>Heading font<select id="tsDisplay">${fontOptions(tw.display)}</select></label>
   <label>Body font<select id="tsBody">${fontOptions(tw.body)}</select></label>
   <label>Corner roundness<select id="tsCorners">${opt([['0','Sharp'],['6','Subtle'],['14','Soft'],['22','Round'],['30','Extra round']],tw.corners===undefined?'':String(tw.corners))}</select></label>
   <label>Card style<select id="tsSurface">${opt([['elevated','Floating shadow'],['outlined','Outlined'],['hairline','Editorial lines'],['glass','Frosted glass'],['brutal','Bold block']],tw.surface)}</select></label>
   <label>Menu header<select id="tsHero">${opt([['split','Text + photo'],['poster','Full photo poster'],['banner','Colour banner'],['minimal','Minimal text']],tw.hero)}</select></label>
   <label>Category tabs<select id="tsChips">${opt([['pill','Pills'],['underline','Underline'],['boxed','Boxes']],tw.chips)}</select></label>
   <label>Spacing<select id="tsDensity">${opt([['compact','Compact'],['comfortable','Comfortable'],['spacious','Spacious']],tw.density)}</select></label>
  </div>
  <div class="toolbar"><button type="button" class="primary-btn" id="tsSaveTweaks">Save fine-tuning</button><button type="button" class="secondary-btn" id="tsResetTweaks">Reset to theme default</button></div>
 </details>`;
}
function readTweaks(){const v=id=>document.getElementById(id)?.value||'';const t={};const acc=document.getElementById('tsAccent');if(acc&&acc.dataset.touched)t.accent=acc.value;
 for(const [id,k]of [['tsDisplay','display'],['tsBody','body'],['tsSurface','surface'],['tsHero','hero'],['tsChips','chips'],['tsDensity','density']])if(v(id))t[k]=v(id);
 if(v('tsCorners')!=='')t.corners=Number(v('tsCorners'));return t;}
async function save(changes,message){
 if(studioBusy)return;studioBusy=true;const status=document.getElementById('themeStudioStatus');if(status)status.textContent='Saving…';
 try{await window.Custom48.patch(changes);if(status)status.textContent=message;renderStudio();const st=document.getElementById('themeStudioStatus');if(st)st.textContent=message;}
 catch(e){if(status)status.textContent='Could not save: '+e.message;}finally{studioBusy=false;}
}
document.addEventListener('click',e=>{
 const pick=e.target.closest('[data-theme-pick]');
 if(pick){const id=pick.dataset.themePick;apply(id,{});save({theme:id,themeTweaks:{}},THEMES[id].name+' is now live everywhere.');return;}
 if(e.target.closest('#tsSaveTweaks')){const s=window.Custom48.get();save({themeTweaks:readTweaks()},'Fine-tuning saved.');apply(s.theme,readTweaks());return;}
 if(e.target.closest('#tsResetTweaks')){const s=window.Custom48.get();apply(s.theme,{});save({themeTweaks:{}},'Back to the original theme.');return;}
 const clear=e.target.closest('[data-ts-clear]');if(clear){const acc=document.getElementById('tsAccent');delete acc.dataset.touched;const s=window.Custom48.get();acc.value=(THEMES[s.theme]||THEMES[DEFAULT]).c.accent;apply(s.theme,readTweaks());}
});
document.addEventListener('input',e=>{if(!e.target.closest('#themeStudio .ts-tweaks'))return;if(e.target.id==='tsAccent')e.target.dataset.touched='1';const s=window.Custom48?.get();if(s)apply(s.theme,readTweaks());});
document.addEventListener('change',e=>{if(!e.target.closest('#themeStudio .ts-tweaks'))return;const s=window.Custom48?.get();if(s)apply(s.theme,readTweaks());});
window.ThemeEngine={themes:THEMES,apply,fromSettings,renderStudio,resolve,current:()=>current};
})();
