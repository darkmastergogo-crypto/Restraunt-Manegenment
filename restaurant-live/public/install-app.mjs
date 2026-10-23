// Installation is independent of staff sign-in and notification permission.
// Never cache restaurant data, sessions, API results or QR capabilities.
let promptEvent = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); promptEvent = event;
});
window.addEventListener('appinstalled', () => { promptEvent = null; });
export function installButton() {
  if (window.matchMedia('(display-mode: standalone)').matches) return '';
  return '<button type="button" class="secondary-btn install-app-button" data-action="installApp">Install app</button>';
}
export function setupInstall({screen, isMainAdmin}) {
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = isMainAdmin ? '/owner.webmanifest' :
    screen === 'admin' ? '/kitchen.webmanifest' : screen === 'waiter' ? '/waiter.webmanifest' : '/manifest.webmanifest';
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/push-sw.js', {scope:'/', updateViaCache:'none'}).catch(() => {
      // Installation help remains available. Do not misreport registration success.
    });
  }
}
export async function installApp(modal) {
  if (promptEvent) {
    const event = promptEvent; promptEvent = null;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') return;
  }
  modal(`<h2>Install this restaurant app</h2><p>The installed web app opens in its own window. It uses the same secure sign-in and restaurant permissions as the website.</p>
  <ol><li><strong>Android:</strong> open this HTTPS site in Chrome. Tap ⋮ → Add to home screen → Install. Allow a few seconds after the first visit, then reload if the option is unavailable.</li>
  <li><strong>Windows:</strong> open the site in Chrome or Edge. Use the address-bar install icon, or the browser menu → Install app / Apps → Install this site as an app.</li>
  <li><strong>iPhone/iPad:</strong> open in Safari → Share → Add to Home Screen.</li></ol>
  <p>If the browser offers only a shortcut or says it cannot install, the current deployment may be missing the manifest, service worker or icons. Update the site first; some browsers and managed devices also restrict installation.</p>
  <p>This is a progressive web app (PWA), not an APK, EXE or app-store download. Internet is required for orders and requests. Installing does not automatically turn on notifications: staff must separately enable Phone notifications and allow them.</p>`);
}
