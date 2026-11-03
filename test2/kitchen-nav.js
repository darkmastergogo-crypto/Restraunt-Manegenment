/* Mobile hamburger toggle for the kitchen/admin nav-tabs row.
   Purely additive: it only shows/hides an existing nav and mirrors its
   "hidden" state onto the toggle button. Never touches sign-in or
   tab-switching logic, which already works via switchTab(). */
(function () {
  function $(id) { return document.getElementById(id); }

  var toggle = $('kitchenNavToggle');
  var nav = $('managerNav');
  var overlay = $('kitchenNavOverlay');
  if (!toggle || !nav || !overlay) return;

  function closeDrawer() {
    nav.classList.remove('open');
    overlay.classList.remove('open');
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function openDrawer() {
    nav.classList.add('open');
    overlay.classList.add('open');
    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  toggle.addEventListener('click', function () {
    if (nav.classList.contains('open')) closeDrawer(); else openDrawer();
  });
  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDrawer();
  });
  // Close the drawer once a nav tab is actually chosen.
  nav.addEventListener('click', function (e) {
    if (e.target.closest('.nav-tab-btn')) closeDrawer();
  });

  // The existing sign-in flow toggles managerNav's [hidden] attribute;
  // mirror that onto the hamburger button without touching that code.
  function syncVisibility() {
    toggle.classList.toggle('nav-toggle-hidden', nav.hidden);
    if (nav.hidden) closeDrawer();
  }
  syncVisibility();
  if ('MutationObserver' in window) {
    new MutationObserver(syncVisibility).observe(nav, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
