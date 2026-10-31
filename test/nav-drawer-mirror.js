/* Mirrors the header's live-sync badge, Call waiter button and signed-in
   account into the hamburger drawer, so they're reachable from there too.
   Purely additive: it only reads/copies state from the real header elements
   and reuses the existing openStaffCall()/<details> account menu — it never
   changes how those already work. Safe to drop if the header controls move. */
(function () {
  function $(id) { return document.getElementById(id); }

  var headerCall = $('headerCallWaiter'), navCall = $('navDrawerCallWaiter');
  var accountRole = $('staffAccountRole'), navRole = $('navDrawerAccountRole');
  var staffAccount = $('staffAccount'), navAccountBtn = $('navDrawerAccount');
  var syncBadge = $('syncBadge'), navSync = $('navDrawerSync');
  var overlay = $('kitchenNavOverlay');
  if (!headerCall || !navCall || !accountRole || !navRole || !staffAccount || !navAccountBtn) return;

  function mirrorAttr(source, target, attr) {
    function sync() { target[attr] = source[attr]; }
    sync();
    if ('MutationObserver' in window) {
      new MutationObserver(sync).observe(source, { attributes: true, attributeFilter: [attr] });
    }
  }
  function mirrorText(source, target) {
    function sync() { target.textContent = source.textContent; }
    sync();
    if ('MutationObserver' in window) {
      new MutationObserver(sync).observe(source, { childList: true, characterData: true, subtree: true });
    }
  }

  mirrorAttr(headerCall, navCall, 'hidden');
  mirrorText(accountRole, navRole);
  if (syncBadge && navSync) mirrorText(syncBadge, navSync);

  function closeDrawer() { if (overlay) overlay.click(); }

  navCall.addEventListener('click', function () {
    closeDrawer();
    if (typeof openStaffCall === 'function') openStaffCall();
  });

  navAccountBtn.addEventListener('click', function () {
    closeDrawer();
    staffAccount.open = true;
    staffAccount.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
})();
