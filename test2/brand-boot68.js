/* Paints the saved restaurant name, tagline and logo the moment the page starts,
   so a changed logo never flashes the old one. Custom48 confirms it from the database. */
(function(){
 var b=null;try{b=JSON.parse(localStorage.getItem('YUMMY_BRAND_v68')||'null');}catch(e){}
 if(!b||!(b.name||b.logo))return;
 if(b.logo&&/^https:\/\//.test(b.logo)){var l=document.createElement('link');l.rel='preload';l.as='image';l.href=b.logo;document.head.appendChild(l);}
 var LOGO='img.brand-logo,img.restaurant-logo,img.hero-logo,img.nav-drawer-logo,img.waiter-gate-logo,.qr-splash-mark img,img[src*="yummy-momo-logo"]';
 var NAME='.staff-brand strong,#restaurantName,#navDrawerName,.side-brand68 b';
 function fix(root){
  if(!root.querySelectorAll)return;
  var imgs=(root.matches&&root.matches(LOGO))?[root]:[];imgs=imgs.concat([].slice.call(root.querySelectorAll(LOGO)));
  for(var i=0;i<imgs.length;i++){var im=imgs[i];if(!b.logo||im.dataset.brandBoot)continue;im.dataset.brandBoot='1';if(!im.dataset.brandOrig)im.dataset.brandOrig=im.getAttribute('src')||'';im.setAttribute('src',b.logo);}
  var names=(root.matches&&root.matches(NAME))?[root]:[];names=names.concat([].slice.call(root.querySelectorAll(NAME)));
  for(var j=0;j<names.length;j++){if(b.name&&!names[j].dataset.brandBoot){names[j].dataset.brandBoot='1';names[j].textContent=b.name;}}
  var caps=root.querySelectorAll('.brand-caption,.side-brand68 small');for(var k=0;k<caps.length;k++){if(b.tagline&&!caps[k].dataset.brandBoot){caps[k].dataset.brandBoot='1';caps[k].textContent=b.tagline;}}
 }
 var mo=new MutationObserver(function(list){for(var i=0;i<list.length;i++)for(var j=0;j<list[i].addedNodes.length;j++){var n=list[i].addedNodes[j];if(n.nodeType===1)fix(n);}});
 mo.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('DOMContentLoaded',function(){fix(document);setTimeout(function(){mo.disconnect();},3000);});
 if(b.name){var page=/kitchen\.html/.test(location.pathname)?' · Kitchen & Admin':/waiter\.html/.test(location.pathname)?' · Waiter':' · Menu';document.title=b.name+page;}
})();
