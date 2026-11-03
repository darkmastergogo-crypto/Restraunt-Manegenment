/* Admin-managed payment QR for receipts. Uses the existing shared customization RPC
   and image upload path, keeping payment artwork out of the database payload. */
'use strict';
window.PaymentQrSettings = (() => {
  const $ = id => document.getElementById(id);
  let imageUrl = '';
  let busy = false;
  const status = text => { const node = $('paymentQrStatus'); if (node) node.textContent = text; };
  function paintPreview(url) {
    const root = $('paymentQrPreview');
    if (!root) return;
    root.replaceChildren();
    const safe = window.Cloud?.safeImage(url || '');
    if (!safe) { root.textContent = 'No payment QR configured.'; return; }
    const img = document.createElement('img');
    img.src = safe; img.alt = 'Configured payment QR'; img.decoding = 'async';
    const caption = document.createElement('span'); caption.textContent = 'Preview · image proportions preserved';
    root.append(img, caption);
  }
  async function load() {
    const panel = $('paymentQrPanel');
    if (!panel || typeof staffRole === 'undefined' || staffRole !== 'admin') return;
    panel.hidden = false;
    try {
      const settings = await window.Custom48.sync(true);
      const bill = settings?.bill || {};
      imageUrl = window.Cloud.safeImage(bill.paymentQr || '');
      $('paymentQrCaption').value = String(bill.paymentQrCaption ?? 'Scan to pay').slice(0, 80);
      $('paymentQrEnabled').checked = bill.paymentQrEnabled !== false;
      $('paymentQrOnlyOnline').checked = bill.paymentQrOnlyOnline !== false;
      paintPreview(imageUrl);
      status(imageUrl ? 'Payment QR loaded.' : 'Upload a bank or UPI QR image, then save.');
    } catch (error) {
      status('Could not load payment QR settings: ' + error.message);
    }
  }
  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that image.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const input = event.target;
    input.disabled = true;
    status('Checking QR image…');
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG or WebP QR image.');
      if (file.size > 1_000_000) throw new Error('Choose a QR image under 1 MB so it can be stored without lossy compression.');
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width, height = bitmap.height;
      bitmap.close();
      if (width < 128 || height < 128) throw new Error('Choose a larger QR image (at least 128 × 128 pixels).');
      if (Math.max(width / height, height / width) > 2) throw new Error('This image looks unusually narrow. Choose the full QR image, without cropping.');
      const data = await readDataUrl(file);
      imageUrl = await window.Cloud.uploadMenuImage(data);
      paintPreview(imageUrl);
      status('QR image uploaded in its original format. Save to use it on bills.');
    } catch (error) {
      status(error.message || 'QR image upload failed.');
    } finally {
      input.disabled = false;
      input.value = '';
    }
  }
  async function save(event) {
    event?.preventDefault();
    if (busy) return;
    if (typeof staffRole === 'undefined' || staffRole !== 'admin') { status('Only an administrator can change bill QR settings.'); return; }
    const button = $('paymentQrSave');
    busy = true; button.disabled = true; status('Saving payment QR settings…');
    try {
      await window.Custom48.sync(true);
      await window.Custom48.patchBill({
        paymentQr: window.Cloud.safeImage(imageUrl),
        paymentQrCaption: $('paymentQrCaption').value.trim().slice(0, 80) || 'Scan to pay',
        paymentQrEnabled: $('paymentQrEnabled').checked,
        paymentQrOnlyOnline: $('paymentQrOnlyOnline').checked
      });
      status('Payment QR settings saved. New bills and receipt previews will use this setup.');
    } catch (error) {
      status('Not saved: ' + error.message);
    } finally {
      busy = false; button.disabled = false;
    }
  }
  function remove() {
    imageUrl = '';
    paintPreview('');
    status('QR image removed from this draft. Save to apply the change.');
  }
  document.addEventListener('change', event => { if (event.target?.id === 'paymentQrFile') void upload(event); });
  document.addEventListener('click', event => { if (event.target?.id === 'paymentQrRemove') remove(); });
  return { load, save };
})();
