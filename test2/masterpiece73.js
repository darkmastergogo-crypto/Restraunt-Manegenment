/* SHOI Restaurant OS — Release 73 shell enhancement.
   Visual/interaction only: uses existing buttons and switchTab handlers. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const body = document.body;
  if (!body || !body.classList.contains('staff-site')) return;
  body.dataset.ui73 = 'atelier';

  const nav = $('managerNav');
  const title = document.querySelector('body.staff-site > header .header-left > h1');
  const navGroups = [
    ['tabLiveBtn', 'Operations'],
    ['tabTablesBtn', 'Service'],
    ['tabMenuBtn', 'Catalog'],
    ['tabManagementBtn', 'System']
  ];

  function addNavLabels() {
    if (!nav || nav.dataset.labels73) return;
    nav.dataset.labels73 = '1';
    for (const [id, label] of navGroups) {
      const anchor = $(id);
      if (!anchor) continue;
      const d = document.createElement('div');
      d.className = 'shoi73-nav-label';
      d.textContent = label;
      nav.insertBefore(d, anchor);
    }
  }

  const quick = [
    ['tabLiveBtn', 'Orders', '◫'],
    ['tabBillingBtn', 'Billing', '₹'],
    ['tabHistoryBtn', 'Records', '↺'],
    ['tabDashboardBtn', 'Insights', '⌁']
  ];

  function buildDock() {
    if ($('shoi73QuickDock')) return;
    const dock = document.createElement('nav');
    dock.id = 'shoi73QuickDock';
    dock.className = 'shoi73-quickdock';
    dock.setAttribute('aria-label', 'Quick workspace');
    for (const [sourceId, label, icon] of quick) {
      const source = $(sourceId);
      if (!source) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.source = sourceId;
      b.innerHTML = `<b aria-hidden="true">${icon}</b><span>${label}</span>`;
      b.addEventListener('click', () => source.click());
      dock.append(b);
    }
    body.append(dock);
    syncDock();
  }

  function activeButton() {
    if (!nav) return null;
    return nav.querySelector('.nav-tab-btn.active,[aria-pressed="true"].nav-tab-btn');
  }

  function cleanLabel(el) {
    if (!el) return '';
    return (el.textContent || '').replace(/\(\d+\)/g, '').replace(/\s+/g, ' ').trim();
  }

  function syncHeader() {
    const active = activeButton();
    if (!active || !title) return;
    const label = cleanLabel(active);
    if (label) title.textContent = label;
  }

  function syncDock() {
    const dock = $('shoi73QuickDock');
    if (!dock) return;
    for (const b of dock.querySelectorAll('button[data-source]')) {
      const source = $(b.dataset.source);
      const hidden = !source || source.hidden || source.offsetParent === null && nav && nav.hidden;
      b.hidden = !!hidden;
      b.classList.toggle('active', !!source?.classList.contains('active') || source?.getAttribute('aria-pressed') === 'true');
      b.setAttribute('aria-current', b.classList.contains('active') ? 'page' : 'false');
    }
  }

  function animateVisibleSection() {
    const main = $('staffMain');
    if (!main) return;
    const section = [...main.children].find(el => el.tagName === 'SECTION' && !el.hidden && getComputedStyle(el).display !== 'none');
    if (!section) return;
    section.style.animation = 'none';
    void section.offsetWidth;
    section.style.animation = '';
  }

  function syncAll() {
    syncHeader();
    syncDock();
    animateVisibleSection();
  }

  addNavLabels();
  buildDock();
  syncAll();

  if (nav && 'MutationObserver' in window) {
    new MutationObserver(syncAll).observe(nav, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'hidden', 'aria-pressed'] });
  }
  const main = $('staffMain');
  if (main && 'MutationObserver' in window) {
    new MutationObserver(() => requestAnimationFrame(syncAll)).observe(main, { attributes: true, subtree: true, attributeFilter: ['hidden', 'class'] });
  }

  // Keep the existing implementation authoritative; only add the UI sync afterward.
  if (typeof window.switchTab === 'function' && !window.switchTab.__shoi73) {
    const original = window.switchTab;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      requestAnimationFrame(syncAll);
      return result;
    };
    wrapped.__shoi73 = true;
    window.switchTab = wrapped;
  }

  window.addEventListener('resize', syncDock, { passive: true });
})();
