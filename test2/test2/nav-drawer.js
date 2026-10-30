/* Hamburger drawer for the customer menu page.
   Purely additive: never defines new order/call/song logic, it only
   opens/closes a panel and forwards taps to the existing, already-working
   buttons/functions elsewhere on the page. */
(function () {
  function $(id) { return document.getElementById(id); }

  var toggle = $('navMenuToggle');
  var drawer = $('navDrawer');
  var overlay = $('navDrawerOverlay');
  var closeBtn = $('navDrawerClose');
  if (!toggle || !drawer || !overlay) return;

  function sync() {
    var table = $('tableText');
    if (table && $('navDrawerTable')) $('navDrawerTable').textContent = table.textContent;

    var name = $('restaurantName');
    if (name && $('navDrawerName')) $('navDrawerName').textContent = name.textContent;

    var song = $('requestSongButton');
    var navSong = $('navSongRequest');
    if (navSong) navSong.hidden = !song || song.hidden;
    if (song && navSong) navSong.disabled = song.disabled;

    var callBtn = $('callWaiterButton');
    var navCall = $('navCallWaiter');
    if (callBtn && navCall) navCall.disabled = callBtn.disabled;

    var creditText = $('systemFooterCredit');
    var creditLink = $('systemFooterLink');
    var foot = $('navDrawerFoot');
    if (foot) {
      if (creditText && !creditText.hidden) {
        foot.hidden = false;
        if (creditLink && $('navDrawerCreditLink')) {
          $('navDrawerCreditLink').href = creditLink.getAttribute('href') || '#';
          $('navDrawerCreditLink').hidden = creditLink.hidden;
        }
      } else {
        foot.hidden = true;
      }
    }
  }

  function open() {
    sync();
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  toggle.addEventListener('click', function () {
    if (drawer.classList.contains('open')) close(); else open();
  });
  overlay.addEventListener('click', close);
  if (closeBtn) closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });

  function proxyClick(fromId, toId) {
    var btn = $(fromId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      close();
      var target = $(toId);
      if (target) target.click();
    });
  }

  proxyClick('navCallWaiter', 'callWaiterButton');
  proxyClick('navSongRequest', 'requestSongButton');

  var navStatus = $('navOrderStatus');
  if (navStatus) navStatus.addEventListener('click', function () {
    close();
    if (typeof window.openTrackingModal === 'function') window.openTrackingModal();
  });

  var navHistory = $('navOrderHistory');
  if (navHistory) navHistory.addEventListener('click', function () {
    close();
    if (typeof window.openOrderHistory === 'function') window.openOrderHistory();
  });
})();
