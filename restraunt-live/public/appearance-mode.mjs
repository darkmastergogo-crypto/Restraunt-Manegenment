// Presentation only. Preferences are scoped to this origin and restaurant, never server credentials.
export const APPEARANCE_MODES = ['restaurant', 'light', 'dark', 'system'];
export const LIGHT_PALETTE = Object.freeze({background:'#f7f4ef',surface:'#fffdf9',raised:'#eee9e1',text:'#262521',muted:'#67635c',accent:'#a44e31',accentText:'#fffaf5',border:'#ded8cf',danger:'#b64239',success:'#27795d'});
export const DARK_PALETTE = Object.freeze({background:'#171614',surface:'#211f1c',raised:'#2c2925',text:'#f4ede3',muted:'#c0b6a8',accent:'#e7a88a',accentText:'#241711',border:'#514a41',danger:'#ffafa5',success:'#92d4ad'});
function channels(hex) {
 if (!String(hex||'').startsWith('#')) return null;
 const v=String(hex).slice(1);
 if(!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(v)) return null;
 return (v.length===3?[...v].map(x=>x+x):[v.slice(0,2),v.slice(2,4),v.slice(4,6)]).map(x=>parseInt(x,16)/255);
}
export function isDarkColor(hex) {const rgb=channels(hex);return rgb ? rgb.reduce((n,x,i)=>n+x*[.299,.587,.114][i],0)<.62:false;}
export function contrast(a,b) {
 const lum=h=>(channels(h)||[0,0,0]).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function resolveAppearance(theme={}, mode='restaurant', systemDark=false) {
 if(!APPEARANCE_MODES.includes(mode))mode='restaurant';
 const dark=mode==='restaurant'?isDarkColor(theme.background):mode==='dark'||(mode==='system'&&systemDark);
 const palette={...(dark?DARK_PALETTE:LIGHT_PALETTE)};
 if(mode==='restaurant') {
  for(const key of Object.keys(palette))if(channels(theme[key]))palette[key]=theme[key];
 } else if(channels(theme.accent)&&['background','surface','raised'].every(k=>contrast(theme.accent,palette[k])>=4.5)) {
  palette.accent=theme.accent;
  palette.accentText=contrast(theme.accent,'#fffaf5')>=contrast(theme.accent,'#241711')?'#fffaf5':'#241711';
 }
 return {mode,dark,palette};
}
export function loadAppearance(storage,key) {try{const m=storage.getItem(key);return APPEARANCE_MODES.includes(m)?m:'restaurant';}catch{return 'restaurant';}}
export function saveAppearance(storage,key,mode) {if(!APPEARANCE_MODES.includes(mode))return false;try{storage.setItem(key,mode);return true;}catch{return false;}}
