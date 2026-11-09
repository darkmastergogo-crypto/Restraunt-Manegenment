(() => {
  'use strict';
  const [, , slug, page] = location.pathname.split('/');
  if (!slug) return;
  const sessionKey = 'restaurant-platform-session';
  const storage = Storage.prototype;
  const get = storage.getItem;
  const set = storage.setItem;
  const remove = storage.removeItem;
  let user = '';
  try { user = JSON.parse(get.call(localStorage, sessionKey))?.user?.id || ''; } catch {}
  const workspace = ['billing-suite','restaurant-engine.html','staff.html','kitchen.html','waiter.html'].includes(page);
  const scope = 'restaurant:' + slug + ':' + (workspace ? (user || 'signed-out') : 'public') + ':';
  const keyFor = key => key === sessionKey ? key : scope + key;
  storage.getItem = function(key) { return get.call(this, keyFor(key)); };
  storage.setItem = function(key,value) { return set.call(this, keyFor(key), value); };
  storage.removeItem = function(key) { return remove.call(this, keyFor(key)); };
  globalThis.RESTAURANT_PLATFORM = Object.freeze({ slug });
})();
